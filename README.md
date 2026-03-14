# extensionchecker-app

[![CI/CD](https://github.com/extensionchecker/extensionchecker-app/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/extensionchecker/extensionchecker-app/actions/workflows/ci.yml)
[![CodeQL](https://github.com/extensionchecker/extensionchecker-app/actions/workflows/ci.yml/badge.svg?branch=main&event=schedule)](https://github.com/extensionchecker/extensionchecker-app/security/code-scanning)
[![tests](https://img.shields.io/github/actions/workflow/status/extensionchecker/extensionchecker-app/ci.yml?branch=main&label=tests&logo=githubactions&logoColor=white)](https://github.com/extensionchecker/extensionchecker-app/actions/workflows/ci.yml)
[![coverage](https://codecov.io/gh/extensionchecker/extensionchecker-app/branch/main/graph/badge.svg)](https://codecov.io/gh/extensionchecker/extensionchecker-app)
[![Dependabot](https://img.shields.io/badge/dependabot-enabled-025E8C?logo=dependabot&logoColor=white)](https://github.com/extensionchecker/extensionchecker-app/security/dependabot)
[![issues](https://img.shields.io/github/issues/extensionchecker/extensionchecker-app?label=issues)](https://github.com/extensionchecker/extensionchecker-app/issues)
[![last commit](https://img.shields.io/github/last-commit/extensionchecker/extensionchecker-app?label=last%20commit)](https://github.com/extensionchecker/extensionchecker-app/commits/main)
[![node](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fextensionchecker%2Fextensionchecker-app%2Fmain%2Fsrc%2Fpackage.json&query=%24.engines.node&label=node&logo=node.js&logoColor=white)](https://github.com/extensionchecker/extensionchecker-app/blob/main/src/package.json)
[![pull requests](https://img.shields.io/github/issues-pr/extensionchecker/extensionchecker-app?label=pull%20requests)](https://github.com/extensionchecker/extensionchecker-app/pulls)
[![release](https://img.shields.io/github/v/release/extensionchecker/extensionchecker-app?display_name=tag&label=release)](https://github.com/extensionchecker/extensionchecker-app/releases)

Monorepo for the ExtensionChecker scanner application.

<img src="docs/logo/icon.png" alt="ExtensionChecker logo" width="100" />

## Packages

- `src/frontend`: Vite + React app deployed as a Cloudflare Worker static-assets frontend.
- `src/backend`: Cloudflare Worker API for ingestion and report generation.
- `src/engine`: Manifest-first analysis engine with deterministic risk scoring.
- `src/shared`: Shared schemas and report contracts.

## Quick Start

1. Install dependencies:

```bash
cd src
npm install
```

2. Run checks:

```bash
npm run typecheck
npm run test
npm run test:coverage
```

3. Local package dev servers:

```bash
npm run dev
```

or target a specific package:

```bash
npm run dev -w @extensionchecker/frontend
npm run dev -w @extensionchecker/backend
```

## Current Ingestion Scope

Version `0.1.0` implements manifest-first analysis for:

- direct package URLs (`.zip`, `.xpi`, `.crx`)
- extension IDs (Chrome Web Store IDs and Firefox add-on IDs/slugs)
- uploaded package files (`.zip`, `.xpi`, `.crx`)

Listing-page URL resolution is planned next.

## Security Notes

- URL and ID retrieval only allow `https://` targets.
- Localhost, local domains, loopback, and private IP literals are rejected.
- Package size is capped to reduce abuse and memory risk.
- Archive parsing is performed in memory without filesystem extraction.
- API requests require an `Origin` header by default, and only same-origin or configured origins are accepted.
- Non-browser/server callers can opt in via `API_ALLOW_REQUESTS_WITHOUT_ORIGIN=true` (recommended only for trusted private networks).
- Optional API token enforcement is supported with `API_ACCESS_TOKEN` (header: `x-extensionchecker-token`).
- Backend rate limits are enabled by default with configurable per-minute IP, per-day IP, and global per-day quotas.

## Cloudflare Deployment

- The repo now supports a Worker-native deployment path where the frontend Worker serves the static app and proxies `/api/*` and `/health` to the backend Worker through a service binding. This keeps browser traffic same-origin and avoids shipping a shared API secret to the client.
- A Cloudflare Pages frontend plus a separate API Worker is still a valid deployment shape. If you choose that route, configure `VITE_API_BASE_URL` and set `API_ALLOWED_ORIGINS` to the exact frontend origins you expect.
- Local secret files are intentionally gitignored: use `.env` / `.env.example` for Vite frontend configuration and `.dev.vars` / `.dev.vars.example` for Wrangler local secrets and Worker-only variables.
- Deployment details, required secrets, and staging/production expectations are documented in `docs/cloudflare-deployment.md`.
