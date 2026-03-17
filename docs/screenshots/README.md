# Screenshots

To give you an idea of what the application looks like and how it works, we've included a variety of screenshots from different browser extension stores. These images showcase the user interface, permissions, code scan findings, and trust signals for the extensions we analyzed. Click on any image to view it in full size.

> [!NOTE]
> Apple Safari continues to be a special case because there does not seem to be a direct way to download the extension for analysis, now that they are part of the App Store. If you have a way to fix this, please open an Issue or Pull Request!

This main view is the key takeaway. It combines:

1. **Manifest**: What kind of permissions and scopes are declared by the extension.
2. **Code Scan**: The results of our static code analysis, showing any potential issues or vulnerabilities.
3. **Trust Signals**: Information from the browser extension store, such as user reviews,

Then, using a weighted scoring algorithm, we can determine the overall risk profile of the extension, which is represented by the color-coded "Risk Level" indicator.

> [!IMPORTANT]
> When we say "weighted", that means for example that 10,000 downloads with a 4.5-star rating will have a bigger influence on the risk score than 10 downloads with a 5.0-star rating. Or, having High or Critical code scanning findings, coupled with a large number of permissions, will have a bigger influence on the risk score than having only one or the other.

## Chrome

Below are examples of the Bitwarden password manager and DuckDuckGo Privacy Essentials extensions in Chrome.

<a href="chrome-bitwarden-1.png" target="_blank"><img src="chrome-bitwarden-1.png" alt="Screenshot of the application" width="250"></a>
<a href="chrome-duckduckgo-1.png" target="_blank"><img src="chrome-duckduckgo-1.png" alt="Screenshot of the application" width="250"></a>
<a href="chrome-weather-1.png" target="_blank"><img src="chrome-weather-1.png" alt="Screenshot of the application" width="250"></a>
<a href="chrome-tungsten-1.png" target="_blank"><img src="chrome-tungsten-1.png" alt="Screenshot of the application" width="250"></a>


Digging into the DuckDuckGo Privacy Essentials extension, we can see more of the permissions that are declared in the manifest, findings from a code scan, and we get "trust signals" from the browser extension store:

<a href="chrome-duckduckgo-2.png" target="_blank"><img src="chrome-duckduckgo-2.png" alt="Screenshot of the application" width="250"></a>
<a href="chrome-duckduckgo-findings.png" target="_blank"><img src="chrome-duckduckgo-findings.png" alt="Screenshot of the application" width="250"></a>
<a href="chrome-duckduckgo-meta.png" target="_blank"><img src="chrome-duckduckgo-meta.png" alt="Screenshot of the application" width="250"></a>
<a href="chrome-duckduckgo-phases.png" target="_blank"><img src="chrome-duckduckgo-phases.png" alt="Screenshot of the application" width="250"></a>

> [!NOTE]
> Not many extensions publish to *all* of the browser extension stores, so this page has a variety of screenshots of different risk profiles, even if they are not a one-for-one match between browser extension stores..

## Edge

Below are examples of other extensions in Edge.

<a href="edge-bitwarden-1.png" target="_blank"><img src="edge-bitwarden-1.png" alt="Screenshot of the application" width="250"></a>
<a href="edge-duckduckgo-1.png" target="_blank"><img src="edge-duckduckgo-1.png" alt="Screenshot of the application" width="250"></a>
<a href="edge-weather-1.png" target="_blank"><img src="edge-weather-1.png" alt="Screenshot of the application" width="250"></a>
<a href="edge-tungsten-1.png" target="_blank"><img src="edge-tungsten-1.png" alt="Screenshot of the application" width="250"></a>


## Firefox

Below are examples of other extensions in Firefox.

<a href="firefox-bitwarden-1.png" target="_blank"><img src="firefox-bitwarden-1.png" alt="Screenshot of the application" width="250"></a>
<a href="firefox-duckduckgo-1.png" target="_blank"><img src="firefox-duckduckgo-1.png" alt="Screenshot of the application" width="250"></a>
<a href="firefox-weather-1.png" target="_blank"><img src="firefox-weather-1.png" alt="Screenshot of the application" width="250"></a>
<a href="firefox-tungsten-1.png" target="_blank"><img src="firefox-tungsten-1.png" alt="Screenshot of the application" width="250"></a>

## Opera

Below are examples of other extensions in Opera.

<a href="opera-bitwarden-1.png" target="_blank"><img src="opera-bitwarden-1.png" alt="Screenshot of the application" width="250"></a>
<a href="opera-duckduckgo-1.png" target="_blank"><img src="opera-duckduckgo-1.png" alt="Screenshot of the application" width="250"></a>
<a href="opera-weather-1.png" target="_blank"><img src="opera-weather-1.png" alt="Screenshot of the application" width="250"></a>
<a href="opera-dotvpn-1.png" target="_blank"><img src="opera-dotvpn-1.png" alt="Screenshot of the application" width="250"></a>