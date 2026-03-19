# Data Flows & Trust Boundaries

This document maps every significant data flow through ExtensionChecker and
identifies the trust boundaries that data crosses. Each boundary represents a
point where the system's trust assumptions change and where security controls
must be enforced.

---

## Trust Boundary Map

```mermaid
graph TB
    subgraph TB1["TB1 · Public Internet · UNTRUSTED"]
        User["End User"]
        Attacker["Attacker"]
    end

    subgraph TB2["TB2 · Cloudflare Edge"]
        CFEdge["DNS + TLS + WAF"]

        subgraph TB3["TB3 · Frontend Worker"]
            FW["Static Assets + API Proxy"]
        end

        subgraph TB4["TB4 · Backend Worker"]
            BW["Business Logic"]
            AE["Analysis Engine"]
        end
    end

    subgraph TB5["TB5 · External Stores · UNTRUSTED"]
        Chrome["Chrome"]
        Edge["Edge"]
        Firefox["Firefox"]
        Opera["Opera"]
    end

    User -->|"HTTPS"| CFEdge
    Attacker -.->|"Attack traffic"| CFEdge
    CFEdge -->|"TLS terminated"| FW
    FW -->|"Service binding + token"| BW
    BW -->|"HTTPS fetch"| TB5
    BW -->|"In-process"| AE
    BW -->|"Response"| FW
    FW -->|"Response"| User
```

### Trust Boundary Definitions

| ID | Boundary | Trust Level | What Crosses It |
|----|----------|-------------|-----------------|
| TB1 | Public Internet → Cloudflare Edge | **Untrusted → Platform** | All user HTTP requests, attacker traffic |
| TB2 | Cloudflare Edge → Frontend Worker | **Platform → App** | TLS-terminated requests, Cloudflare-injected headers (`cf-connecting-ip`) |
| TB3 | Frontend Worker → Backend Worker | **App → App (elevated)** | Proxied API requests with injected auth token |
| TB4 | Backend Worker → External Stores | **App → Third-party** | HTTPS fetches for extension packages; response content AND redirect destinations are **untrusted** |
| TB5 | External Package → Archive Extractor | **Untrusted content → Parser** | ZIP archive bytes - most critical attack surface |

---

## Data Flow 1: URL Submission

User provides a full extension store URL (e.g.,
`https://chromewebstore.google.com/detail/extension-name/abcdefghijklmnop`).

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant FW as Frontend Worker
    participant BW as Backend Worker
    participant Store as Extension Store

    User->>Browser: Enter store URL
    Browser->>FW: POST /api/analyze<br/>{"source":{"type":"url","value":"https://..."}}

    Note over FW: TB3 - Inject x-extensionchecker-token

    FW->>BW: Forward request + auth token

    Note over BW: CORS origin check
    Note over BW: Token authentication
    Note over BW: Rate limit check (per-IP + global)
    Note over BW: JSON body ≤ 16 KB
    Note over BW: Zod schema validation

    BW->>BW: validatePublicFetchUrl(url)
    Note over BW: HTTPS only, no private IPs,<br/>host must be in allowlist

    BW->>BW: resolveListingUrlToId(url)
    Note over BW: Extract extension ID from store URL

    BW->>BW: resolveExtensionIdCandidates(id, ecosystem)
    Note over BW: Build download URL candidates

    loop Try each download candidate
        BW->>Store: GET download URL
        Note over BW,Store: TB4 - Crosses into third-party trust
        Store-->>BW: Extension package bytes (or redirect)
    end

    Note over BW: Validate response.url (final URL after redirects)<br/>Reject private IPs, localhost, ::ffff: mapped addresses
    Note over BW: Enforce size limit (≤ 80 MB)
    Note over BW: TB5 - Parse untrusted archive

    BW->>BW: extractManifestFromPackage(bytes)
    Note over BW: ZIP validation:<br/>• ≤ 5,000 entries<br/>• No null bytes in names<br/>• No path traversal (../ or /)<br/>• Compression ratio ≤ 1000:1<br/>• Per-file ≤ 5 MB<br/>• Selective decompression only

    BW->>BW: Zod validate manifest schema
    BW->>BW: analyzeManifest(manifest)
    Note over BW: Permission scoring,<br/>risk signal derivation

    BW-->>FW: AnalysisReport (JSON or SSE)
    FW-->>Browser: Response (with security headers)
    Browser-->>User: Rendered report
