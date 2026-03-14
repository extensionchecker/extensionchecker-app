# Deployment & URL Configuration

## Custom Domains

| Service | Domain | Purpose |
|---------|--------|---------|
| Frontend | `app.extensionchecker.org` | Public web application |
| Backend API | `api.extensionchecker.org` | REST/SSE analysis API |

These domains are configured as Cloudflare Worker custom domains in each
package's `wrangler.toml` under `[env.production]`. They are **not**
hard-coded in application code.

## How URL routing works

### Local development

- **Frontend**: Vite dev server on `http://localhost:5173`
- **Backend**: Wrangler dev server on `http://localhost:8787`
- Vite's dev proxy forwards `/api/*` requests to the backend automatically.
  No environment variables are required for local development.

### Production (Cloudflare)

- The **frontend worker** serves static assets and proxies `/api/*` requests
  to the backend via a Cloudflare **service binding** (zero-latency internal
  call, no public network hop).
- The backend worker is **also** reachable directly at
  `api.extensionchecker.org` for API-only consumers.
- CORS on the backend is configured via the `API_ALLOWED_ORIGINS` variable
  in `wrangler.toml`, restricting cross-origin callers to the frontend's
  production origin.

### Staging

Same architecture, using `staging.extensionchecker.org` origins. See the
`[env.staging]` sections in each `wrangler.toml`.

## Environment Variables

### Frontend (`src/frontend/.env.example`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `""` (empty) | Backend origin. Leave blank when the frontend worker proxies via service binding or when using Vite's dev proxy. Set only if the backend is on a separate origin. |

### Backend (`src/backend/.env.example`)

| Variable | Default | Description |
|----------|---------|-------------|
| `API_ALLOWED_ORIGINS` | _(none)_ | Comma-separated allowed CORS origins |
| `API_ACCESS_TOKEN` | _(none)_ | Optional bearer token for authenticated API access |
| `API_ALLOW_REQUESTS_WITHOUT_ORIGIN` | `"false"` | Allow requests with no Origin header |
| `API_RATE_LIMIT_PER_MINUTE_PER_IP` | `"30"` | Per-IP per-minute request cap |
| `API_RATE_LIMIT_PER_DAY_PER_IP` | `"2000"` | Per-IP daily request cap |
| `API_RATE_LIMIT_GLOBAL_PER_DAY` | `"90000"` | Global daily request cap |

All backend variables can be set in `wrangler.toml` `[vars]`, in a `.dev.vars`
file for local Wrangler development, or as encrypted secrets in the Cloudflare
dashboard.

## Self-Hosting

When self-hosting, replace the domain names in `wrangler.toml` with your own.
The application code uses only relative API paths, so no code changes are
needed — just update `wrangler.toml` and `API_ALLOWED_ORIGINS`.
