# Online Clipboard

Production-ready online clipboard: rich text, code snippets, history, search, tags, favorites, secure sharing, PWA.

A self-hosted clipboard service built with **ASP.NET Core .NET 10** (backend) and **Angular 22** (frontend), using **MongoDB** as the datastore and deployed to **Render**. Users can create and organize text, rich-text, and code clips, pin and favorite items, search across content, export/import clips, and share clips securely with optional password protection, one-time links, expiration, and QR codes.

## Features

- **Clip management** — create, read, update, delete text / rich-text / code clips
- **Rich text editing** — Quill-powered editor with HTML sanitization
- **Code snippets** — syntax-aware code clips with language tagging
- **Search & filtering** — full-text search across title, content, and tags; filter by tag, favorite, pinned, content type
- **Organization** — pin, favorite, copy/view counters, audit logging
- **Secure sharing** — shareable tokens, optional share password, one-time (burn-after-read) links, expiration dates, QR code generation
- **Import / export** — JSON export/import of clips (up to 500 items per import)
- **PWA** — installable progressive web app with service worker and manifest
- **Authentication** — JWT authentication with bcrypt password hashing, token versioning (logout/password change revokes prior tokens)
- **Authorization** — `[Authorize]` on all user endpoints, ownership enforcement on all clip resources
- **Security** — JWT secret enforced from env var (fail fast), production CORS with explicit origins (no `AllowAnyOrigin` fallback), rate limiting on auth/write/share endpoints, TTL index for auto-expiring clips, ProblemDetails (RFC 7807) error responses
- **Health checks** — `/health` and `/ready` endpoints
- **MongoDB resilience** — retry-with-backoff startup connection, async index creation with conflict tolerance, connection pooling and server-selection timeout tuning

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | ASP.NET Core .NET 10 |
| Backend framework | Minimal APIs + Controllers, Kestrel |
| Database | MongoDB (official C# driver 2.29.0) |
| Authentication | JWT (HMAC SHA-256) + bcrypt password hashing |
| Security | Rate limiting, CORS, ProblemDetails, ForwardedHeaders |
| Testing | xUnit + Moq (backend), Karma + Jasmine (frontend) |
| Frontend | Angular 22, TypeScript, RxJS, Quill (rich text), qrcode (QR generation) |
| Packaging | npm, .NET SDK |

## Project Structure

```
online-clipboard/
├── .env.example              # Copy to .env and set your own secrets (never commit .env)
├── backend/.env              # Backend-specific env (copy from .env.example)
├── .gitignore                # Excludes secrets, DB, node_modules, build artifacts
├── LICENSE                   # MIT License
├── README.md                 # This file
├── render.yaml               # Render deployment definition
├── backend/
│   ├── OnlineClipboard.csproj
│   ├── Program.cs            # Entry point: DI, auth, CORS, rate limiting, middleware
│   ├── Controllers/          # AuthController, ClipsController, ShareController
│   ├── Services/             # JwtService, MongoDbService, PasswordService, ShareService, SanitizationService, MaintenanceService
│   ├── Middleware/           # AuthMiddleware (token version enforcement)
│   ├── Models/               # Clip, User, Counter, AuditLog, DTOs
│   └── Tests/
│       └── OnlineClipboard.Tests/   # xUnit test suite
├── frontend/
│   ├── angular.json
│   ├── package.json
│   ├── karma.conf.js
│   ├── src/
│   │   ├── app/              # Angular components, services, interceptors, guards
│   │   └── environments/     # environment.ts, environment.prod.ts
│   └── scripts/
│       └── set-api-url.js    # Build-time API URL substitution
├── tests/                    # Legacy Jest tests (Node.js version)
├── data/                     # Legacy SQLite database (migration source)
└── public/                   # Legacy static assets
```

## Backend Setup

### Prerequisites

- .NET SDK 10.0+
- MongoDB (Atlas or self-hosted)

### Install

```bash
cd backend
dotnet restore
```

### Environment configuration

Copy the example file and fill in your own values:

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET (required), MONGODB_URI (required), FRONTEND_URL, PUBLIC_BASE_URL
```

Never commit `.env`. It contains `JWT_SECRET`, `MONGODB_URI`, and other secrets.

### Backend environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | — | Secret used to sign JWTs — **must be set in production**; app fails fast if missing or set to `dev-secret-change-me` |
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `FRONTEND_URL` | No | — | CORS origin for the frontend (production must set this) |
| `PUBLIC_BASE_URL` | No | derived from request | Base URL for share links and QR codes |
| `ASPNETCORE_ENVIRONMENT` | No | `Production` | `Development`, `Production`, or `Testing` |
| `ASPNETCORE_URLS` | No | `http://+:8080` | Kestrel bind URL |
| `JWT_EXPIRY_DAYS` | No | `7` | JWT access token expiry in days |
| `MONGODB_TIMEOUT_MS` | No | `15000` | MongoDB server-selection timeout (ms) |
| `MONGODB_POOL_SIZE` | No | `100` | Maximum MongoDB connection pool size |
| `MIGRATE_LEGACY` | No | — | Set to `1` to run the legacy SQLite→MongoDB migration on startup |

Generate a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# or
openssl rand -hex 32
```

### Run locally

```bash
cd backend
dotnet run
```

The API listens on `http://localhost:5000` (or `ASPNETCORE_URLS`). Health: `http://localhost:5000/health`. Readiness: `http://localhost:5000/ready`.

### Run tests

```bash
cd backend
dotnet test
```

Integration tests (`MongoDbIntegrationTests`) require `MONGODB_URI` and are skipped otherwise.

## Frontend Setup

### Prerequisites

- Node.js >= 22.5.0
- npm

### Install

```bash
cd frontend
npm install
```

### Frontend environment

The production API URL is set at build time via the `API_URL` environment variable (see `render.yaml` or `scripts/set-api-url.js`). In development, `environment.ts` uses `/api` (relative, requires a proxy to the backend).

### Run locally

```bash
cd frontend
npm start
```

The dev server runs on `http://localhost:4200`.

### Run tests

```bash
cd frontend
npm test
```

### Production build

```bash
cd frontend
npm run build
```

Output goes to `dist/online-clipboard-frontend/browser`.

## Deployment on Render

The repository includes `render.yaml` for Render deployment.

### Backend (native web service)

Render's free tier does not support Docker web services, so the backend is configured as a native .NET web service:

- `buildCommand`: `dotnet publish -c Production -o /app/publish`
- `startCommand`: `dotnet /app/publish/OnlineClipboard.dll`
- Required env vars (set in Render dashboard or `render.yaml`): `ASPNETCORE_ENVIRONMENT=Production`, `ASPNETCORE_URLS=http://+:8080`, `FRONTEND_URL`, `PUBLIC_BASE_URL`, `MONGODB_URI`, `JWT_SECRET`

### Frontend (static site)

- `buildCommand`: `node scripts/set-api-url.js && npm ci && ng build --configuration production`
- `staticPublishPath`: `dist/online-clipboard-frontend/browser`
- Required env var: `API_URL=https://online-clipboard-backend.onrender.com`

The `set-api-url.js` script substitutes the `API_URL` env var into `environment.prod.ts` at build time, so the frontend calls the correct backend origin.

### MongoDB

No database service is declared in `render.yaml`; MongoDB is expected to be external (e.g., MongoDB Atlas). Set `MONGODB_URI` in the Render backend service environment. Ensure your Atlas cluster's IP access list allows connections from Render.

## Security notes

- `JWT_SECRET` must be set to a strong random value in production. The application refuses to start if it is missing or set to the insecure default.
- CORS is restricted to the configured `FRONTEND_URL` origins. `AllowAnyOrigin()` is only used in development.
- All clip/resource endpoints enforce ownership (`UserId` filter).
- JWTs embed a `ver` (token version) claim. Logout and password changes increment `TokenVersion`, invalidating all previously issued tokens.
- Access tokens are short-lived (configurable via `JWT_EXPIRY_DAYS`, default 7 days).
- Expired clips are automatically removed by a MongoDB TTL index on `expires_at`.
- Error responses use ProblemDetails (RFC 7807) format; no stack traces leak to clients.

## License

[MIT](LICENSE)