```

---

## Data Flow 2: Extension ID Submission

User provides only an extension identifier (e.g., `abcdefghijklmnopabcdefghijklmnop`).

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant FW as Frontend Worker
    participant BW as Backend Worker
    participant Store as Extension Store

    User->>Browser: Enter extension ID
    Browser->>FW: POST /api/analyze<br/>{"source":{"type":"id","value":"abcd..."}}

    FW->>BW: Forward + inject token

    Note over BW: CORS + Auth + Rate Limit
    Note over BW: Zod validation (ID value ≤ 256 chars)
    Note over BW: ID format validation<br/>(regex per ecosystem)

    BW->>BW: resolveExtensionIdCandidates(id)
    Note over BW: Generate download URLs for<br/>Chrome, Edge, Firefox, Opera

    loop Try each ecosystem candidate
        BW->>Store: GET constructed download URL
        Store-->>BW: Package bytes (or error/redirect)
    end

    BW->>BW: extractManifestFromPackage(bytes)
    BW->>BW: analyzeManifest(manifest)

    BW-->>FW: AnalysisReport
    FW-->>Browser: Rendered report
```

---

## Data Flow 3: File Upload

User uploads a local `.crx`, `.xpi`, or `.zip` file directly.

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant FW as Frontend Worker
    participant BW as Backend Worker

    User->>Browser: Select file (.crx/.xpi/.zip)
    Browser->>FW: POST /api/analyze/upload<br/>Content-Type: multipart/form-data<br/>File ≤ 80 MB

    FW->>BW: Forward + inject token

    Note over BW: CORS + Auth + Rate Limit
    Note over BW: Content-Length ≤ 82 MB
    Note over BW: Parse multipart form data
    Note over BW: File extension check (.zip/.xpi/.crx)
    Note over BW: File size ≤ 80 MB

    BW->>BW: extractManifestFromPackage(fileBytes)
    Note over BW: Full ZIP validation suite<br/>(same as remote download path)

    BW->>BW: analyzeManifest(manifest)

    BW-->>FW: AnalysisReport
    FW-->>Browser: Rendered report

    Note over BW: File bytes discarded<br/>(never persisted)
```

---

## Data Flow 4: Frontend Worker API Proxy

Detail of how the Frontend Worker mediates between the browser and backend.

```mermaid
flowchart LR
    subgraph Browser["Browser"]
        Req["POST /api/analyze"]
    end

    subgraph FrontendWorker["Frontend Worker"]
        RouteCheck{"API route?"}
        AssetServe["Serve static asset"]
        InjectToken["Inject auth token"]
        Forward["Forward via service binding"]
        AddHeaders["Add security headers"]
    end

    subgraph BackendWorker["Backend Worker"]
        Handle["Process request"]
    end

    Req --> RouteCheck
    RouteCheck -->|No| AssetServe
    RouteCheck -->|Yes| InjectToken
    InjectToken --> Forward
    Forward --> Handle
    Handle --> AddHeaders
    AddHeaders --> Browser
```

---

## Data Flow 5: Archive Extraction Pipeline

This is the most security-critical data flow. Untrusted archive bytes from
a user upload or remote download are parsed and selectively decompressed.

```mermaid
flowchart TD
    Start["Receive archive bytes"]
    SizeCheck{"Size ≤ 80 MB?"}
    EntryCount{"Entries ≤ 5,000?"}
    ForEach["For each ZIP entry"]
    NullByte{"Null byte in name?"}
    PathTraversal{"Path traversal?"}
    IsTarget{"manifest.json or\n_locales/*.json?"}
    RatioCheck{"Ratio ≤ 1000:1?"}
    FileSizeCheck{"Size ≤ 5 MB?"}
    Decompress["Decompress to memory"]
    Skip["Skip entry"]
    ParseJSON["Parse JSON"]
    ZodValidate["Zod validation"]
    Analyze["Analysis engine"]
    Reject["400 Bad Request"]

    Start --> SizeCheck
    SizeCheck -->|No| Reject
    SizeCheck -->|Yes| EntryCount
    EntryCount -->|No| Reject
    EntryCount -->|Yes| ForEach
    ForEach --> NullByte
    NullByte -->|Yes| Reject
    NullByte -->|No| PathTraversal
    PathTraversal -->|Yes| Reject
    PathTraversal -->|No| IsTarget
    IsTarget -->|No| Skip
    IsTarget -->|Yes| RatioCheck
    RatioCheck -->|No| Reject
    RatioCheck -->|Yes| FileSizeCheck
    FileSizeCheck -->|No| Reject
    FileSizeCheck -->|Yes| Decompress
    Decompress --> ParseJSON
    ParseJSON --> ZodValidate
    ZodValidate --> Analyze
