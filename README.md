# extensionchecker-app

[![CI/CD](https://github.com/extensionchecker/extensionchecker-app/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/extensionchecker/extensionchecker-app/actions/workflows/ci.yml)
[![CodeQL](https://img.shields.io/badge/CodeQL-passing-brightgreen?logo=github&logoColor=white)](https://github.com/extensionchecker/extensionchecker-app/security/code-scanning)
[![tests](https://img.shields.io/github/actions/workflow/status/extensionchecker/extensionchecker-app/ci.yml?branch=main&label=tests&logo=githubactions&logoColor=white)](https://github.com/extensionchecker/extensionchecker-app/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/extensionchecker/extensionchecker-app/branch/main/graph/badge.svg)](https://codecov.io/gh/extensionchecker/extensionchecker-app)
[![Dependabot](https://img.shields.io/badge/dependabot-enabled-025E8C?logo=dependabot&logoColor=white)](https://github.com/extensionchecker/extensionchecker-app/security/dependabot)
[![issues](https://img.shields.io/github/issues/extensionchecker/extensionchecker-app?label=issues)](https://github.com/extensionchecker/extensionchecker-app/issues)
[![last commit](https://img.shields.io/github/last-commit/extensionchecker/extensionchecker-app?label=last%20commit)](https://github.com/extensionchecker/extensionchecker-app/commits/main)
[![node](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fextensionchecker%2Fextensionchecker-app%2Fmain%2Fsrc%2Fpackage.json&query=%24.engines.node&label=node&logo=node.js&logoColor=white)](https://github.com/extensionchecker/extensionchecker-app/blob/main/src/package.json)
[![pull requests](https://img.shields.io/github/issues-pr/extensionchecker/extensionchecker-app?label=pull%20requests)](https://github.com/extensionchecker/extensionchecker-app/pulls)
[![release](https://img.shields.io/github/v/release/extensionchecker/extensionchecker-app?display_name=tag&label=release)](https://github.com/extensionchecker/extensionchecker-app/releases)

**An open-source, self-hostable browser extension risk analysis tool.**

Submit a Chrome, Firefox, or Safari extension by store URL, extension ID, or
uploaded package file and get a clear, structured, human-readable risk report.
No opaque trust scores — every finding is traceable to evidence in the
extension's manifest and code.

<img src="docs/logo/icon.png" alt="ExtensionChecker logo" width="100" />

> **Live instance**: [app.extensionchecker.org](https://app.extensionchecker.org)
> — running on the Cloudflare Workers free tier. If you need higher throughput
> or want full control, [self-host your own instance](docs/SELF_HOSTING.md).

---

## For Contributors

Want to help improve ExtensionChecker? Start here:

| Resource | Description |
|----------|-------------|
| [Contributing Guide](CONTRIBUTING.md) | Fork, setup, dev workflow, PR expectations |
| [Style Guide](docs/STYLE_GUIDE.md) | TypeScript conventions, naming, testing, CSS |
| [Code of Conduct](CODE_OF_CONDUCT.md) | Community standards |
| [Security Policy](SECURITY.md) | How to report vulnerabilities privately |
| [Product Requirements](docs/PRD.md) | Product vision, scope, architecture constraints |

### Quick Start

```bash
cd src
npm ci
npm run lint && npm run test:coverage && npm run build
npm run dev   # frontend on :5173, backend on :8787
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full setup walkthrough.

---

## For Self-Hosters

The official public instance at `app.extensionchecker.org` runs on
Cloudflare's free tier. If that instance is rate-limited, slow, or you need
to run ExtensionChecker privately, you can fork this repo and deploy your
own instance.

| Resource | Description |
|----------|-------------|
| [Self-Hosting Guide](docs/SELF_HOSTING.md) | End-to-end walkthrough: fork, configure, deploy |
| [Deployment Reference](docs/DEPLOYMENT.md) | Domains, environment variables, service bindings |
| [License](LICENSE) | MIT — what you can and cannot do |

---

## Architecture

```
src/
├── frontend/   Vite + React, deployed as a Cloudflare Worker (static assets)
├── backend/    Hono API on Cloudflare Workers (ingestion, orchestration)
├── engine/     Manifest-first analysis engine (shared library, not a service)
└── shared/     Zod schemas, TypeScript types, report contracts
```

The frontend proxies `/api/*` to the backend via a Cloudflare service binding
in production, or Vite's dev proxy locally. The engine runs in-process — it is
imported by the backend, not called over the network.

---

## License

[MIT](LICENSE) — free to use, modify, and self-host. See
[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) for what that means in practice.

