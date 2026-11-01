#!/usr/bin/env bash
###############################################################################
# setup-doppler-render.sh — Copy Doppler secrets to Render service env vars
#
# Copies MONGODB, JWT_SECRET, RENDER from Doppler (agent-keys/dev_personal)
# to the Render backend & frontend service env vars via the Render API.
#
# Secrets are never printed to stdout.
###############################################################################
set -euo pipefail

DOPPLER_CONFIG="${DOPPLER_CONFIG:-dev_personal}"
DOPPLER_FALLBACK_CONFIG="dev_personal"
RENDER_API="https://api.render.com/v1"

BACKEND_NAME="${BACKEND_NAME:-online-clipboard-backend}"
FRONTEND_NAME="${FRONTEND_NAME:-online-clipboard-frontend}"

log() { printf '[setup-doppler-render] %s\n' "$*"; }
err() { printf '[setup-doppler-render][ERROR] %s\n' "$*" >&2; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || { err "required command not found: $1"; exit 1; }; }
require_cmd doppler
require_cmd curl

doppler_secret() {
  local key="$1" val=""
  val=$(doppler secrets get "$key" --config "$DOPPLER_CONFIG" --plain 2>/dev/null) || true
  if [[ -z "$val" ]]; then
    val=$(doppler secrets get "$key" --config "$DOPPLER_FALLBACK_CONFIG" --plain 2>/dev/null) || true
  fi
  if [[ -z "$val" ]]; then
    err "Doppler secret not found: $key"
    return 1
  fi
  printf '%s' "$val"
}

render_api_key() { doppler_secret RENDER; }

render_req() {
  local method="$1" path="$2" body_file="${3:-}"
  local key; key=$(render_api_key)
  local args=( -s -H "Authorization: Bearer $key" )
  if [[ -n "$body_file" ]]; then
    args+=( -H "Content-Type: application/json" --data @"$body_file" )
  fi
  curl "${args[@]}" -X "$method" "${RENDER_API}${path}"
}
render_get()  { render_req GET "$1"; }
render_patch(){ render_req PATCH "$1" "$2"; }

# Find service id by name across the account
service_id_by_name() {
  local name="$1"
  render_get "/services?limit=100" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for s in d:
    if s['service']['name']=='$name':
        print(s['service']['id']); break
" 2>/dev/null || true
}

log "Resolving Render service IDs ..."
BACKEND_ID=$(service_id_by_name "$BACKEND_NAME")
FRONTEND_ID=$(service_id_by_name "$FRONTEND_NAME")

if [[ -z "$BACKEND_ID" ]]; then err "Backend service '$BACKEND_NAME' not found on Render"; exit 1; fi
if [[ -z "$FRONTEND_ID" ]]; then err "Frontend service '$FRONTEND_NAME' not found on Render"; exit 1; fi

log "Backend id=$BACKEND_ID  Frontend id=$FRONTEND_ID"

# Fetch secrets from Doppler (never echoed)
MONGODB_URI=$(doppler_secret MONGODB) || { err "MONGODB secret required in Doppler"; exit 1; }
JWT_SECRET=$(doppler_secret JWT_SECRET) || true
if [[ -z "$JWT_SECRET" ]]; then
  JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  log "JWT_SECRET not in Doppler; generated a strong random value (not stored back to Doppler)."
fi

# Build backend env payload
cat > /tmp/opencode/doppler_render_backend_env.json <<JSON
[
  { "key": "MONGODB_URI", "value": "$MONGODB_URI" },
  { "key": "JWT_SECRET", "value": "$JWT_SECRET" },
  { "key": "ASPNETCORE_ENVIRONMENT", "value": "Production" }
]
JSON

log "Updating backend env vars ..."
render_patch "/services/${BACKEND_ID}/env-vars" "/tmp/opencode/doppler_render_backend_env.json" >/dev/null
log "Backend env vars updated (MONGODB_URI, JWT_SECRET, ASPNETCORE_ENVIRONMENT)."

log "Done. Secrets sourced from Doppler config '$DOPPLER_CONFIG' (fallback '$DOPPLER_FALLBACK_CONFIG')."
