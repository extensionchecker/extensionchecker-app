# AGENTS.md

> **Audience:** Autonomous coding agents operating in a shell (Claude CLI, OpenAI Codex, and similar). You execute commands, read and write files, and run tests without a human reviewing every intermediate step. The rules in this file are **mandatory blocking gates**, not suggestions. If a gate fails, stop and fix it — do not proceed, do not retry the same approach, do not paper over the failure.

---

## 0. Pre-flight — mandatory before touching any file

Before writing, editing, or deleting any file:

1. **Read every file you intend to touch.** Do not write code based on filenames, imports, or assumptions. Read the actual content.
2. **Read `docs/PRD.md`.** It is the primary product source of truth. If your change conflicts with it, stop and clarify.
3. **Identify the correct package boundary.** Determine which of `src/frontend/`, `src/backend/`, `src/engine/`, or `src/shared/` owns the responsibility you are implementing. Do not place code in the wrong package because it is faster.
4. **Count lines in every file you plan to modify.** If a file exceeds 250 lines of logic, evaluate decomposition before adding anything. If it exceeds 400 lines, decompose it first — adding to a monolith is not allowed.
5. **State the single responsibility of every module you create or modify.** Write it out explicitly. If you cannot express it as one sentence, the module is doing too much.

---

## 1. Repo structure

All application code lives under `src/`. The repository root contains only configuration, documentation, and development environment support — never application logic.

### Package boundaries — hard rules

| Package | Owns |
|---|---|
| `src/shared/` | Types, schemas (Zod), constants shared across packages. Nothing else. |
| `src/engine/` | All analysis logic — manifest parsing, permission normalization, risk scoring, rule evaluation. No HTTP, no I/O. |
| `src/backend/` | Request handling, routing, orchestration, caching, archive extraction, store fetching, rate limiting. No analysis logic. |
| `src/frontend/` | All UI — React components, hooks, pages, API client. No analysis logic, no direct store access. |

Cross-package imports must only flow through published package interfaces. `src/backend/` may import from `src/shared/` and `src/engine/`. `src/frontend/` may import from `src/shared/` only. `src/engine/` may import from `src/shared/` only. These are hard constraints, not guidelines.

---

## 2. Mandatory self-check gates

Run these commands in order after every set of changes. **Do not declare work complete until all four pass with zero errors or failures.**

```bash
# Gate 1 — type correctness across all packages
npm run -w src/shared build 2>&1 | tail -5
npm run -w src/engine build 2>&1 | tail -5
cd src && npx tsc --noEmit -p backend/tsconfig.json 2>&1 | tail -20
cd src && npx tsc --noEmit -p frontend/tsconfig.json 2>&1 | tail -20

# Gate 2 — all tests pass
cd src && npm test 2>&1 | tail -30

# Gate 3 — new tests actually cover new code paths
cd src && npm run -w backend test:coverage 2>&1 | grep -E "^(All|Uncovered|ERROR)"

# Gate 4 — no banned patterns introduced
grep -rn "as any\|@ts-ignore\|@ts-expect\|TODO\|FIXME\|HACK\|// eslint-disable\|dangerouslySetInnerHTML" src/backend/src src/engine/src src/shared/src src/frontend/src
```

Gate 4 must return **no output**. Any match is a blocker. Fix it before proceeding.

---

## 3. Absolute bans — never produce these

The following patterns may not appear in any committed file under `src/`. No exceptions, no justifications.

| Banned pattern | Why |
|---|---|
| `as any` | Destroys type safety silently. Restructure so the type is known. |
| `@ts-ignore` / `@ts-expect-error` | Suppresses type errors instead of fixing them. Fix the type. |
| `// TODO` / `// FIXME` / `// HACK` | Committed technical debt. Finish the work or don't start it. |
| Empty `catch` blocks or `catch (e) {}` | Silent failure. Every error must be handled deliberately. |
| `console.log` in production paths | Use structured logging or remove. `console.error` for server-side error logging only. |
| `dangerouslySetInnerHTML` | XSS vector. Never use with external content. |
| Hardcoded secrets, tokens, or credentials | Use environment variables. |
| `===` for secret/token comparison | Timing side-channel. Use constant-time comparison. |
| `setTimeout`/`setInterval` without cleanup | Memory leaks in long-lived contexts. |
| `require()` in TypeScript files | Use ESM `import`. |
| `process.env` in Worker code | Use Cloudflare Worker bindings and environment variables via the `Env` type. |
| Barrel `utils.ts` or `helpers.ts` | Hidden monolith. Name the module for what it does. |
| Type assertions (`as Foo`) without a comment explaining why | Unchecked casts. |

