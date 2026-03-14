# PRD

## ExtensionChecker App

### Document Status

This Product Requirements Document (PRD) defines the initial product direction, scope, architecture constraints, and implementation expectations for the `extensionchecker-app` repository. It is intended to guide Coding LLMs and human contributors toward a coherent first implementation without over-constraining technical decisions that are better finalized during delivery. This document is the primary product source of truth for the application repository and should be treated as authoritative unless it is explicitly superseded by a later revision.

### Overview

ExtensionChecker exists to solve a simple but important problem: browser extensions are often granted powerful access to a user's browsing activity, page content, authentication context, and network traffic, yet most users have little practical ability to understand the real implications of those permissions. The application will allow a user to submit a browser extension by full URL, extension identifier, or uploaded package and receive a clear, structured, human-readable risk report. The goal is not to produce a magical or opaque trust verdict, but to explain what an extension can access, what it could plausibly do, and why a user should care.

### Problem Statement

Browser extensions are a meaningful security and privacy risk surface. Many request broad permissions, inject content scripts into arbitrary pages, access cookies or tabs, or communicate with remote services in ways that ordinary users cannot easily interpret. There is a gap in the public internet for a dead-simple, free, fast tool that explains extension risk in plain language. Existing approaches are either gone, too academic, too enterprise-focused, too opaque, or too inconvenient for casual use. ExtensionChecker is intended to fill that gap with an open source, self-hostable, standards-aware tool that prioritizes clarity, explainability, and ease of use.

### Product Vision

ExtensionChecker should become the easiest way for a person to answer a simple question: "How dangerous or safe is this browser extension, and what exactly can it see or do?" The public instance should be lightweight, fast, and accessible to anyone. The codebase should also be easy to fork, self-host, and extend. The project is a public-good utility first, not a monetization vehicle. Commercial use by others is acceptable under the project license, but the official project should remain a credible and freely available open source implementation.

## Goals

### Primary Goals

The product must provide a simple workflow for analyzing browser extensions from multiple input methods. A user should be able to submit a full store URL, submit only an extension identifier, or upload an extension package file and receive a useful report without needing deep security expertise. The report must be understandable by non-experts while still being rigorous enough to satisfy technically literate users.

The product must produce a structured, explainable risk report. It should identify the permissions requested, the host access granted, the capabilities implied by those permissions, the potentially dangerous combinations present, and a concise summary of the extension's risk profile. The scoring model in the initial release must be deterministic and explainable rather than heuristic and mysterious.

The product must be open source, self-hostable, and portable. The official public deployment is only one instance of the project. The codebase must be organized so others can run it locally, in a Visual Studio Code (VS Code) Dev Container, or deploy it on their own infrastructure with minimal friction.

### Secondary Goals

The product should establish a clean foundation for future enhancement, including deeper static analysis of JavaScript, improved package acquisition strategies, broader browser ecosystem support, richer reporting, and potentially a command-line interface (CLI). The initial implementation should intentionally create room for that evolution without forcing those capabilities into the first version.

The product should be responsive and visually polished from day one. It does not need to be flashy, but it must feel modern, obvious, and trustworthy on mobile, tablet, and desktop. Light mode, dark mode, and system theme support must be built in from the start rather than bolted on later.

## Non-Goals

### Initial Release Non-Goals

The initial release is not intended to be a comprehensive malware sandbox, dynamic behavior detonation platform, enterprise governance suite, or browser extension reputation service. It will not attempt to prove whether an extension is "safe" in an absolute sense. It will also not attempt to continuously crawl and index every extension store in the world. Those ideas may become future roadmap items, but they are explicitly out of scope for version one.

The initial release will not include user accounts, saved scan histories, subscriptions, billing, administrative dashboards, or collaborative workflows. It will not attempt to become a generalized browser extension marketplace or review platform. It should stay tightly focused on ingestion, analysis, and reporting.

The initial release will not over-promise support for every browser ecosystem or every store retrieval workflow. Where direct package retrieval is difficult or restricted, file upload must serve as a practical fallback. Safari support should be handled carefully and honestly, with an emphasis on standards-aware package analysis rather than pretending that Safari distribution behaves exactly like Chromium-based stores.

## Target Users

### Primary Users

The primary users are ordinary internet users, security-conscious power users, and technically literate professionals who want a quick, understandable view of what a browser extension can access. These users may not know how to inspect a manifest file or unpack an extension package, but they care about privacy, security, and trust.

