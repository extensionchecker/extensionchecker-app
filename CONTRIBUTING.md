# Contributing to ExtensionChecker

Thank you for your interest in contributing! This document explains how to get
started and what we expect from contributions.

---

## Your first contribution

Not sure where to start? Look for issues tagged
[**good first issue**](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
— these are deliberately scoped to be approachable without deep familiarity
with the whole codebase.

Issues tagged
[**help wanted**](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
are a step up in complexity but still well-defined.

If you have a question before diving in, open a
[GitHub Discussion](../../discussions) rather than an issue. Discussions are
the right place for "how does this work?", "would X be a good idea?", or "I'm
stuck on Y" conversations. Issues are for concrete, actionable work items.

---

## Getting Started

1. **Fork and clone** the repository.
2. Open the project in **VS Code** with the included Dev Container
   (`.devcontainer/`). This ensures a consistent development environment with
   the correct Node version, all tools pre-installed, and no local machine
   setup required.
3. Install dependencies:
   ```bash
   cd src
   npm ci
   ```
4. Run the full check to make sure everything is green before you change
   anything:
   ```bash
   npm run lint && npm run test:coverage && npm run build
   ```

---

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

---

## Development Workflow

### Running everything

```bash
cd src
npm run dev       # frontend on :5173, backend on :8787 (in parallel)
```

The frontend dev server proxies `/api/*` to the backend automatically —
no environment variables are needed for local development.

### Checking, testing, building

| Command | What it does |
|---------|-------------|
| `npm run lint` | TypeScript type-check (`tsc --noEmit`) across all packages |
| `npm run test` | Run all tests with Vitest (no coverage) |
| `npm run test:coverage` | Run all tests with V8 coverage report |
| `npm run build` | Build all packages |

### Running a single package

Every command accepts a `--workspace` flag when you want to target one package:

```bash
npm run test --workspace=backend
npm run test:coverage --workspace=engine
npm run lint --workspace=shared
```

This is faster during active development and gives cleaner output than running
the full workspace.

### Starting dev servers individually

```bash
# Backend only (Wrangler dev server on :8787)
cd src/backend && npm run dev

# Frontend only (Vite dev server on :5173)
cd src/frontend && npm run dev
```

---

## Pull Requests

- **One logical change per PR.** Small, focused PRs get reviewed faster and
  are less likely to cause merge conflicts.
- Ensure `npm run lint`, `npm run test:coverage`, and `npm run build` pass
  before submitting.
- Write or update tests for any changed behaviour. An untested code path is an
  unknown code path — in a security tool, that is not acceptable.
- Update documentation if your change affects architecture, APIs, or
  user-facing behaviour.
- Fill in the PR description explaining **what** changed and **why**. The PR
  template has prompts — use them.

---

## Commit messages

There is no enforced commit message format. Write clear, self-contained
messages that explain what changed and why. A good rule of thumb:

```
Fix timing side-channel in token comparison

Replace string equality with a constant-time XOR comparison so that
response latency does not vary with the length of the correct token.
```

If a commit closes an issue, add `Closes #123` at the end of the message body.

---

## Coding Standards

- **TypeScript** throughout. Strict typing, explicit interfaces, no `any`.
- Small, well-named modules with one clearly-statable responsibility.
- Pure functions for business logic wherever practical.
- Follow the existing code style — the project uses consistent conventions.
- See [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) for detailed guidelines.

---

## Reporting Bugs

Open a [GitHub Issue](../../issues/new/choose) using the **Bug report**
template. Include:

- Steps to reproduce (minimal and specific)
- Expected vs. actual behaviour
- Browser and OS if the bug is UI-related

For general questions, use [GitHub Discussions](../../discussions) instead.

---

## Security Vulnerabilities

**Do not open a public issue for security vulnerabilities.** Instead, please
follow the process in [SECURITY.md](SECURITY.md). The short version: use
[GitHub Security Advisories](../../security/advisories/new) (preferred) or
email `security@extensionchecker.org`.

---

## Code of Conduct

All contributors must follow our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
