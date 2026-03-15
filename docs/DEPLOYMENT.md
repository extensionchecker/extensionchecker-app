# Deployment & URL Configuration

## Architecture

```
Browser (React SPA)
    │ fetch("/api/...")
    ▼
Frontend Worker  (app.extensionchecker.org)
    │ injects x-extensionchecker-token header
    │ service binding (internal, no public network hop)
    ▼
Backend Worker
```

The browser only talks to the frontend Worker. All `/api/*` and `/health`
requests are intercepted by the frontend Worker (`worker.ts`) and forwarded
to the backend through a Cloudflare **service binding** - a zero-latency
internal call. The frontend Worker injects the `API_ACCESS_TOKEN` header so
the backend can authenticate requests without exposing the token to browsers.

## Custom Domains

| Service | Domain | Purpose |
|---------|--------|---------|
| Frontend | `app.extensionchecker.org` | Public web application (only public-facing endpoint) |

The frontend domain is configured as a Cloudflare Worker custom domain in
`src/frontend/wrangler.toml`. It is **not** hard-coded in application code.

The backend has no public route - it is reachable only through the frontend
Worker's service binding. To expose a public API for external consumers,
add a `routes` entry to `src/backend/wrangler.toml` and set
`API_ALLOWED_ORIGINS` accordingly.

## How URL routing works

### Local development

- **Frontend**: Vite dev server on `http://localhost:5173`
- **Backend**: Wrangler dev server on `http://localhost:8787`
- Vite's dev proxy forwards `/api/*` requests to the backend automatically.
  No environment variables are required for local development.
- `API_ACCESS_TOKEN` is not enforced locally by default.

### Production (Cloudflare)

- The **frontend Worker** serves static assets and proxies `/api/*` requests
  to the backend via a Cloudflare **service binding**.
- The frontend Worker injects the `x-extensionchecker-token` header from its
  own `API_ACCESS_TOKEN` secret before forwarding - the browser never sees
  the token.

### Staging

The Cloudflare Git integration handles staging via preview branches.
Push to a non-`main` branch and Cloudflare deploys a preview environment
automatically.

## Environment Variables

### Frontend Worker (`src/frontend/wrangler.toml` and Cloudflare secrets)

| Variable | Where | Default | Description |
|----------|-------|---------|-------------|
| `API_ACCESS_TOKEN` | Cloudflare secret | _(none)_ | Shared secret injected as `x-extensionchecker-token` on proxied requests. Set as an encrypted secret, never in plaintext config. |
| `API_BACKEND_BASE_URL` | `wrangler.toml` [vars] | _(none)_ | Fallback backend origin when no service binding is configured. Only used for local Worker proxy testing. |
| `VITE_API_BASE_URL` | `.env` (Vite build) | `""` (empty) | Backend origin baked into the SPA at build time. Leave blank when using the frontend Worker proxy or Vite's dev proxy. Only set if the backend is on a completely separate origin with no proxy layer. |

### Backend Worker (`src/backend/wrangler.toml` and Cloudflare secrets)

| Variable | Where | Default | Description |
|----------|-------|---------|-------------|
| `API_ACCESS_TOKEN` | Cloudflare secret | _(none)_ | Shared secret. If set, every request must include `x-extensionchecker-token`. The frontend Worker injects this automatically. |
| `API_ALLOWED_ORIGINS` | `wrangler.toml` [vars] | _(none)_ | Comma-separated CORS origins. Only needed if the backend is publicly exposed at its own domain. |
| `API_ALLOW_REQUESTS_WITHOUT_ORIGIN` | `wrangler.toml` [vars] | `"false"` | Allow requests with no Origin header (curl, scripts). |
| `API_RATE_LIMIT_PER_MINUTE_PER_IP` | `wrangler.toml` [vars] | `"30"` | Per-IP per-minute request cap. |
| `API_RATE_LIMIT_PER_DAY_PER_IP` | `wrangler.toml` [vars] | `"2000"` | Per-IP daily request cap. |
| `API_RATE_LIMIT_GLOBAL_PER_DAY` | `wrangler.toml` [vars] | `"90000"` | Global daily request cap. |

Secrets should be set in the Cloudflare dashboard (Settings → Variables →
Encrypt). Non-secret configuration can go in `wrangler.toml` `[vars]`.
For local Wrangler development, use a `.dev.vars` file.

## Self-Hosting

See [SELF_HOSTING.md](SELF_HOSTING.md) for a complete walkthrough.