### Secondary Users

The secondary users are security practitioners, researchers, open source contributors, and organizations that may want to self-host the tool for internal use. These users are more likely to care about portability, architecture quality, deterministic output, and the ability to extend or automate the analysis pipeline.

## Product Principles

### Explainability First

Every risk score or finding must be tied to visible evidence and understandable reasoning. Users should never be left with a black-box number that offers no explanation. If the tool says a permission or configuration is high risk, it must also say why.

### Simplicity Over Cleverness

The first release must solve the core problem with minimal friction. It is better to produce a strong, useful manifest-first report than to delay release for a fragile, over-engineered code analysis system. The application should prioritize reliability and clarity over novelty.

### Honest Boundaries

The product must be explicit about what it knows, what it inferred, and what it could not determine. A successful scan does not mean an extension is definitively safe. A limited scan does not mean the extension is malicious. The tool must communicate limits clearly and professionally.

### Public Good and Portability

The official instance should be free and useful, but the architecture must not assume everyone will use the official instance forever. The application should be easy to run locally, easy to fork, and easy to self-host.

## Repository and Project Structure

### Repositories

This product ecosystem is split into two repositories. The `extensionchecker-app` repository contains the actual application code for the scanner, analysis engine, shared models, and app-facing user interface. The `extensionchecker-site` repository is a separate static or static-site-generation (SSG) project used for the public-facing project site, documentation landing page, about content, privacy policy, and contribution guidance. The application PRD in this document applies specifically to `extensionchecker-app`.

### Monorepo Requirement

`extensionchecker-app` must be implemented as a monorepo. This is required because the frontend, backend, engine, and shared models all need to evolve together, share types, and remain consistent. All code must live under `src/`. There must be no application code in the repository root.

### Required Top-Level Code Layout

The initial monorepo structure must follow this high-level model:

- `src/frontend/`
- `src/backend/`
- `src/engine/`
- `src/shared/`

The `frontend` package contains the application user interface. The `backend` package contains the application programming interface (API) and ingestion layer. The `engine` package contains the analysis logic. The `shared` package contains shared types, schemas, constants, and cross-package models. Additional support directories may exist for documentation, configuration, tests, or scripts, but application code must begin under `src/`.

## Functional Scope

### Supported Inputs

The application must support three user input patterns from the first meaningful version. First, the user may provide the full URL of a browser extension listing page. Second, the user may provide only the extension identifier, and the system will attempt to resolve it. Third, the user may upload a local extension package file such as `.crx`, `.xpi`, or `.zip`.

These multiple input methods are essential because store retrieval workflows are inconsistent across browser ecosystems and may change over time. File upload is not a secondary convenience feature. It is a required fallback and a core part of the product strategy.

### Supported Browser Ecosystems

The first release must target Chrome-compatible extensions, Firefox add-ons, Microsoft Edge add-ons, and Safari-related extension analysis in a practical, standards-aware way. Chrome-compatible in this context includes Chromium-based browser ecosystems where extension package structure is sufficiently similar for the same analysis model to be useful. Microsoft Edge extensions are Chromium-based and use the same CRX package format as Chrome; Edge add-ons are supported for both listing URL and extension ID submission via the Edge store and Microsoft update API. Firefox support is a first-class requirement. Safari support is also an initial requirement, but it must be implemented honestly with attention to packaging and distribution differences rather than as a superficial checkbox. Safari extensions are distributed as macOS apps through the App Store; there is no publicly downloadable extension package from Safari listing pages, so Safari is upload-only.

### Analysis Scope for Version One

The first version should be manifest-first and standards-driven. The engine must inspect and interpret the extension package metadata and structure before attempting deeper code analysis. The first release should focus on extracting and explaining permissions, host access, script injection scope, background execution model, externally connectable surfaces, web-accessible resources where relevant, and other clearly declared capabilities.

The first release may include lightweight structural or static checks where they are practical and low-risk, but it must not depend on deep JavaScript code analysis to be useful. The report must still be meaningful even if the only reliable information available is the extension manifest and package structure.

### Report Output

The application must return a rich, intuitive, and obvious report that helps users understand what the extension can access and what that implies. The report should include extension metadata when available, requested permissions, host permissions, derived capabilities, notable risk signals, a risk score or severity model, and a concise plain-English summary.

The report must make dangerous combinations easy to identify. For example, broad host access combined with content script injection or cookie access should be explained in direct language. The user should not need security expertise to understand the significance of the findings.

