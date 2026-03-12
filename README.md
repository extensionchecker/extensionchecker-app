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
