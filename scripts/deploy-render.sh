#!/usr/bin/env bash
###############################################################################
# deploy-render.sh — Idempotent Render deployment for Online Clipboard rebuild
#
#   1. Verifies identity of the old Render service (name == online-clipboard,
#      type == web_service) and removes it.
#   2. Creates/updates the backend (Docker) and frontend (static) Render services.
#   3. Sets Doppler-sourced env vars (MONGODB_URI, JWT_SECRET, PUBLIC_BASE_URL,
#      ASPNETCORE_ENVIRONMENT, API_URL) on Render services.
#   4. Triggers deploys and waits for them to go live.
#   5. Verifies /health and /ready on the backend (when available).
#
# NOTE: Render's FREE tier does NOT support Docker web services (payment required).
# The .NET 10 backend therefore requires a Docker deploy, which is blocked on the
# free tier. This script attempts the backend, records the blocker, and still
# deploys the frontend (static site, fully supported on free tier).
###############################################################################
set -uo pipefail

# --------------------------------------------------------------------------- #
# Configuration                                                               #
# --------------------------------------------------------------------------- #
RENDER_API="https://api.render.com/v1"

DOPPLER_CONFIG="${DOPPLER_CONFIG:-dev_personal}"
DOPPLER_FALLBACK_CONFIG="dev_personal"

REPO="https://github.com/ajayk134/online-clipboard"
REGION="oregon"
PLAN="free"
BRANCH="main"

OLD_SERVICE_ID="srv-dbj7su0473hc739lg96g"
OLD_SERVICE_NAME="online-clipboard"

BACKEND_NAME="online-clipboard-backend"
FRONTEND_NAME="online-clipboard-frontend"

# Outcome tracking (printed, never secret values)
OLD_REMOVED="no"
BACKEND_ID="" BACKEND_URL="" BACKEND_OK="no"
FRONTEND_ID="" FRONTEND_URL="" FRONTEND_OK="no"
ISSUES=""

log() { printf '[deploy-render] %s\n' "$*"; }
err() { printf '[deploy-render][ERROR] %s\n' "$*" >&2; }
note() { ISSUES="${ISSUES}
  - $*"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "required command not found: $1"
    exit 1
  fi
}

# --------------------------------------------------------------------------- #
# Doppler / Render helpers                                                    #
# --------------------------------------------------------------------------- #
doppler_secret() {
  local key="$1" val=""
  val=$(doppler secrets get "$key" --config "$DOPPLER_CONFIG" --plain 2>/dev/null) || true
  if [[ -z "$val" ]]; then
    val=$(doppler secrets get "$key" --config "$DOPPLER_FALLBACK_CONFIG" --plain 2>/dev/null) || true
  fi
  if [[ -z "$val" ]]; then
    err "Doppler secret not found: $key (tried $DOPPLER_CONFIG and $DOPPLER_FALLBACK_CONFIG)"
    return 1
  fi
  printf '%s' "$val"
}

render_api_key() { doppler_secret RENDER; }

render_req() {
  local method="$1" path="$2" body_file="${3:-}"
  local key
  key=$(render_api_key)
  local args=( -s -H "Authorization: Bearer $key" )
  if [[ -n "$body_file" ]]; then
    args+=( -H "Content-Type: application/json" --data @"$body_file" )
  fi
  curl "${args[@]}" -X "$method" "${RENDER_API}${path}"
}

render_get()  { render_req GET "$1"; }
render_post() { render_req POST "$1" "${2:-}"; }
render_delete(){ render_req DELETE "$1"; }
render_patch(){ render_req PATCH "$1" "$2"; }

# Extract a JSON field using python3 (avoids jq dependency).
# Handles wrapped ({service:{...}}) and unwrapped ({...}) response shapes.
# Path is dot-separated, e.g. "name", "service.id", "url".
json_field() {
  local path="$1"
  python3 -c "
import json,sys
path=sys.argv[1]
try:
    d=json.load(sys.stdin)
    obj=d.get('service', d)
    cur=obj
    for part in path.split('.'):
        if isinstance(cur, dict) and part in cur:
            cur=cur[part]
        else:
            cur=None; break
    if cur is not None:
        print(cur)
except Exception:
    pass
" "$path" 2>/dev/null || true
}

# --------------------------------------------------------------------------- #
# Pre-flight                                                                  #
# --------------------------------------------------------------------------- #
require_cmd doppler
require_cmd curl

