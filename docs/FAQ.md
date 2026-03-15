# Frequently Asked Questions

## How does the access score work?

The access score is a number from **0 to 100** that represents how much of your browser's sensitive surfaces an extension can reach based on what it has declared in its manifest. It is not a verdict on whether an extension is malicious - it is a factual measure of capability footprint.

The four tiers are:

| Score | Tier | What it means |
|---|---|---|
| 0 – 25 | **Minimal Access** | The extension requests very limited browser access. |
| 26 – 50 | **Moderate Access** | The extension has meaningful access to some browser features. |
| 51 – 75 | **Broad Access** | The extension can access a significant portion of browser activity. |
| 76 – 100 | **Complete Access** | The extension has declared capabilities across most or all sensitive browser surfaces. |

A high score does not mean an extension is unsafe. Many widely-used, trusted extensions legitimately require broad access. Grammarly needs to read every text field. 1Password needs to inject credentials into every site. A VPN extension may need to intercept all network requests. All of these are valid uses of high-privilege capabilities.

---

## What is the difference between the Capability score and the Overall score?

When **store metadata is available**, the report shows two separate scores and combines them:

- **Capability score** - the raw permission footprint from the manifest alone. This score is always present and never changes based on external signals.
- **Store Trust score** - derived from the extension's public rating and download count on its store listing. A highly-rated extension with millions of users represents a strong public trust signal.
- **Overall score** - the composite result. High store trust moderates the overall score downward, reflecting that popularity and positive ratings reduce (but do not eliminate) the concern about an extension's capability.

When no store metadata is available, the Overall score equals the Capability score.

---

## Which stores provide metadata?

| Store | Metadata available | Source |
|---|---|---|
| **Firefox Add-ons (AMO)** | ✅ Yes | Mozilla's official public REST API. |
| **Chrome Web Store** | ✅ Yes | Publicly visible listing page (no official API exists). |
| **Microsoft Edge Add-ons** | ✅ Yes | Publicly visible listing page (no official API exists). |
| **Opera Add-ons** | ✅ Yes | Publicly visible listing page (no official API exists). |
| **Safari / App Store** | ❌ No | Requires direct package upload; no parseable public listing. |

Store metadata retrieval can be toggled per-store in self-hosted deployments. When store metadata is unavailable - either because the store is unsupported, the scraper is disabled, or the store page could not be reached - the score is based entirely on the manifest, which is still meaningful and accurate.

---

## How does Firefox Add-ons metadata work?

Mozilla publishes a fully documented, public REST API for the Firefox Add-ons site (addons.mozilla.org). When you submit a Firefox extension, ExtensionChecker calls this API directly to retrieve verified ratings, user counts, and developer information. No HTML parsing or scraping is involved - the data comes from Mozilla's own API responses.

---

## How do you retrieve Chrome, Edge, and Opera store data?

Google, Microsoft, and Opera provide no official public APIs for extension metadata. For those stores, ExtensionChecker reads the publicly visible listing page - the same HTML your browser renders when you visit the store - and extracts structured signals like ratings, user counts, and developer details.

This is equivalent to looking the extension up in the store yourself. No authentication is used, no private data is accessed, and only the same information that any visitor would see is read.

Each store scraper can be independently disabled via environment variable for self-hosted deployments. See the [Self-Hosting Guide](/self-hosting) for details.

---

## What does "cached store data" mean in a report?

ExtensionChecker caches store data so that repeated lookups are fast and do not place unnecessary load on store sites. Freshness works in tiers:

| Cache age | Behaviour |
|---|---|
| **Less than 7 days** | Data is used transparently with no indicator. It is recent enough to treat as current. |
| **7 – 90 days** | The report shows a **"cached · X days ago"** note. The score still reflects store signals, but the rating and user count may have drifted from the live store listing. |
| **Older than 90 days, or never fetched** | Treated as unavailable. The Store Trust donut is not shown, and the Overall score equals the Capability score. |

