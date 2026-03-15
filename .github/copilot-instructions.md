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

### Cross-package import rules — hard constraints

- `src/backend/` may import from `src/shared/` and `src/engine/` only.
- `src/frontend/` may import from `src/shared/` only.
- `src/engine/` may import from `src/shared/` only.
- `src/shared/` imports from nothing else in this monorepo.

Never suggest an import that crosses these boundaries. If a type or function is needed in multiple packages, it belongs in `src/shared/`.

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

Write production-quality, production-ready code from the start — every time, without exception. This is a security product. Half-measures, placeholder code, and "we'll clean it up later" thinking are not acceptable. Code that contributors cannot trust is code that users cannot trust.

**Never write monoliths.** Every file must have a single, clearly statable responsibility. A file that cannot be described in one sentence is doing too much. A file growing past ~250 lines of logic is a warning sign that decomposition is needed. A file past ~400 lines is almost certainly a monolith — do not add new functionality to it; decompose it first, then add. This rule applies to React components, route handlers, utility modules, engine files, and everything else. No exceptions for expediency.

**Actively find and eliminate technical debt.** "Don't create tech debt" is a floor, not a ceiling. When you encounter an overgrown file, tangled concern, duplicated type, untested path, or unclear boundary — fix it in the current changeset, not a future ticket. Technical debt in a security tool is not just a maintenance burden; it is an attack surface.

Favor simple, durable solutions over clever or fragile ones. Solve the actual problem stated — do not overbuild for hypothetical future needs.

Keep all logic explainable. If a piece of logic is hard to describe in plain language, it is probably wrong or unnecessarily complex. Every risk finding produced by this tool must be traceable to concrete evidence.

## Never suggest these patterns

These patterns are banned. Do not generate them, do not suggest them as workarounds, do not leave them in completions even in comments or examples.

| Banned pattern | Why |
|---|---|
| `as any` | Destroys type safety silently. Restructure so the type is known. |
| `@ts-ignore` / `@ts-expect-error` | Suppresses type errors instead of fixing them. Fix the type. |
| `// TODO` / `// FIXME` / `// HACK` | Committed technical debt. Finish the work or don't suggest it. |
| Empty `catch` blocks or `catch (e) {}` | Silent failure. Every error must be handled deliberately. |
| `console.log` in production paths | Use `console.error` for server-side error logging only. Remove debug logs. |
| `dangerouslySetInnerHTML` | XSS vector. Never use with external content. |
| Hardcoded secrets, tokens, or credentials | Use environment variables. |
| `===` for secret/token comparison | Timing side-channel. Use constant-time comparison. |
| `setTimeout`/`setInterval` without cleanup | Memory leaks in long-lived contexts. |
| `require()` in TypeScript files | Use ESM `import`. |
| `process.env` in Worker code | Use Cloudflare Worker bindings and environment variables via the `Env` type. |
| `utils.ts` or `helpers.ts` as a filename | Hidden monolith. Name every module for what it specifically does. |
| Type assertions (`as Foo`) without an explanatory comment | Unchecked casts. Always explain why the assertion is safe. |
| `Buffer` in Worker code | Use `Uint8Array` and `TextEncoder`/`TextDecoder`. |
| `fs`, `path`, `os`, `child_process` in Worker code | Workers are not Node.js. Use Web platform APIs. |

## Coding standards

