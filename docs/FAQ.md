# Frequently Asked Questions

## How does the access score work?

The access score is a number from **0 to 100** that represents how much of your browser's sensitive surfaces an extension can reach based on what it has declared in its manifest. It is not a verdict on whether an extension is malicious — it is a factual measure of capability footprint.

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

When **store metadata is available** (currently Firefox Add-ons only), the report shows two separate scores and combines them:

- **Capability score** — the raw permission footprint from the manifest alone. This score is always present and never changes based on external signals.
- **Store Trust score** — derived from the extension's public rating and download count on its store listing. A highly-rated extension with millions of users represents a strong public trust signal.
- **Overall score** — the composite result. High store trust moderates the overall score downward, reflecting that popularity and positive ratings reduce (but do not eliminate) the concern about an extension's capability.

When no store metadata is available, the Overall score equals the Capability score.

---

## Which stores provide metadata?

| Store | Metadata available | Notes |
|---|---|---|
| **Firefox Add-ons (AMO)** | ✅ Yes | Full public REST API — ratings and user counts are retrieved automatically. |
| **Chrome Web Store** | ❌ No | Google provides no official public API for extension metadata. |
| **Microsoft Edge Add-ons** | ❌ No | No public API available. |
| **Opera Add-ons** | ❌ No | No public API available. |
| **Safari / App Store** | ❌ No | Requires direct package upload; no public listing API. |

When store metadata is unavailable, the score is based entirely on the manifest — which is still meaningful and accurate, just without the additional context that store signals provide.

---

## Does a high score mean the extension is safe or unsafe?

Neither. The score measures **access** — what the extension technically *can* do — not **intent** or **trustworthiness**. An extension that scores 95 might be 1Password (trusted by tens of millions of people) or it might be a newly-uploaded unknown extension with the same permissions. The score tells you the same thing about both: this extension has broad access to your browser.

Whether that access is appropriate is a judgment you make by considering:
- What does this extension claim to do?
- Does the level of access make sense for its stated purpose?
- Is it from a recognised developer?
- Does it have a credible track record?

This tool gives you the evidence to make that judgment — not the judgment itself.

---

## What does "manifest-first analysis" mean?

Browser extensions contain a file called `manifest.json` that declares what permissions and capabilities the extension requests. ExtensionChecker reads this file to understand the extension's declared access footprint.

This is a **static** analysis — it does not run the extension's code, observe its network activity, or simulate its runtime behavior. That means:

- It catches everything the extension has *declared* it needs.
- It does not catch permissions requested silently at runtime (which reputable stores prohibit).
- It does not analyse JavaScript code for malicious behavior.

The Phases tab on any report shows which analysis phases were performed and which were not.

---

## Can I analyse an extension without submitting a store URL?

Yes. You can upload the extension package file (`.crx`, `.xpi`, or `.zip`) directly using the Upload tab. Uploaded files are analysed locally — no store URL or extension ID is required, and no live store data will be fetched.

---

## Is my data private?

Extension packages and manifests submitted for analysis are processed in memory and are not stored. See the [Privacy Policy](/privacy) for full details.
