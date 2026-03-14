# Privacy Policy

_Last updated: March 2026_

## Overview

ExtensionChecker is designed with privacy in mind. We collect the minimum data
necessary to operate the Service.

> [!IMPORTANT]
> Your privacy is our priority. We do not collect personal information beyond what is necessary for the Service to function.

## What We Collect

### Submitted Extensions

When you submit an extension for analysis (via URL, ID, or file upload), the
Service processes the extension package temporarily in memory to extract and
analyze its manifest. **We do not permanently store uploaded extension
packages.**

### Server Logs

Standard server logs may include:

- IP addresses (used for rate limiting)
- Timestamps
- Request paths and response status codes

These logs are retained for a limited period for operational and security
purposes only.

### No Cookies or Tracking

The public ExtensionChecker application does not use cookies, analytics
trackers, or third-party tracking scripts. Theme preferences are stored in
your browser's `localStorage` and never transmitted to our servers.

## What We Do Not Collect

- Personal information (name, email, account details)
- Browser fingerprints
- Usage analytics beyond standard server logs

## Data Processing

All analysis is performed server-side in Cloudflare Workers. Extension data is
processed in memory and is not written to persistent storage. Analysis results
are returned directly in the HTTP response.

## Self-Hosted Instances

If you self-host ExtensionChecker, you control all data processing. This
privacy policy applies only to the public instance at
`app.extensionchecker.org`.

## Third-Party Services

The public deployment uses:

- **Cloudflare** — for hosting, CDN, and Workers runtime. Cloudflare's privacy
  policy applies to infrastructure-level data handling.

## Changes

We may update this policy as the Service evolves. Material changes will be
noted in the project's release notes.

## Contact

Privacy questions may be directed to **hello@extensionchecker.org**.