Use TypeScript throughout. Use strict mode. Enable `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. There is no acceptable reason to use `any`.

**Module discipline — non-negotiable:**

- Every module has exactly one responsibility, expressible in a single sentence. If you cannot state it in one sentence, split the module.
- A file growing past ~250 lines of logic is a decomposition warning. Stop and evaluate before adding more.
- A file past ~400 lines must be decomposed before any new functionality is added to it.
- Schemas (Zod), TypeScript types, constants, route handlers, business logic, and UI components each live in separate files. Never merge them for convenience.
- A new file's name must describe what it does, not that it is miscellaneous.

**TypeScript discipline:**

- `any` is not a valid type. `unknown` is correct when the type is genuinely unknown; narrow it explicitly before use.
- Every function parameter, return type, and exported symbol must have an explicit type annotation.
- Zod schemas are required at every system boundary where external data enters: HTTP request bodies, archive metadata, store API responses, URL parameters.
- Type assertions (`as Foo`) require an inline comment explaining why the assertion is safe.

**Testability as a design constraint:**

- If a piece of logic is difficult to unit test in isolation, the design is wrong. Restructure until it is independently testable.
- Avoid hidden side effects and global mutable state — they make code unpredictable and tests unreliable.
- Pure functions are strongly preferred for all business logic: same input always produces same output, no surprises.

Prefer:

- strict, explicit TypeScript types — no implicit `any`, no type assertions without justification
- small, focused modules with one clear job
- explicit interfaces and Zod schemas at all system boundaries
- predictable, deliberate error handling — every error path is intentional, never silent
- pure functions for all analysis, scoring, and transformation logic
- dependency injection over hidden imports for anything that needs to be tested or swapped

Avoid:

- monolithic files — this is a first-class defect, not a style preference
- vague helper sprawl — if it has no clear home, create the right module for it
- duplicate type definitions across packages — shared contracts belong in `src/shared/`
- untyped data crossing package boundaries
- functions that mix HTTP concerns with business logic
- magic numbers and strings — every constant must be named and explained
- speculative abstractions — only build what is needed right now

## Error handling contract

Every error path is explicit and deliberate. Silent errors are bugs — they prevent diagnosis and mask attacks.

- Every `catch` block must re-throw, log at `console.error`, or return a typed error response. Empty catch blocks are banned.
- Error messages returned to callers or HTTP clients must be generic. Never include stack traces, internal file paths, library names, or implementation details in responses.
- Use typed `Result`-style returns or typed `Error` subclasses for expected failure modes. Reserve `throw` for genuinely unexpected states.
- Every `fetch` call must have a timeout. A fetch without a timeout is a denial-of-service vector.
- Streaming / SSE error handlers must emit a generic message to the stream, then log the real error server-side. Never forward `error.message` directly to a client or stream.

## Security and input handling

**This is a security product. Think like an attacker at all times.**

Do not assume any input is safe. Extension packages from known stores, manifest JSON extracted from those packages, user-supplied URLs, extension IDs, uploaded files, HTTP headers, query parameters — all of it is potentially adversarial until validated.

**For every function that touches external input, consider:**

- What does a malicious actor send here to crash or hang the process?
- What does a malicious actor send here to bypass a security control?
- What does a malicious actor send here to exhaust memory, CPU, or bandwidth?
- What does a malicious actor send here that is technically valid but semantically dangerous?
- What happens with empty, null, maximum-size, deeply nested, and Unicode edge-case input?

**Security controls — always enforce, never relax:**

- **Archive processing** — ZIP/CRX/XPI archives are the highest-risk input surface. Entry count limits, per-entry size limits, total uncompressed size limits, and compression ratio checks must all be enforced before any decompression begins. Reject zip bombs, path traversal entries (`../`, leading `/`), and null bytes in filenames.
- **SSRF** — Validate every URL derived from user input before issuing any fetch. Block all private IPv4 ranges (`10/8`, `172.16/12`, `192.168/16`, `127/8`), IPv4-mapped IPv6 (`::ffff:*`), IPv6 loopback (`::1`), ULA (`fc00::/7`), link-local (`fe80::/10`), localhost, `.local` domains, and the cloud metadata endpoint (`169.254.169.254`). Also validate `response.url` (the post-redirect final URL) — HTTP redirects can bypass pre-fetch validation. When parsing WHATWG URL hostnames for IPv6, strip surrounding brackets (`[::1]` → `::1`) before private-address checks.
- **Timing attacks** — Token and secret comparisons must use constant-time comparison (XOR over padded equal-length byte arrays). `===` is not acceptable for secrets.
- **Injection** — Manifest fields, locale strings, and store metadata must never be rendered as raw HTML. `dangerouslySetInnerHTML` is banned. React's automatic escaping is the mechanism — do not bypass it.
- **Information disclosure** — Error responses to HTTP clients must never include stack traces, internal paths, library versions, or raw `error.message`. Log full details server-side, return a generic fixed-string message to the client.
- **DoS** — Size limits, entry count limits, rate limits, and fetch timeouts are security controls, not performance hints. Enforce them before expensive work begins.

Do not assume remote package retrieval will behave honestly, return what it claims, or complete in a reasonable time. File upload is a required fallback path, not a secondary convenience feature.

## Testing and validation

Tests are not optional and are not written after the fact. A feature is not done until it is tested. An untested code path is an unknown code path — in a security tool, unknown behaviour is unacceptable.

**Required test coverage at minimum:**

- Manifest parsing — valid, invalid, edge cases, adversarial inputs
- Permission normalization — all known permission types and combinations
- Risk signal derivation — every scoring rule and dangerous combination
- Report schema stability — valid reports pass, invalid reports are caught by Zod
- Backend request and response — success paths, error paths, size limits, malformed input, rate limiting
- Archive extraction — valid archives, zip bombs, path traversal, null bytes, oversized entries
- URL validation — every private IP family, post-redirect scenarios, IPv4-mapped IPv6, bracket hostnames

**Testing discipline:**

- Every module must be independently unit-testable without standing up unrelated systems. If it is not, the design must change.
- Unhappy paths, error responses, boundary violations, and adversarial payloads are first-class test cases — test them as thoroughly as happy paths.
- When changing any shared contract in `src/shared/`, update and verify tests in every affected package before the work is considered done.
- Coverage thresholds are a floor, not a goal. Trivial tests that inflate numbers without validating behaviour are worse than no tests at all.

**Definition of done — work is not complete until:**

1. `tsc --noEmit` passes with zero type errors across all packages (`npm run lint` in each package)
2. All tests pass with zero failures (`npm test` from `src/`)
3. Coverage thresholds are met across all packages
4. No banned patterns exist in the changed files
5. The implementation can be clearly explained to a contributor who was not present

## Cloudflare Worker runtime — backend constraints

The backend runs in the Cloudflare Workers runtime, not Node.js. Completions in `src/backend/` must comply with these constraints:

- Do not use `process.env` — use the `Env` type and Worker bindings instead.
- Do not import `fs`, `path`, `os`, `child_process`, or `crypto` (Node built-ins) — use Web Crypto API (`crypto.subtle`) and Worker-native equivalents.
- Do not use `Buffer` — use `Uint8Array` and `TextEncoder`/`TextDecoder`.
- Do not use `setTimeout`/`setInterval` for deferred work — Workers have execution time limits.
- Do not add libraries that require native Node.js add-ons.

## Documentation discipline

If a suggested change modifies architecture, scope, or expected behaviour, the corresponding documentation must be updated in the same change set. Do not let docs drift from the code.

When in doubt:

- Update `docs/PRD.md` for product-level changes.
- Update `docs/threatmodel/` files for security-relevant changes.
- Add or update package-level notes for significant technical decisions.
- Keep comments concise and useful — do not add docstrings to unchanged code.

## Delivery behaviour

For new implementation work:

1. Read `docs/PRD.md`.
2. Identify the relevant package boundaries.
3. Implement the smallest clean end-to-end slice that moves the project forward.
4. Keep interfaces stable and explicit.
5. Validate: type-check, test, check for banned patterns.

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

When making tradeoffs, optimize for clarity, security, maintainability, and explainability. Every suggested change should be something a security-conscious contributor can read, understand, and trust. Shortcuts that save time now create vulnerabilities later. In a security tool, "we'll fix it later" means "we have a security vulnerability."

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

Write production-quality, production-ready code from the start - every time, without exception. This is a security product. Half-measures, placeholder code, and "we'll clean it up later" thinking are not acceptable here. Code that contributors cannot trust is code that users cannot trust.

**Never write monoliths.** Every file must have a single, clearly statable responsibility. A file that cannot be described in one sentence is doing too much. A file growing past ~250 lines of logic is a warning sign that decomposition is needed. A file past ~400 lines is almost certainly a monolith - do not add new functionality to it; decompose it first, then add. This rule applies to React components, route handlers, utility modules, engine files, and everything else. No exceptions for expediency.

**Actively find and eliminate technical debt.** "Don't create tech debt" is a floor, not a ceiling. When you encounter an overgrown file, tangled concern, duplicated type, untested path, or unclear boundary - fix it in the current changeset, not a future ticket. Technical debt in a security tool is not just a maintenance burden; it is an attack surface.

Favor simple, durable solutions over clever or fragile ones. Solve the actual problem stated - do not overbuild for hypothetical future needs.

Keep all logic explainable. If a piece of logic is hard to describe in plain language, it is probably wrong or unnecessarily complex. Every risk finding produced by this tool must be traceable to concrete evidence.

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

Use TypeScript throughout. Use strict mode. Enable `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. There is no acceptable reason to use `any`.