---

## 4. Module discipline — non-negotiable

Every module has exactly one responsibility, expressible in one sentence. If you cannot write that sentence, the module is wrong.

**Size enforcement:**
- ~250 lines of logic: stop, evaluate, consider decomposition before continuing.
- \>400 lines: **hard stop.** Decompose first, then add. No exceptions.

**File organisation rules:**
- Schemas (Zod), TypeScript types, constants, route handlers, business logic, and UI components each live in separate files. Never merge categories for convenience.
- A new file's name must describe what it does, not that it is miscellaneous.
- If you cannot find a clean home for a function, that is a signal the abstraction boundary is wrong — fix the boundary, do not create a dumping-ground module.

---

## 5. TypeScript — strict everywhere

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` are enabled in all `tsconfig.json` files. Do not weaken them.
- `any` is not a valid type. `unknown` is correct when the type is genuinely unknown; narrow it explicitly.
- Type assertions (`as Foo`) require an inline comment explaining why the assertion is safe.
- Every function parameter, return type, and exported symbol must have an explicit type annotation.
- Zod schemas are required at every system boundary where external data enters: HTTP request bodies, archive metadata, store API responses, URL parameters.

---

## 6. Error handling contract

Every error path is explicit and deliberate. Silent errors are bugs — they prevent diagnosis and mask attacks.

Rules:
- Every `catch` block either re-throws, logs at `console.error`, or returns a typed error response. Empty catch blocks are banned.
- Error **messages returned to callers or HTTP clients** must be generic. Never include stack traces, internal file paths, library names, or implementation details in responses. Those go to server-side logs only.
- Use typed `Result`-style returns or typed `Error` subclasses for expected failure modes. Reserve `throw` for genuinely unexpected states.
- Every `fetch` call must have a timeout. A fetch without a timeout is a denial-of-service vector.
- Streaming / SSE error handlers must emit a generic message to the stream, then log the real error server-side. Never forward `error.message` directly to a stream.

---

## 7. Security — think like an attacker on every function

This is a security analysis tool. Assume all inputs are adversarial until proven otherwise. For every function that touches external input, answer all five:

1. What does a malicious actor send to **crash or hang** this?
2. What does a malicious actor send to **bypass a security control**?
3. What does a malicious actor send to **exhaust memory, CPU, or bandwidth**?
4. What does a malicious actor send that is **technically valid but semantically dangerous**?
5. What happens with **empty, null, maximum-size, deeply nested, and Unicode edge-case** input?

If you cannot answer all five with confidence, the code is not ready.

### Security controls — enforced, not advisory

**Archive processing (ZIP/CRX/XPI) — highest-risk input surface:**
- Enforce entry count limits, per-entry size limits, and total uncompressed size limits before any decompression begins.
- Verify compression ratios from the ZIP central-directory headers before inflating. Never trust declared uncompressed size without checking the ratio. Reject zip bombs.
- Reject any entry filename containing `../`, beginning with `/`, or containing null bytes (`\0`). Path traversal is a hard reject, not a sanitise-and-continue.
- Only decompress entries that analysis actually needs. Selective extraction is mandatory.

**SSRF:**
- Validate every URL derived from user input before issuing any fetch. Validation happens immediately before the fetch, not only at the API boundary.
- Block: all private IPv4 ranges (`10/8`, `172.16/12`, `192.168/16`, `127/8`), IPv4-mapped IPv6 (`::ffff:*`), IPv6 loopback (`::1`), ULA (`fc00::/7`), link-local (`fe80::/10`), localhost, `.local` domains, cloud metadata endpoint (`169.254.254.254`).
- Validate `response.url` (the post-redirect final URL) after every fetch completes, not just the initial URL. HTTP redirects can bypass pre-fetch validation.
- When parsing WHATWG URL hostnames for IPv6, strip surrounding brackets (`[::1]` → `::1`) before running private-address checks.

**Timing attacks:**
- Token and secret comparisons must use constant-time comparison. `===` is not acceptable. Implement with XOR over padded equal-length byte arrays, iterating the full length regardless of mismatch.

**Injection:**
- Manifest fields, locale strings, and store metadata must never be rendered as raw HTML.
- `dangerouslySetInnerHTML` is banned. React's automatic escaping is the mechanism — do not bypass it.

**Information disclosure:**
- Error responses to HTTP clients must never include stack traces, internal paths, library versions, or raw `error.message` from runtime errors.
- Log full details server-side via `console.error`. Return a generic, fixed-string message to the client.

**Denial of service:**
- Size limits, entry count limits, rate limits, and fetch timeouts are security controls. Enforce them at the earliest possible point — before expensive work begins.

---

## 8. Testing — concurrent with implementation

Tests are not written after features. A feature is not done until its tests exist and pass.

**Required coverage areas:**
- Manifest parsing: valid, invalid, edge cases, adversarial inputs
- Permission normalization: all known permission types and combinations
- Risk signal derivation: every scoring rule and dangerous combination
- Report schema: valid reports pass, invalid reports are caught by Zod
- Backend request/response: success paths, error paths, size limits, malformed input, rate limiting
- Archive extraction: valid archives, zip bombs, path traversal, null bytes, oversized entries
- URL validation: every private IP family, post-redirect scenarios, IPv4-mapped IPv6, bracket hostnames

**Discipline:**
- Every module is independently unit-testable without starting unrelated systems. If it is not, the design is wrong; fix the design.
- Unhappy paths, error responses, boundary violations, and adversarial payloads are first-class test cases.
- When changing a shared contract in `src/shared/`, update and verify tests in every affected package before declaring the work done.
- Trivial tests that inflate coverage numbers without validating behaviour are worse than no tests. Write tests that would catch real bugs.

**Definition of done (all must be true before declaring a task complete):**

- [ ] `tsc --noEmit` passes with zero errors across all four packages
- [ ] All tests pass with zero failures
- [ ] Coverage thresholds are met across all packages
- [ ] Gate 4 (banned pattern grep) returns no output
- [ ] The implementation can be explained clearly to a contributor who was not present

---

## 9. Cloudflare Worker runtime constraints

The backend runs in the Cloudflare Workers runtime, not Node.js. Do not use Node.js-specific APIs unless they are explicitly provided by the Workers compatibility layer.

Banned in Worker code:
- `process.env` — use the `Env` type and Worker bindings instead
- `fs`, `path`, `os`, `child_process`, `crypto` (Node built-ins) — use Web Crypto API (`crypto.subtle`) and Worker-native equivalents
- `Buffer` — use `Uint8Array` and `TextEncoder`/`TextDecoder`
- `setTimeout`/`setInterval` for deferred work — Workers have execution time limits; do not rely on deferred timers
- Any library that requires a native Node.js add-on

---

## 10. Anti-brute-force / anti-retry discipline

If an approach fails, stop and think — do not retry the same approach. Specifically:

- If a test fails, read the failure message carefully. Fix the root cause; do not modify the test to pass unless the test itself is wrong.
- If a type error appears, fix the type; do not suppress it with `@ts-ignore` or `as any`.
- If the same approach fails twice, it is wrong. Choose a different approach.
- If a shell command produces unexpected output, read and understand it before running another command.
- Do not issue destructive commands (`rm -rf`, `git reset --hard`, `git push --force`) without explicit instruction.

---

## 11. Documentation discipline

If your change modifies architecture, behaviour, or adds a new security control, update documentation in the same changeset:

- **`docs/PRD.md`** — product-level changes only
- **`docs/threatmodel/THREAT_MODEL.md`** — new threats, new mitigations, changed residual risk
- **`docs/threatmodel/ARCHITECTURE.md`** — module table, backend section, security controls list
- **`docs/threatmodel/DATA_FLOWS.md`** — any new validation step in a data flow diagram
- Package-level notes for significant technical decisions

Do not let documentation drift from the code.

---

## 12. Initial priority order

Until the repository matures further:

1. Monorepo and development environment setup
2. Shared schemas and report contracts
3. Backend ingestion flow
4. Engine manifest-first analysis
5. Frontend report rendering
6. Caching and operational hardening
7. Deeper static analysis enhancements

---

## Final instruction

When making tradeoffs, optimize for clarity, security, maintainability, and explainability. Every decision should be something a security-conscious contributor can read, understand, and trust. Shortcuts that save time now create vulnerabilities later. In a security tool, "we'll fix it later" means "we have a security vulnerability."