# Self-Hosting Guide

This guide walks you through deploying your own instance of ExtensionChecker
on Cloudflare Workers. The entire stack runs on Cloudflare's free tier.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is
  sufficient)
- A domain name managed by Cloudflare DNS (or use the free
  `*.workers.dev` subdomain)
- [Node.js](https://nodejs.org/) 22+ installed locally
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
  (`npm install -g wrangler`)

## 1. Fork & Clone

1. Fork [extensionchecker/extensionchecker-app](https://github.com/extensionchecker/extensionchecker-app)
   on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/extensionchecker-app.git
   cd extensionchecker-app
   ```

## 2. Install Dependencies

```bash
cd src
npm ci
```

## 3. Verify Locally

Before deploying, make sure everything builds and passes:

```bash
npm run lint
npm run test:coverage
npm run build
```

Start the local dev servers to test end-to-end:

```bash
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API calls to the
backend on `http://localhost:8787`.

## 4. Configure Your Domains

Edit the two `wrangler.toml` files to replace the official domains with your
own. No application code changes are needed — the app uses only relative API
paths.

### Backend (`src/backend/wrangler.toml`)

Change the `name` field at the top of the file:

```toml
name = "your-app-backend"
```

The backend has no public route by default — the frontend reaches it via
a service binding. To expose a public API, add a `routes` line:

```toml
routes = [{ pattern = "api.yourdomain.com", custom_domain = true }]
```

> If you add a public route, also set `API_ALLOWED_ORIGINS` to your
> frontend's origin (e.g. `https://app.yourdomain.com`) in the Cloudflare
> dashboard or `[vars]`.

### Frontend (`src/frontend/wrangler.toml`)

Change the `name`, `routes`, and service binding target:

```toml
name = "your-app-frontend"
routes = [{ pattern = "app.yourdomain.com", custom_domain = true }]

[[services]]
binding = "BACKEND"
service = "your-app-backend"
```

The service binding name (`BACKEND`) must match exactly — it connects the
frontend Worker to the backend Worker internally without a public network hop.

> **No custom domain?** You can skip the `routes` lines entirely and use the
> default `*.workers.dev` URLs that Cloudflare assigns. Just set
> `API_ALLOWED_ORIGINS` to your frontend's `*.workers.dev` URL.

## 5. Authenticate Wrangler

```bash
wrangler login
```

This opens a browser window to authorize Wrangler with your Cloudflare account.

## 6. Deploy the Backend

```bash
cd src/backend
npx wrangler deploy
```

Note the URL that Wrangler prints — you'll need it if you're using
`*.workers.dev` URLs instead of custom domains.

## 7. Deploy the Frontend

The frontend must be built before deploying:

```bash
cd src/frontend
npm run build
npx wrangler deploy
```

## 8. Verify Your Deployment

Visit your frontend URL in a browser. Submit an extension ID or URL and
confirm the analysis completes.

Check the health endpoint:

```bash
curl https://app.yourdomain.com/health
```

## Environment Variables & Secrets

All configuration is done through `wrangler.toml` `[vars]` sections or via the
Cloudflare dashboard (Settings → Variables). See
[docs/DEPLOYMENT.md](DEPLOYMENT.md) for the full reference.

### Secrets (set in Cloudflare dashboard, never in plaintext)

Generate a strong random token:

```bash
openssl rand -hex 32
```

Set `API_ACCESS_TOKEN` as an **encrypted secret** on **both** Workers in the
Cloudflare dashboard:

- **Frontend Worker** → Settings → Variables → Encrypt → `API_ACCESS_TOKEN`
- **Backend Worker** → Settings → Variables → Encrypt → `API_ACCESS_TOKEN`

Both must have the same value. The frontend Worker injects it as the
`x-extensionchecker-token` header on every proxied `/api/*` request. The
backend validates it. The browser never sees the token.

### Configuration variables

| Variable | Worker | Default | Purpose |
|----------|--------|---------|---------|
| `API_ALLOWED_ORIGINS` | Backend | _(none)_ | Comma-separated CORS origins. Only needed if the backend is publicly exposed at its own domain. |
| `API_ALLOW_REQUESTS_WITHOUT_ORIGIN` | Backend | `"false"` | Allow requests with no `Origin` header (curl, scripts). |
| `API_RATE_LIMIT_PER_MINUTE_PER_IP` | Backend | `"30"` | Per-IP per-minute request cap. |
| `API_RATE_LIMIT_PER_DAY_PER_IP` | Backend | `"2000"` | Per-IP daily request cap. |
| `API_RATE_LIMIT_GLOBAL_PER_DAY` | Backend | `"90000"` | Global daily request cap across all users. |
| `API_BACKEND_BASE_URL` | Frontend | _(none)_ | Fallback backend URL when no service binding is configured. Not needed in production. |

## Updating Your Instance

To pull upstream improvements from the official repo:

```bash
git remote add upstream https://github.com/extensionchecker/extensionchecker-app.git
git fetch upstream
git merge upstream/main
```

Resolve any conflicts in your `wrangler.toml` files (your domain config will
differ from upstream), rebuild, and redeploy.

## License & Attribution

ExtensionChecker is licensed under the [MIT License](../LICENSE). Under MIT
you are free to:

- Fork, modify, and deploy your own instance
- Use it commercially or privately
- Distribute modified versions

The only requirement is that you **retain the original copyright notice and
license text** in your copy. This is already in the `LICENSE` file — just
don't remove it.

You are **not** required to:

- Use the ExtensionChecker name or branding
- Link back to the official project (though we appreciate it)
- Open-source your modifications (though we encourage contributing upstream)

## Package Size & Safety

The backend enforces the following limits on extension archives. These are
designed to protect the Cloudflare Worker runtime, not to restrict legitimate
extensions — real-world extensions rarely approach these ceilings.

| Limit | Value | Notes |
|-------|-------|-------|
| Maximum compressed package size | 80 MB | Enforced on both uploads and remote downloads |
| Maximum ZIP entry count | 5,000 | Rejects adversarial central-directory exhaustion |
| Maximum decompressed size per file | 5 MB | Applies only to `manifest.json` and locale files |
| Maximum compression ratio per file | 1,000:1 | Zip bomb detection |

Importantly, the backend uses **selective decompression**: only `manifest.json`
and `_locales/**` locale files are ever inflated into memory. The rest of the
extension archive (JavaScript bundles, icons, filter lists, etc.) is read at
the ZIP metadata level and discarded. This means even a large extension whose
total uncompressed content is 50 MB or more can be analyzed with minimal
memory — the Worker only allocates memory for the compressed archive bytes
plus the small files it actually needs.

If you are self-hosting and need to analyze unusually large extensions
consistently, you may raise `MAX_PACKAGE_SIZE_BYTES` in
`src/backend/src/constants.ts`. The entry count and per-file limits in
`src/backend/src/archive.ts` can also be adjusted, but raising them increases
exposure to adversarial inputs if your instance is publicly accessible.

## Troubleshooting

### "Service binding not found" error

The frontend Worker references the backend by its Wrangler service name. Make
sure:
1. The backend is deployed first.
2. The `service` value in the frontend's `[[services]]` matches the backend's
   `name` field.

### CORS errors in the browser

`API_ALLOWED_ORIGINS` must be set to the **exact** origin of your frontend
(including `https://`, no trailing slash). Example:
`https://app.yourdomain.com`

### Rate limit errors

Adjust the `API_RATE_LIMIT_*` variables in your backend `wrangler.toml`. On
your own instance, you have full control over these limits.

### Build fails locally

Make sure you're on Node.js 22+ (`node --version`) and have run `npm ci` from
the `src/` directory.