**Module discipline - non-negotiable:**

- Every module has exactly one responsibility, expressible in a single sentence. If you cannot state it in one sentence, split the module.
- A file growing past ~250 lines of logic is a decomposition warning. Stop and evaluate before continuing.
- A file past ~400 lines must be decomposed before any new functionality is added to it.
- Schemas, types, constants, route handlers, business logic, and UI components belong in separate files. Never merge them for convenience.
- A `utils.ts` or `helpers.ts` with unrelated functions is a hidden monolith. Name modules for what they do, not for the fact that they are miscellaneous.

**Testability as a design constraint:**

- If a piece of logic is difficult to unit test in isolation, the design is wrong. Restructure until it is independently testable.
- Avoid hidden side effects and global mutable state - they make code unpredictable and tests unreliable.
- Pure functions are strongly preferred for all business logic: same input always produces same output, no surprises.

Prefer:

- strict, explicit TypeScript types - no implicit `any`, no type assertions without justification
- small, focused modules with one clear job
- explicit interfaces and Zod schemas at all system boundaries
- predictable, deliberate error handling - every error path is intentional, never silent
- pure functions for all analysis, scoring, and transformation logic
- dependency injection over hidden imports for anything that needs to be tested or swapped

Avoid:

- monolithic files - this is a first-class defect, not a style preference
- vague helper sprawl - if it has no clear home, create the right module for it
- duplicate type definitions across packages - shared contracts belong in `src/shared/`
- untyped data crossing package boundaries
- functions that mix HTTP concerns with business logic
- magic numbers and strings - every constant must be named and explained
- speculative abstractions - only build what is needed right now

