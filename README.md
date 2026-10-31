# Online Clipboard

Production-ready online clipboard: rich text, code snippets, history, search, tags, favorites, secure sharing, PWA.

A self-contained, self-hosted clipboard service built with Node.js, Express, and SQLite. Users can create and organize text, rich-text, and code clips, pin and favorite items, search across content, export/import clips, and share clips securely with optional password protection, one-time links, expiration, and QR codes.

## Features

- **Clip management** — create, read, update, delete text / rich-text / code clips
- **Rich text editing** — Quill-powered editor with HTML sanitization
- **Code snippets** — syntax-aware code clips with language tagging
- **Search & filtering** — full-text search across title, excerpt, content, and tags; filter by tag, favorite, pinned, content type
- **Organization** — pin, favorite, copy/view counters, audit logging
- **Secure sharing** — shareable tokens, optional share password, one-time (burn-after-read) links, expiration dates, QR code generation
- **Import / export** — JSON export/import of clips (up to 500 items per import)
- **PWA** — installable progressive web app with service worker and manifest
- **Security** — helmet (CSP, HSTS, etc.), compression, rate limiting, `express-rate-limit`, bcrypt password hashing, JWT authentication, sanitize-html
- **Health checks** — `/health` and `/ready` endpoints
- **Graceful shutdown** — SIGTERM/SIGINT handling

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js (>= 22.5.0) |
| Framework | Express 5 |
| Database | SQLite (`node:sqlite` `DatabaseSync`) with WAL mode + migrations |
| Authentication | bcryptjs + jsonwebtoken (JWT) |
| Security | helmet, compression, morgan, express-rate-limit, sanitize-html |
| Testing | Jest + supertest |
| Frontend | Vanilla JS, Quill (rich text), qrcode (QR generation) |
| Packaging | npm (CommonJS), package-lock.json committed |

## Project Structure

```
online-clipboard/
├── .env.example            # Copy to .env and set your own secrets (never commit .env)
├ .gitignore                # Excludes secrets, DB, node_modules, build artifacts
├── LICENSE                 # MIT License
├── README.md               # This file
├── package.json            # Scripts, dependencies, engines
├── package-lock.json       # Locked dependency tree
├── jest.config.js          # Jest configuration
├── src/
│   ├── server.js           # HTTP/HTTPS entry point, graceful shutdown
│   ├── app.js              # Express app factory, middleware, routes
│   ├── config/database.js  # SQLite connection, schema migrations
│   ├── controllers/        # (reserved)
│   ├── middleware/         # auth, rate limiting
│   ├── models/             # Clip, User data models
│   ├── routes/             # auth, clips, share API routes
│   ├── services/           # maintenance (expired clip purge)
│   ├── utils/              # ids, password hashing, validation
│   └── views/              # (reserved)
├── public/                 # Static frontend (index.html, css, js, icons, vendor, sw.js)
├── scripts/                # gen-icons.js, sync-vendor.js
├── tests/                  # Jest test suites (auth, clips, share, e2e)
└── data/                   # SQLite database (gitignored, created at runtime)
```

## Setup

### Prerequisites

- Node.js >= 22.5.0
- npm

### Install

```bash
# Clone the repository
git clone <REPO_URL>
cd online-clipboard

# Install dependencies
npm install
```

The `postinstall` script (`scripts/sync-vendor.js`) copies frontend vendor assets into `public/vendor`.

### Environment configuration

Copy the example file and fill in your own values:

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET (required in production) and PUBLIC_BASE_URL
```

Never commit `.env`. It contains `JWT_SECRET` and other secrets. `.env` is gitignored.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `PORT` | No | `3000` | HTTP server port |
| `JWT_SECRET` | Yes (production) | — | Secret used to sign JWTs — **must be set in production** |
| `PUBLIC_BASE_URL` | No | derived from request | Base URL for share links and QR codes |
| `RATE_LIMIT_DISABLED` | No | — | Set to `1` to disable rate limiting (dev/test only) |
| `TLS_PORT` | No | `443` | HTTPS port (when certs present) |
| `TLS_CERT_PATH` | No | `certs/cert.pem` | TLS certificate path |
| `TLS_KEY_PATH` | No | `certs/key.pem` | TLS private key path |
| `DB_PATH` | No | `data/clipboard.db` | SQLite database file path |

Generate a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Start the server

Development:

```bash
npm run dev
```

Production:

```bash
npm start
```

The app listens on `http://localhost:3000` by default. If TLS certificate/key files are present in `certs/`, HTTPS is enabled and HTTP redirects to HTTPS.

## Testing

```bash
# Run the full test suite
npm test
```

Tests use an isolated SQLite database under `/tmp` and disable rate limiting. They do **not** touch your local `data/` database.

Current results: **75 tests passing across 4 suites** (auth, clips, share, e2e).

## Deployment

1. Set `NODE_ENV=production` and a strong `JWT_SECRET`.
2. Set `PUBLIC_BASE_URL` to your public HTTPS origin (used for share links/QR codes).
3. Provide TLS certificate/key in `certs/` (or terminate TLS at a reverse proxy).
4. Ensure the `data/` directory is writable by the app process (SQLite database).
5. Run `npm install --omit=dev` and start with `npm start`.
6. Place behind a reverse proxy (nginx, Caddy, Traefik, etc.) if desired; the app sets `trust proxy`.

Example systemd unit (`online-clipboard.service`):

```ini
[Unit]
Description=Online Clipboard
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/online-clipboard
Environment=NODE_ENV=production
EnvironmentFile=/opt/online-clipboard/.env
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
User=online-clipboard

[Install]
WantedBy=multi-user.target
```

## Security

- `.env` (containing `JWT_SECRET`), `data/` (SQLite database), `certs/` (TLS keys), and `node_modules/` are excluded from version control via `.gitignore`.
- Rotate `JWT_SECRET` if it is ever committed or exposed.
- Review `src/middleware/rateLimit.js` and adjust limits for your deployment.

## License

[MIT](LICENSE)