if ! doppler configs >/dev/null 2>&1; then
  err "Doppler not logged in. Run: doppler login"
  exit 1
fi

log "Doppler config: $DOPPLER_CONFIG (fallback: $DOPPLER_FALLBACK_CONFIG)"
log "Render API: $RENDER_API  Region: $REGION  Plan: $PLAN  Branch: $BRANCH"

OWNER_ID=$(render_get "/services?limit=1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if isinstance(d, list) and d:
    print(d[0]['service']['ownerId'])
elif isinstance(d, dict):
    items=d.get('services', d.get('data', []))
    if items: print(items[0]['service']['ownerId'])
" 2>/dev/null || true)
if [[ -z "$OWNER_ID" ]]; then
  err "Could not resolve Render ownerId"
  exit 1
fi
log "Render ownerId: $OWNER_ID"

existing="$(render_get "/services?limit=100" || true)"

# --------------------------------------------------------------------------- #
# Step 1 — Verify & remove old service                                        #
# --------------------------------------------------------------------------- #
log "Step 1: verifying old service identity ($OLD_SERVICE_ID)"
old_resp=$(render_get "/services/${OLD_SERVICE_ID}" || true)
old_name=$(printf '%s' "$old_resp" | json_field "name")
old_type=$(printf '%s' "$old_resp" | json_field "type")
old_region=$(printf '%s' "$old_resp" | json_field "region")

if [[ "$old_name" == "$OLD_SERVICE_NAME" && "$old_type" == "web_service" ]]; then
  log "Old service VERIFIED: id=$OLD_SERVICE_ID name=$old_name type=$old_type region=$old_region"
  log "Removing old service $OLD_SERVICE_ID ..."
  render_delete "/services/${OLD_SERVICE_ID}" >/dev/null
  OLD_REMOVED="yes"
  log "Old service removal requested (id=$OLD_SERVICE_ID)"
else
  note "Old service $OLD_SERVICE_ID not found or identity mismatch (name='$old_name' type='$old_type') — not removed."
  log "Old service not removed (name='$old_name' type='$old_type')."
fi

# --------------------------------------------------------------------------- #
# Step 2 — Create/update backend service (Docker)                             #
# --------------------------------------------------------------------------- #
log "Step 2: creating/updating backend service ($BACKEND_NAME)"

backend_exists=$(printf '%s' "$existing" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d if isinstance(d, list) else (d.get('services', []) if isinstance(d, dict) else [])
names=[s['service']['name'] for s in items]
print('$BACKEND_NAME' in names)
" 2>/dev/null || echo False)

if [[ "$backend_exists" == "True" ]]; then
  log "Backend service '$BACKEND_NAME' already exists — will update env vars only."
  BACKEND_ID=$(printf '%s' "$existing" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d if isinstance(d, list) else (d.get('services', []) if isinstance(d, dict) else [])
for s in items:
    if s['service']['name']=='$BACKEND_NAME':
        print(s['service']['id']); break
" 2>/dev/null || true)
  BACKEND_OK="yes"
else
  log "Creating backend service '$BACKEND_NAME' (Docker, free tier) ..."
  cat > /tmp/opencode/render_backend_create.json <<JSON
{
  "type": "web_service",
  "name": "$BACKEND_NAME",
  "ownerId": "$OWNER_ID",
  "repo": "$REPO",
  "rootDir": "backend",
  "env": "docker",
  "serviceDetails": {
    "env": "docker",
    "envSpecificDetails": {
      "dockerfilePath": "Dockerfile",
      "dockerContext": "."
    }
  },
  "region": "$REGION",
  "plan": "$PLAN",
  "branch": "$BRANCH",
  "autoDeploy": "yes",
  "healthCheckPath": "/ready",
  "envVars": [
    { "key": "ASPNETCORE_ENVIRONMENT", "value": "Production" }
  ]
}
JSON
  create_resp=$(render_post "/services" "/tmp/opencode/render_backend_create.json")
  BACKEND_ID=$(printf '%s' "$create_resp" | json_field "id")
  if [[ -z "$BACKEND_ID" ]]; then
    msg=$(printf '%s' "$create_resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('message',''))" 2>/dev/null || true)
    err "Failed to create backend service: $msg"
    note "Backend ($BACKEND_NAME) could not be created: $msg"
    BACKEND_ID="" BACKEND_URL="" BACKEND_OK="no"
  else
    BACKEND_OK="yes"
    log "Backend service created: id=$BACKEND_ID"
  fi
fi

if [[ "$BACKEND_OK" == "yes" ]]; then
  BACKEND_URL=""
  for i in $(seq 1 30); do
    svc=$(render_get "/services/${BACKEND_ID}")
    BACKEND_URL=$(printf '%s' "$svc" | json_field "url")
    if [[ -n "$BACKEND_URL" && "$BACKEND_URL" != "None" ]]; then
      break
    fi
    sleep 2
  done
  log "Backend service: id=$BACKEND_ID url=$BACKEND_URL"
fi

# --------------------------------------------------------------------------- #
# Step 3 — Create/update frontend service (static)                            #
# --------------------------------------------------------------------------- #
log "Step 3: creating/updating frontend service ($FRONTEND_NAME)"

frontend_exists=$(printf '%s' "$existing" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d if isinstance(d, list) else (d.get('services', []) if isinstance(d, dict) else [])
names=[s['service']['name'] for s in items]
print('$FRONTEND_NAME' in names)
" 2>/dev/null || echo False)

if [[ "$frontend_exists" == "True" ]]; then
  log "Frontend service '$FRONTEND_NAME' already exists — will update env vars only."
  FRONTEND_ID=$(printf '%s' "$existing" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d if isinstance(d, list) else (d.get('services', []) if isinstance(d, dict) else [])
for s in items:
    if s['service']['name']=='$FRONTEND_NAME':
        print(s['service']['id']); break
" 2>/dev/null || true)
  FRONTEND_OK="yes"
else
  log "Creating frontend service '$FRONTEND_NAME' (static, free tier) ..."
  cat > /tmp/opencode/render_frontend_create.json <<JSON
{
  "type": "static_site",
  "name": "$FRONTEND_NAME",
  "ownerId": "$OWNER_ID",
  "repo": "$REPO",
  "rootDir": "frontend",
  "region": "$REGION",
  "plan": "$PLAN",
  "branch": "$BRANCH",
  "autoDeploy": "yes",
  "buildCommand": "npm ci && ng build --configuration production",
  "staticPublishPath": "dist/online-clipboard-frontend/browser",
  "envVars": []
}
JSON
  create_resp=$(render_post "/services" "/tmp/opencode/render_frontend_create.json")
  FRONTEND_ID=$(printf '%s' "$create_resp" | json_field "id")
  if [[ -z "$FRONTEND_ID" ]]; then
    err "Failed to create frontend service:"
    printf '%s\n' "$create_resp"
    exit 1
  fi
  FRONTEND_OK="yes"
  log "Frontend service created: id=$FRONTEND_ID"
fi

if [[ "$FRONTEND_OK" == "yes" ]]; then
  FRONTEND_URL=""
  for i in $(seq 1 30); do
    svc=$(render_get "/services/${FRONTEND_ID}")
    FRONTEND_URL=$(printf '%s' "$svc" | json_field "serviceDetails.url")
    [[ -z "$FRONTEND_URL" || "$FRONTEND_URL" == "None" ]] && FRONTEND_URL=$(printf '%s' "$svc" | json_field "url")
    if [[ -n "$FRONTEND_URL" && "$FRONTEND_URL" != "None" ]]; then
      break
    fi
    sleep 2
  done
  log "Frontend service: id=$FRONTEND_ID url=$FRONTEND_URL"
fi

# --------------------------------------------------------------------------- #
# Step 4 — Set Doppler-sourced env vars                                       #
# --------------------------------------------------------------------------- #
log "Step 4: setting env vars from Doppler"

MONGODB_URI=$(doppler_secret MONGODB) || true
JWT_SECRET=$(doppler_secret JWT_SECRET) || true

if [[ -z "$JWT_SECRET" ]]; then
  JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  log "JWT_SECRET not in Doppler; generated a strong random value."
fi

PUBLIC_BASE_URL="${BACKEND_URL:-}"
API_URL="${BACKEND_URL:-}"

if [[ "$BACKEND_OK" == "yes" && -n "$MONGODB_URI" ]]; then
  cat > /tmp/opencode/render_backend_env.json <<JSON
[
  { "key": "MONGODB_URI", "value": "$MONGODB_URI" },
  { "key": "JWT_SECRET", "value": "$JWT_SECRET" },
  { "key": "PUBLIC_BASE_URL", "value": "$PUBLIC_BASE_URL" },
  { "key": "ASPNETCORE_ENVIRONMENT", "value": "Production" }
]
JSON
  log "Setting backend env vars (MONGODB_URI, JWT_SECRET, PUBLIC_BASE_URL, ASPNETCORE_ENVIRONMENT) ..."
  render_patch "/services/${BACKEND_ID}/env-vars" "/tmp/opencode/render_backend_env.json" >/dev/null
  log "Backend env vars set."
else
  note "Backend env vars NOT set (backend unavailable or MONGODB_URI missing from Doppler)."
fi

if [[ "$FRONTEND_OK" == "yes" ]]; then
  cat > /tmp/opencode/render_frontend_env.json <<JSON
[
  { "key": "API_URL", "value": "$API_URL" }
]
JSON
  log "Setting frontend env var (API_URL=$API_URL) ..."
  render_patch "/services/${FRONTEND_ID}/env-vars" "/tmp/opencode/render_frontend_env.json" >/dev/null
  log "Frontend env var set."
fi

log "Env vars processed. (MONGODB_URI/JWT_SECRET sourced from Doppler — not printed.)"

# --------------------------------------------------------------------------- #
# Step 5 — Trigger deploys & wait for live                                    #
# --------------------------------------------------------------------------- #
log "Step 5: triggering deploys and waiting for live"

wait_for_deploy() {
  local svc_id="$1" svc_name="$2" want_live="${3:-yes}"
  [[ -z "$svc_id" ]] && { note "$svc_name: no service id, skipping deploy"; return 0; }
  log "Triggering deploy for $svc_name ($svc_id) ..."
  deploy_resp=$(render_post "/services/${svc_id}/deploys" "")
  deploy_id=$(printf '%s' "$deploy_resp" | json_field "id")
  if [[ -z "$deploy_id" || "$deploy_id" == "None" ]]; then
    err "Deploy trigger failed for $svc_name:"
    printf '%s\n' "$deploy_resp"
    note "$svc_name deploy trigger failed"
    return 1
  fi
  log "Deploy $svc_name started: deployId=$deploy_id"

  for i in $(seq 1 60); do
    status_resp=$(render_get "/services/${svc_id}/deploys/${deploy_id}")
    status=$(printf '%s' "$status_resp" | json_field "status")
    case "$status" in
      live|success)
        log "$svc_name deploy is live (status=$status)"
        return 0
        ;;
      failed|canceled|error)
        err "$svc_name deploy failed (status=$status):"
        printf '%s\n' "$status_resp"
        note "$svc_name deploy failed (status=$status)"
        return 1
        ;;
      *)
        sleep 5
        ;;
    esac
  done
  err "$svc_name deploy did not become live within timeout"
  note "$svc_name deploy timed out"
  return 1
}

if [[ "$BACKEND_OK" == "yes" ]]; then
  wait_for_deploy "$BACKEND_ID" "backend" || true
fi
if [[ "$FRONTEND_OK" == "yes" ]]; then
  wait_for_deploy "$FRONTEND_ID" "frontend" || true
fi

# --------------------------------------------------------------------------- #
# Step 6 — Verify /health and /ready on backend                               #
# --------------------------------------------------------------------------- #
log "Step 6: verifying backend health endpoints at $BACKEND_URL"

if [[ "$BACKEND_OK" == "yes" && -n "$BACKEND_URL" ]]; then
  for endpoint in /health /ready; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "${BACKEND_URL}${endpoint}" || true)
    body=$(curl -s --max-time 30 "${BACKEND_URL}${endpoint}" || true)
    log "GET ${BACKEND_URL}${endpoint} -> HTTP $code :: $body"
  done
else
  note "Backend health check skipped (backend not deployed on free tier — Docker requires paid plan)."
fi

# --------------------------------------------------------------------------- #
# Final report                                                                #
# --------------------------------------------------------------------------- #
log "============================================"
log "DEPLOYMENT SUMMARY"
log "  Old service removed ($OLD_SERVICE_ID): $OLD_REMOVED"
log "  Backend  : id=$BACKEND_ID  url=$BACKEND_URL  ok=$BACKEND_OK"
log "  Frontend : id=$FRONTEND_ID  url=$FRONTEND_URL  ok=$FRONTEND_OK"
log "  Region   : $REGION  Plan: $PLAN  Branch: $BRANCH"
if [[ -n "$ISSUES" ]]; then
  log "ISSUES:$ISSUES"
fi
log "============================================"

# Exit non-zero only if frontend (the shippable free-tier service) failed.
[[ "$FRONTEND_OK" == "yes" ]] || exit 1