## Testing and validation

Tests are not optional and are not written after the fact. A feature is not done until it is tested. An untested code path is an unknown code path - in a security tool, unknown behavior is unacceptable.

**Required test coverage at minimum:**

- manifest parsing - valid, invalid, edge cases, adversarial inputs
- permission normalization - all known permission types and combinations
- risk signal derivation - every scoring rule and dangerous combination
- report schema stability - valid reports pass, invalid reports are caught
- backend request and response behavior - success paths, error paths, size limits, malformed input, rate limiting
- archive extraction - valid archives, zip bombs, path traversal, null bytes, oversized entries

**Testing discipline:**

- Every module must be independently unit-testable without standing up unrelated systems. If it is not, the design must change.
- Test unhappy paths as thoroughly as happy paths. Error responses, boundary violations, malformed input, and adversarial payloads are first-class test cases, not afterthoughts.
- When changing any shared contract, update and verify tests in every affected package before the work is considered done.
- Coverage thresholds are a floor, not a goal. Trivial tests that inflate numbers without validating behavior are worse than no tests at all.

**Definition of done - work is not complete until:**

1. `tsc --noEmit` passes with zero type errors across all packages
2. All tests pass with zero failures
3. Coverage thresholds are met across all packages
4. Lint and format checks pass
5. The implementation can be clearly explained to a contributor who was not present

## Security and input handling

**This is a security product. Think like an attacker at all times.**

Do not assume any input is safe. Extension packages from known stores, manifest JSON extracted from those packages, user-supplied URLs, extension IDs, uploaded files, HTTP headers, query parameters - all of it is potentially adversarial until validated. An attacker who controls any input is actively trying to crash the system, bypass a control, or exfiltrate data.

**For every function that touches external input, ask:**

- What does a malicious actor send here to crash or hang the process?
- What does a malicious actor send here to bypass a security control?
- What does a malicious actor send here to exhaust memory, CPU, or bandwidth?
- What does a malicious actor send here that is technically valid but semantically dangerous?
- What happens with empty input, null input, maximum-size input, deeply nested structures, and Unicode edge cases?

If you cannot confidently answer all five, the code is not ready.

**Security controls by area:**

- **Archive processing** - ZIP/CRX/XPI archives are the highest-risk input surface in this codebase. Entry count limits, compression ratio limits, per-file size limits, null bytes in filenames, and path traversal sequences must all be enforced before any decompression occurs. Selective decompression is not optional - only extract what the analysis actually needs.
- **SSRF** - any URL or hostname derived from user input must be validated against a strict allowlist before a fetch is issued. Private IP ranges (`10/8`, `172.16/12`, `192.168/16`, `127/8`), localhost, `.local` domains, and cloud metadata endpoints (`169.254.169.254`) must be explicitly blocked. URL validation must happen before every fetch, not just at the API boundary.
- **Zip bombs** - always verify compression ratios from ZIP central-directory headers before inflating any entry. Never trust the declared uncompressed size without checking the ratio.
- **Path traversal** - reject any filename or resolved path containing `../` or beginning with `/`. This applies to archive entries, file lookups, and any path computation derived from external input.
- **Denial of service** - size limits, entry count limits, rate limits, and fetch timeouts are security controls, not performance hints. Enforce them at the earliest possible point in the request lifecycle, before any expensive work begins.
- **Injection** - manifest fields, locale strings, and store metadata must never be rendered as raw HTML. Never use `dangerouslySetInnerHTML` with external content. React auto-escapes interpolated values - rely on that, and avoid patterns that bypass it.
- **Information disclosure** - error responses must never include stack traces, internal file paths, library versions, or implementation details. Generic error messages are correct; verbose ones are a vulnerability.
- **Timing attacks** - token and secret comparisons must use constant-time comparison. Standard string equality (`===`) is not acceptable for secret validation.

Do not assume remote package retrieval will behave honestly, return what it claims, or complete in a reasonable time. File upload is a required fallback path, not a secondary convenience feature.

When in doubt about whether a validation is necessary, add it. The cost of an unnecessary check is negligible. The cost of a missing one is a vulnerability in a security tool - which is the worst possible place to have one.

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