```

---

## Data Flow 6: Security Control Chain (Backend)

Every API request passes through this ordered chain of security controls
before any business logic executes. Token comparison uses a constant-time
XOR-over-padded-buffers function to prevent timing side-channel attacks.
Security headers applied to every response include `X-Frame-Options: DENY`,
`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`,
`Strict-Transport-Security` (1-year, includeSubDomains, preload),
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`X-DNS-Prefetch-Control: off`, `X-Permitted-Cross-Domain-Policies: none`,
and a strict `Permissions-Policy` (including `browsing-topics=()`).

```mermaid
flowchart TD
    Req["Incoming request"]
    SecHeaders["Set security headers"]
    CacheControl["Cache-Control: no-store"]
    OriginCheck{"Origin present?"}
    OriginAllowed{"Origin in allowlist?"}
    AllowNoOrigin{"Allow no-origin?"}
    HasToken{"Has valid token?"}
    TokenCheck{"Token configured?"}
    TokenValid{"Token matches?"}
    RateIP{"IP rate limit OK?"}
    RateDay{"Daily IP limit OK?"}
    RateGlobal{"Global limit OK?"}
    BusinessLogic["Route to handler"]
    Err403["403 Forbidden"]
    Err401["401 Unauthorized"]
    Err429["429 Too Many Requests"]

    Req --> SecHeaders --> CacheControl --> OriginCheck
    OriginCheck -->|Yes| OriginAllowed
    OriginCheck -->|No| AllowNoOrigin
    OriginAllowed -->|Yes| TokenCheck
    OriginAllowed -->|No| Err403
    AllowNoOrigin -->|Yes| TokenCheck
    AllowNoOrigin -->|No| HasToken
    HasToken -->|Yes| TokenCheck
    HasToken -->|No| Err403
    TokenCheck -->|Not configured| RateIP
    TokenCheck -->|Configured| TokenValid
    TokenValid -->|Yes| RateIP
    TokenValid -->|No| Err401
    RateIP -->|OK| RateDay
    RateIP -->|Exceeded| Err429
    RateDay -->|OK| RateGlobal
    RateDay -->|Exceeded| Err429
    RateGlobal -->|OK| BusinessLogic
    RateGlobal -->|Exceeded| Err429
```

---

## Data at Rest & In Transit

| Data | At Rest | In Transit | Retention |
|------|---------|-----------|-----------|
| Uploaded extension packages | **Never persisted** - processed in Worker memory only | HTTPS (user → CF edge → Worker) | Discarded after response |
| Downloaded extension packages | **Never persisted** - held in memory during analysis | HTTPS (store → Worker) | Discarded after response |
| Analysis reports | **Not stored** (v0.1.0) - returned in HTTP response | HTTPS (Worker → CF edge → user) | None server-side; client may save |
| API access token | Cloudflare encrypted secret store | Injected in internal service binding header | Persistent (until rotated) |
| Rate limit counters | Worker in-memory (per isolate) | N/A | Reset on Worker restart |
| User theme preference | Browser localStorage | Never transmitted | Until user clears storage |
| Server logs (IP, timestamp, path) | Cloudflare infrastructure logs | Internal | Limited retention period |

---

## Sensitive Data Inventory

| Data Element | Classification | Handled By | Protection |
|-------------|---------------|-----------|------------|
| User IP address | PII (operational) | Rate limiter, CF logs | Not persisted in app; used transiently |
| API access token | Secret | Frontend Worker env, Backend Worker env | CF encrypted secrets; never exposed to browser |
| Extension package bytes | Untrusted input | Backend archive extractor | Full validation suite; memory-only processing |
| Manifest JSON | Untrusted input (parsed) | Backend + Engine | Zod schema validation before use |
| Store URLs | User input | Backend URL validator | SSRF protection: HTTPS, allowlist, no private IPs |
| Extension IDs | User input | Backend ID resolver | Format validation (regex per ecosystem) |