### Store and Package Metadata

The report must include a dedicated Metadata section (rendered as a tab in the UI) that surfaces all available background information about the analyzed extension. This includes metadata extracted from the manifest (description, developer name, developer URL, homepage URL) and metadata derived from the package itself (file size). When the extension was submitted via a store listing URL or resolved extension ID, the report must include the store listing URL for reference.

The Metadata section serves a complementary purpose to risk analysis: it helps users understand who built the extension, how large it is, what it claims to do, and where to find more information. Developer website URLs may be used in future versions as inputs for developer vetting signals (domain age, certificate health, WHOIS data), but the initial implementation must at minimum surface the raw metadata that is available from the manifest and package.

## Scoring and Standards

### Scoring Philosophy

The scoring model in version one must be explainable, deterministic, and conservative. It should use explicit rules rather than opaque heuristics. The user should be able to understand why the tool assigned a particular score, rating, or severity. The system must not present speculative conclusions as facts.

### Standards and Existing Guidance

Where there are existing standards, platform documentation, or common security guidance relevant to extension permissions and declared capabilities, the project should use them. The product should not invent arbitrary semantics where documented browser permission meanings already exist. The implementation should lean on platform-defined permission models and well-understood security interpretations wherever possible.

### Initial Scoring Inputs

Version one scoring should be driven primarily by manifest-declared permissions, host access scope, script injection scope, background execution patterns, externally connectable surfaces, and other clearly declared features. These should map to understandable findings and severity tiers. A broad permission alone may not always mean high risk, but combinations of capabilities often matter more than isolated declarations. The scoring system must model that reality in a way that remains understandable.

## User Experience Requirements

### Core UX Philosophy

The user interface must feel simple, obvious, and helpful. A user should understand the primary action immediately after loading the app. Submitting a URL, identifier, or file should be frictionless. The results page should surface the most important information first and progressively reveal detail without overwhelming the user.

### Responsive Design

The user interface must be responsive from day one. It must work well on phone, tablet, laptop, and desktop layouts. This is not optional polish. It is a core requirement. The application must not assume a desktop-only interaction model.

### Theme Support

The application must support light mode, dark mode, and system-aware theme selection across the full interface. Theme support must be built as a first-class feature rather than introduced later as a retrofit.

### Accessibility and Readability

The application should be readable, high-contrast, keyboard-accessible where practical, and semantically structured. The product is security-related, so visual trust and clarity matter. The interface should not feel gimmicky or over-designed.

## Deployment Model

### Public Deployment

The official public instance of the application will live on `extensionchecker.org`. This domain is for the scanner application itself, not marketing content. It should focus on the tool experience and only the minimal operational context needed to use the app responsibly.

### Project Site Relationship

The companion `extensionchecker-site` repository will power `extensionchecker.com`. That site exists to explain what the project is, why it exists, how to contribute, how to self-host, and where to find the public app instance. The `.com` site is the project and documentation home. The `.org` site is the app.

### Cloudflare Requirement

The public deployment target should use Cloudflare in a minimal, practical way. The intended model is Cloudflare Pages for the frontend and a single Cloudflare Worker for the backend API. A Worker static-assets frontend is also acceptable when it materially simplifies same-origin API routing, preserves the monorepo package boundaries, and does not introduce a separate deployed engine service. The analysis engine should not be deployed as a separate network service in version one. Instead, it should exist as a shared library or package used by the backend.

### Caching and Persistence

The system may maintain a lightweight cache of previously analyzed results to reduce repeated work. That cache is an optimization, not a fundamental dependency. The application should remain conceptually useful even without a large centralized dataset. The persistence model should stay simple in the first release and avoid over-engineering.

## Local Development Requirements

### Dev Container Requirement

All required development workflows for `extensionchecker-app` must be runnable locally inside a Visual Studio Code Dev Container. Contributors must be able to clone the repository, open it in VS Code, reopen in container, and run the full local development environment without complex host-specific setup.

### Local Runtime Expectations

A contributor should be able to run the frontend, backend, shared engine, and any required local support services from the Dev Container. Local development must not require live deployment to Cloudflare in order to test core flows. Cloudflare-specific deployment behavior may be emulated or adapted locally as needed, but the core development model must remain local-first.

### Portability

The backend and engine should be implemented so the Cloudflare deployment target is an adapter or runtime target, not the defining architecture. Core business logic should remain portable and testable outside the deployment platform.