Cache entries are automatically evicted when they expire. If you need a fresh score, re-submit the extension after the cache has expired.

---

## Does a high score mean the extension is safe or unsafe?

Neither. The score measures **access** - what the extension technically *can* do - not **intent** or **trustworthiness**. An extension that scores 95 might be 1Password (trusted by tens of millions of people) or it might be a newly-uploaded unknown extension with the same permissions. The score tells you the same thing about both: this extension has broad access to your browser.

Whether that access is appropriate is a judgment you make by considering:
- What does this extension claim to do?
- Does the level of access make sense for its stated purpose?
- Is it from a recognised developer?
- Does it have a credible track record?

This tool gives you the evidence to make that judgment - not the judgment itself.

---

## What does "manifest-first analysis" mean?

Browser extensions contain a file called `manifest.json` that declares what permissions and capabilities the extension requests. ExtensionChecker reads this file to understand the extension's declared access footprint.

This is a **static** analysis - it does not run the extension's code, observe its network activity, or simulate its runtime behavior. That means:

- It catches everything the extension has *declared* it needs.
- It does not catch permissions requested silently at runtime (which reputable stores prohibit).
- It does not analyse JavaScript code for malicious behavior.

The Phases tab on any report shows which analysis phases were performed and which were not.

---

## Can I analyse an extension without submitting a store URL?

Yes. You can upload the extension package file (`.crx`, `.xpi`, or `.zip`) directly using the Upload tab. Uploaded files are analysed locally - no store URL or extension ID is required, and no live store data will be fetched.

---

## How does the code scanning work?

Phase 3 of every analysis runs a **lite regex-based code scanner** over the JavaScript files inside the extension package. This scan is designed to run within the tight CPU budget of the Cloudflare Workers runtime (approximately 10 ms of CPU time per request).

**What the lite scan checks:**

| Category | Signals detected |
|---|---|
| Dynamic code execution | `eval()`, `new Function()`, `setTimeout`/`setInterval` with string arguments |
| DOM injection | `innerHTML`, `outerHTML`, `insertAdjacentHTML()`, `document.write()` |
| Remote script loading | `createElement("script")` combined with a `.src` assignment |
| Data exfiltration | `document.cookie`, `navigator.clipboard`, password field selectors, `sendBeacon()`, `WebSocket` |
| Dangerous Chrome APIs | `chrome.debugger`, `chrome.proxy`, `chrome.cookies`, `chrome.management`, `chrome.webRequest` |
| Obfuscation | `atob()` calls, Dean Edwards packer pattern, hex-encoded string arrays |
| Messaging abuse | `onMessage` or `onConnect` combined with `eval()` in the same file |

**File prioritisation:** The scanner processes the most security-sensitive files first — background scripts and service workers, then content scripts declared in the manifest, then web-accessible resources, then all other `.js` files. If the scan budget is exhausted before all files are processed, you will see a **Partial** status in Phase 3 and your report will indicate how many files were skipped. The highest-risk files are always scanned first.

**What "Partial" means:** If Phase 3 shows _Partial_, the analysis ran out of byte budget (500 KB total, 200 KB per file, 30 files maximum) before scanning every `.js` file in the package. The findings still reflect the most important files. A partial result is not a failing result — it means some less-critical files were not examined.

**Score contribution:** Each finding is treated as additive evidence on top of the manifest-level signal for the same capability. For example, if the manifest declares the `cookies` permission _and_ the code actively calls `chrome.cookies`, both signals contribute to the score independently.

**Self-hosted deployments with full AST scanning:** The default public deployment uses regex-only scanning because the Cloudflare Workers free tier cannot run a JavaScript parser within its CPU limits. If you host the backend yourself you can add a full AST-based scanner (e.g. using `acorn` or `@babel/parser`) — the `CodeAnalysisMode` schema in `src/shared` supports `'full'` for this purpose.

---

## Is my data private?

Extension packages and manifests submitted for analysis are processed in memory and are not stored. See the [Privacy Policy](/privacy) for full details.
