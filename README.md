# extensionchecker-app

Monorepo for the ExtensionChecker scanner application.

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
