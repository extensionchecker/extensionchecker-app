# copilot-instructions.md

## Purpose

This repository contains the `extensionchecker-app` project. The goal of this project is to provide a clear, explainable, and self-hostable browser extension risk analysis tool. Before making any meaningful code changes, read `docs/PRD.md` and treat it as the primary product source of truth.

## Repo rules

All application code must live under `src/`. Do not place application code in the repository root. Root-level files should be limited to repository configuration, documentation, workspace configuration, linting, formatting, testing, and development environment support.

The repository is a monorepo. Maintain a clear separation between these packages:

- `src/frontend/`
- `src/backend/`
- `src/engine/`
- `src/shared/`

Do not collapse responsibilities between packages just because it is faster in the moment. Shared types, schemas, and constants belong in `src/shared/`. Analysis logic belongs in `src/engine/`. Request handling, orchestration, caching, and API concerns belong in `src/backend/`. User interface logic belongs in `src/frontend/`.

## Product alignment

The application must remain aligned with `docs/PRD.md`.

Key expectations:

- The app supports extension submission by full URL, extension ID, or uploaded package file.
- The initial supported ecosystems are Chrome-compatible extensions, Firefox add-ons, and Safari in a practical upload-first, standards-aware way.
- The first version is manifest-first and explainable.
- The UI must be responsive from day one and support light, dark, and system themes.
- The architecture must remain self-hostable and local-dev-friendly.
- The public deployment target is Cloudflare Pages for the frontend and a single Cloudflare Worker for the backend API.
- The engine is a shared library or package, not a separately deployed network service in v1.

If an implementation shortcut would violate these expectations, do not take it without updating the relevant documentation and explaining why.

## Development philosophy

Write production-quality code from the start. Do not intentionally introduce technical debt, placeholder architecture, or junk code. Prefer clean, modular, well-typed TypeScript with explicit contracts and predictable behavior.

Favor simple, durable solutions over clever or fragile ones. The project should solve the actual user problem clearly before adding speculative features.

Keep logic explainable. This project is in the security space, so outputs and risk findings must be understandable and traceable to evidence.

## Local development requirements

Assume contributors will work locally in a Visual Studio Code Dev Container. The project must be runnable locally without requiring live Cloudflare deployment for ordinary development and testing.

Do not hard-wire business logic to Cloudflare-specific runtime behavior unless that behavior is isolated behind a clear boundary or adapter.

Local development should support:

- frontend development
- backend development
- engine testing
- shared package reuse
- end-to-end validation of the main workflow

## Coding standards

Use TypeScript throughout unless there is a compelling documented reason not to.

Prefer:

- strict typing
- small, well-named modules
- explicit interfaces and schemas
- predictable error handling
- pure functions where practical
- minimal hidden coupling

Avoid:

- vague helper sprawl
- duplicate types across packages
- untyped data flow between backend, engine, and frontend
- deeply mixed concerns
- magic constants without explanation
- speculative abstractions that are not yet needed

## Testing and validation

Add meaningful automated tests for business-critical behavior. At a minimum, test:

- manifest parsing
- permission normalization
- risk signal derivation
- report schema stability
- backend request and response behavior

When changing shared contracts, update tests and verify all affected packages still align.

Before considering work complete, validate that the code builds, tests pass, and linting or formatting expectations are met.

## Security and input handling

Treat all extension packages, manifests, URLs, and uploaded files as untrusted input.

Be careful with:

- archive extraction
- file size limits
- malformed package handling
- parsing failures
- path traversal risks
- denial-of-service risk from oversized or adversarial inputs

Do not assume remote package retrieval will always work. File upload is a required fallback path, not an edge case.

## Documentation discipline

If implementation changes architecture, scope, or expected behavior, update the relevant documentation in the same change set. Do not let docs drift far behind the code.

When in doubt:

- update `docs/PRD.md` for product-level changes
- add or update package-level README or design notes for technical changes
- keep comments concise and useful

## Delivery behavior

For new implementation work:

1. Read `docs/PRD.md`.
2. Identify the relevant package boundaries.
3. Propose or implement the smallest clean end-to-end slice that moves the project forward.
4. Keep interfaces stable and explicit.
5. Validate locally.

Do not overbuild future roadmap items before the current slice is complete and coherent.

## Initial priority order

Until the repository matures further, prioritize work in this order:

1. Monorepo and development environment setup
2. Shared schemas and report contracts
3. Backend ingestion flow
4. Engine manifest-first analysis
5. Frontend report rendering
6. Caching and operational hardening
7. Deeper static analysis enhancements

## Final instruction

When making tradeoffs, optimize for clarity, maintainability, explainability, and a clean self-hostable architecture. This project should be something a contributor can understand, run locally, extend safely, and trust.