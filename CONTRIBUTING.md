# Contributing to ExtensionChecker

Thank you for your interest in contributing! This document explains how to get
started and what we expect from contributions.

## Getting Started

1. **Fork and clone** the repository.
2. Open the project in **VS Code** with the included Dev Container
   (`.devcontainer/`). This ensures a consistent development environment.
3. Install dependencies:
   ```bash
   cd src
   npm ci
   ```
4. Run the full check:
   ```bash
   npm run lint && npm run test:coverage && npm run build
   ```

## Repository Structure

All application code lives under `src/`. The monorepo contains four packages:

| Package | Path | Purpose |
|---------|------|---------|
| `@extensionchecker/shared` | `src/shared/` | Shared types, Zod schemas, constants |
| `@extensionchecker/engine` | `src/engine/` | Manifest analysis logic |
| `@extensionchecker/backend` | `src/backend/` | Hono API, ingestion, orchestration |
| `@extensionchecker/frontend` | `src/frontend/` | React UI |

See [docs/PRD.md](docs/PRD.md) for product requirements and
[AGENTS.md](AGENTS.md) for architecture guidelines.

## Development Workflow

- **Lint**: `npm run lint` (TypeScript type-checking across all packages)
- **Test**: `npm run test:coverage` (Vitest with coverage)
- **Build**: `npm run build` (builds all packages)
- **Dev servers**: `npm run dev` (starts frontend + backend in parallel)

The frontend dev server runs on `http://localhost:5173` and proxies `/api/*`
to the backend on `http://localhost:8787`.

## Pull Requests

- Keep PRs focused. One logical change per PR.
- Ensure `npm run lint`, `npm run test:coverage`, and `npm run build` pass
  before submitting.
- Write or update tests for any changed behavior.
- Update documentation if your change affects architecture, APIs, or user-
  facing behavior.
- Fill in the PR description explaining **what** changed and **why**.

## Coding Standards

- **TypeScript** throughout. Strict typing, explicit interfaces, no `any`.
- Small, well-named modules. Prefer pure functions where practical.
- Follow the existing code style — the project uses consistent formatting
  conventions already in place.
- See [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) for detailed guidelines.

## Reporting Bugs

Open a [GitHub Issue](../../issues) with:

- Steps to reproduce
- Expected vs. actual behavior
- Browser/environment details if relevant

## Security Vulnerabilities

**Do not open a public issue for security vulnerabilities.** Instead, please
follow the process in [SECURITY.md](SECURITY.md).

## Code of Conduct

All contributors must follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
