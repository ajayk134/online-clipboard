# Online Clipboard — API Contract (Rebuild)

This contract defines the exact API surface all workstreams must implement.
Base path: `/api`

## Authentication (JWT, 7-day expiry, issuer 'online-clipboard')
- `POST /api/auth/register` — body: {username, email, password} → 201 {token, user:{id,username,email,createdAt}}
- `POST /api/auth/login` — body: {identifier, password} → 200 {token, user}
- `GET /api/auth/me` — Bearer token → 200 {user} | 401
- `POST /api/auth/logout` — Bearer token → 200 {message} (bumps token_version)
- `PUT /api/auth/password` — Bearer + {currentPassword, newPassword} → 200 {token, message}

## Clips (auth required)
- `GET /api/clips` — query: q, tag, favorite, pinned, type, sort, limit, offset → {items[], total}
- `GET /api/clips/tags` → {tags[{tag,count}]}
- `GET /api/clips/stats` → {total, favorites, pinned, copies, views, shared}
- `GET /api/clips/export` → JSON attachment
- `POST /api/clips/import` — body: {items[]} (max 500) → 201 {imported, errors[]}
- `POST /api/clips` — body: {title, content, contentType, language, tags, isPinned, isFavorite, expiresAt, share, sharePassword, shareOneTime} → 201 clip
- `GET /api/clips/:id` → clip
- `PATCH /api/clips/:id` → clip
- `PATCH /api/clips/:id/copy` → {ok:true}
- `PATCH /api/clips/:id/flags` — body: {isFavorite?, isPinned?} → clip
- `DELETE /api/clips/:id` → {ok:true}
- `POST /api/clips/:id/share` — body: {enabled?, oneTime?, rotate?, password?, clearPassword?} → clip {shareUrl, shareToken, hasPassword, isOneTime}
- `GET /api/clips/:id/qr` → image/png
- `GET /api/clips/:id/export` → txt/html/md attachment

## Share (public, no auth)
- `GET /api/share/:token/meta` → {title, contentType, language, hasPassword, isOneTime, available, expired, expiresAt, createdAt, excerpt} (NO content)
- `POST /api/share/:token/access` — body: {password?} → {title, content, contentType, language, consumed, expiresAt}

## Health
- `GET /health` → {status, uptime, time}
- `GET /ready` → {status:'ready'} | 503

## Clip model (MongoDB)
{ id(int), user_id(int), title, title_lower, content, excerpt, content_type(text|richtext|code), language, tags[], is_pinned(bool), is_favorite(bool), copy_count(int), view_count(int), share_token(str|null), share_enabled(bool), expires_at(str|null), is_one_time(bool), read_count(int), password_hash(str|null), created_at, updated_at }

## User model (MongoDB)
{ id(int), username, email, username_lower, email_lower, password_hash, token_version(int), created_at, updated_at }

## Security
- bcrypt password hashing (user: 12 rounds, share: 10 rounds)
- JWT signed with JWT_SECRET, 7d expiry, token_version in payload
- Rate limiting: global 600/15min, auth 30/15min, write 240/15min, share 40/15min
- CORS: allow frontend origin
- Input validation on all endpoints
- Rich text sanitization (sanitize-html equivalent)
- MONGODB_URI from Doppler `agent-keys`/`dev` config secret `MONGODB`
- Database name: `online_clipboard` (prod), `online_clipboard_test` (tests)

## Legacy data to migrate (from /tmp/opencode/sqlite_export.json)
- users (16), clipboard_items→clips (21), audit_log (88)
- Preserve numeric ids, password hashes, share tokens, timestamps