## Quality Expectations

### Production-Quality Code

All implementation must be production-grade, even in the first pass. The project should not accumulate intentional technical debt simply because it is an early version. Contributors and Coding LLMs should prefer maintainable abstractions, clear type safety, modular boundaries, and straightforward code over expedient shortcuts.

### Testing

The codebase should include meaningful automated tests for the engine, shared models, and backend behavior. Frontend testing should also be introduced where appropriate. The exact initial test coverage target may be refined during implementation, but the expectation is that testing is part of the normal development workflow rather than a later cleanup task.

### Documentation Discipline

The codebase should include enough documentation for contributors to understand how the packages fit together, how to run the application locally, and how to extend the system safely. Documentation should support implementation rather than create bureaucratic overhead.

## Security and Privacy Requirements

### Security Posture

This project exists in the security space, so it must be developed with appropriate care. Uploaded packages and remote retrieval workflows must be handled defensively. Archive parsing, file handling, and any untrusted input processing must be implemented carefully. Resource limits, validation, and error handling should be designed deliberately.

### Privacy Posture

The public service should minimize unnecessary data retention. The product should be transparent about what is stored, what is cached, and what is temporary. If scan results are cached, that should be disclosed. If uploaded packages are transient and discarded after processing, that should also be disclosed clearly.

### Abuse Controls

The public instance should include reasonable controls for rate limiting, malformed input handling, and oversized package rejection. The first release does not need an elaborate abuse-prevention system, but it does need enough protection to avoid becoming fragile or trivially abusive.

## Risks and Constraints

### Store Retrieval Complexity

Direct retrieval of extension packages from browser stores may vary by ecosystem and may change over time. The system must not assume that every store URL can always be fetched automatically. This is why file upload is a required input path, not an optional extra.

### Scope Creep

The largest delivery risk is scope expansion. It will be tempting to add broad crawling, advanced static analysis, reputation data, user accounts, saved histories, and many other features too early. The project must resist that pressure until the core utility is shipped and validated.

### Misinterpretation of Results

Users may incorrectly treat a report as a definitive malware verdict. The interface and messaging must emphasize that the tool explains declared access and identified risk signals, but cannot guarantee safety or maliciousness conclusively.

## Success Criteria

### MVP Success

The initial release is successful if a user can submit a supported input, receive a useful report within a reasonable time, and clearly understand the main risks associated with the extension. The application should feel trustworthy, responsive, and simple to use. Contributors should be able to run it locally in the Dev Container without undue friction.

### Project Success

The broader project is successful if it becomes a credible open source utility that others can fork, self-host, contribute to, and reference as a practical public-good tool. A successful project is not defined by monetization. It is defined by usefulness, clarity, adoption, and portability.

## Initial Implementation Guidance

### Delivery Order

The first delivery phase should establish the monorepo, Dev Container, shared models, and package boundaries. The next phase should implement the basic ingestion and manifest-first analysis pipeline. The phase after that should focus on rendering the report clearly in a responsive interface. Additional analysis depth can follow once the end-to-end workflow is stable.

### Architectural Discipline

The frontend, backend, engine, and shared packages must remain meaningfully separated. Shared types and schemas should not drift. The backend should orchestrate ingestion, caching, and engine invocation. The engine should perform analysis. The frontend should render results and manage user interaction. The shared package should provide stable contracts between them.

## Open Questions for Future Revision

### Future Considerations

Later revisions of this PRD may define the exact JSON report schema, exact severity model, exact cache key strategy, exact testing thresholds, CLI support, more advanced static analysis, and broader ecosystem coverage. Those are intentionally deferred here so the implementation can begin with a solid foundation rather than waiting for exhaustive product specification.

## Summary

ExtensionChecker is a public-good, open source browser extension analysis tool designed to help users understand extension risk quickly and clearly. The `extensionchecker-app` repository will be a monorepo with all code under `src/`, containing frontend, backend, engine, and shared packages. It will support URL submission, identifier submission, and file upload; target Chrome-compatible ecosystems, Microsoft Edge, Firefox, and Safari in a practical way; run locally in a VS Code Dev Container; deploy publicly using Cloudflare Pages plus a single Worker; and prioritize explainable, manifest-first risk analysis over opaque or over-engineered complexity.

The first version should be disciplined, useful, portable, and honest about its limits. If it does those things well, it will already provide meaningful value.