# Headless Browser Detection — Root Cause Analysis & Fix Plan

> **Date:** 2026-02-04  
> **Repo:** jonathancostin/LenovoWarrantyAPI  
> **Target:** https://pcsupport.lenovo.com  
> **Status:** Research complete, ready to implement

---

## Executive Summary

Lenovo's support site blocks Playwright's default headless Chromium via **TLS/HTTP2 fingerprinting** and likely **`sec-ch-ua` header inspection**. The fix is straightforward: switch from Playwright's bundled "headless shell" to the branded **Google Chrome** browser using `channel: 'chrome'`. This was **tested and confirmed working** in headless mode on 2026-02-04.

---

## 1. Root Cause Analysis

### What's happening

When `headless: true` is set with Playwright's default Chromium:
- `net::ERR_HTTP2_PROTOCOL_ERROR` — the server **terminates the HTTP/2 connection** during the TLS handshake or early response
- With `--disable-http2`, the connection falls back to HTTP/1.1 but **times out** — the server silently drops it
- In **headed mode** (`headless: false`), the same code works perfectly

### Why it happens

Since Playwright v1.49, headless mode uses a separate binary called **"chromium headless shell"** — a stripped-down Chromium build optimized for headless operation. This binary has a **different TLS fingerprint** than a real Chrome browser:

| Signal | Headless Shell | Real Chrome | Detection Risk |
|--------|---------------|-------------|----------------|
| TLS ClientHello (JA3/JA4) | Distinct BoringSSL config with different cipher ordering | Standard Chrome TLS profile | **HIGH** — server-side, pre-response |
| `sec-ch-ua` header | `"HeadlessChrome";v="X"` | `"Google Chrome";v="X"` | **HIGH** — trivial string match |
| `User-Agent` header | Contains `HeadlessChrome/` | Contains `Chrome/` | **HIGH** — trivial string match |
| `Accept-Language` header | **Missing** by default | Present (e.g., `en-US,en;q=0.9`) | **MEDIUM** — absence is suspicious |
| `navigator.webdriver` | `true` | `false` | **MEDIUM** — JS-based check |
| CDP side effects | Runtime.enable leaks | N/A | **LOW** for Lenovo (not JS-heavy anti-bot) |
| `window.__playwright*` globals | Present | Absent | **LOW** — Lenovo doesn't check this |

### The primary detection vector

Lenovo's CDN (likely Akamai or similar) performs **server-side TLS fingerprinting**. The headless shell's TLS ClientHello doesn't match any known legitimate browser fingerprint, so the server:
1. Accepts the TCP connection
2. Completes the TLS handshake
3. **Resets the HTTP/2 stream** (→ `ERR_HTTP2_PROTOCOL_ERROR`)

This happens *before* any JavaScript runs, which is why JS-only mitigations (spoofing `navigator.webdriver`, adding init scripts) don't help.

### Evidence from testing

| Configuration | Result | Notes |
|--------------|--------|-------|
| Default `headless: true` | ❌ `ERR_HTTP2_PROTOCOL_ERROR` | TLS fingerprint rejected |
| `headless: true` + `--disable-http2` | ❌ `ERR_TIMED_OUT` | HTTP/1.1 fallback also blocked |
| `headless: true` + stealth args + spoofed headers | ❌ `ERR_TIMED_OUT` | Still uses headless shell TLS stack |
| **`channel: 'chrome'` + `headless: true`** | ✅ **200 OK in 2.3s** | Real Chrome TLS fingerprint passes |
| `channel: 'chrome'` + `--disable-http2` | ✅ **200 OK in 2.4s** | Also works over HTTP/1.1 |
| `headless: false` (current) | ✅ Works | Uses full Chromium, different TLS profile |

---

## 2. Recommended Solution — Ranked

### 🥇 Solution 1: Use `channel: 'chrome'` (RECOMMENDED)

**Likelihood of success: 95% — Tested and confirmed working**

Switch from Playwright's bundled Chromium headless shell to the installed Google Chrome browser. This uses Chrome's "new headless mode" which is essentially a headed browser without the GUI — same TLS stack, same fingerprint.

#### Implementation

```javascript
// lib/scraper.js — launchBrowser()
async function launchBrowser() {
  const browser = await chromium.launch({
    headless: true,                    // ← Can now be true!
    channel: 'chrome',                 // ← Use installed Google Chrome
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/Chicago',
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  return { browser, context };
}
```

#### Pros
- **Minimal code change** — literally adding `channel: 'chrome'` and changing `headless: false` → `true`
- **Tested and working** against Lenovo right now
- **No new dependencies** — uses already-installed Chrome
- Runs headless (no GUI needed, works in SSH/CI)
- Same Playwright API — no code changes needed elsewhere
- Chrome's "new headless" mode has identical fingerprint to headed Chrome

#### Cons
- **Requires Google Chrome installed** on the host (not just Playwright's bundled Chromium)
  - On Mac: Already installed ✅ (Chrome 144)
  - On Linux server: Need to `apt install google-chrome-stable` or use `npx playwright install chrome`
- Chrome auto-updates could theoretically break things (very rare)
- Slightly larger disk footprint than headless shell

#### Deployment notes
```bash
# Install Chrome for Playwright (if not already installed)
npx playwright install chrome

# Or on Linux:
# wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add -
# echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
# apt update && apt install google-chrome-stable
```

---

### 🥈 Solution 2: Patchright (Drop-in Playwright Replacement)

**Likelihood of success: 85%**

[Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-nodejs) is a patched fork of Playwright that fixes multiple detection vectors at the source level.

#### Implementation

```bash
npm install patchright
npx patchright install chromium
```

```javascript
// lib/scraper.js — change the import
const { chromium } = require('patchright');  // ← Drop-in replacement

async function launchBrowser() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',          // Still recommended with Patchright
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ]
  });
  // ... rest unchanged
}
```

#### What Patchright patches
- Removes `Runtime.enable` CDP command (main detection vector for advanced anti-bot)
- Removes `--enable-automation` flag
- Removes `--disable-popup-blocking` flag  
- Removes `--disable-component-update` flag
- Hides `__playwright__binding__` and `__pwInitScripts` globals
- Auto-disables `navigator.webdriver`

#### Pros
- Fixes CDP-level detection that `channel: 'chrome'` alone doesn't address
- Drop-in replacement (same API as Playwright)
- Actively maintained
- Best option if Lenovo upgrades their anti-bot (future-proofing)

#### Cons
- Third-party dependency — could lag behind Playwright updates
- Only supports Chromium-based browsers
- `console.log` is disabled (need alternative logging)
- New dependency to manage

---

### 🥉 Solution 3: `playwright-extra` + Stealth Plugin

**Likelihood of success: 70%**

The stealth plugin applies multiple patches to hide automation signals.

#### Implementation

```bash
npm install playwright-extra puppeteer-extra-plugin-stealth
```

```javascript
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

async function launchBrowser() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',     // Still needed for TLS fingerprint
    args: ['--disable-blink-features=AutomationControlled']
  });
  // ... rest unchanged
}
```

#### Pros
- Well-known, widely used
- Modular — can enable/disable specific evasions
- Compatible with Playwright's API

#### Cons
- **Does NOT fix TLS fingerprinting** — still need `channel: 'chrome'`
- Plugin maintenance has been spotty (last major update was months ago)
- Adds complexity over just using `channel: 'chrome'`
- Only works with Chromium

---

### Solution 4: Firefox via Playwright

**Likelihood of success: 60%**

Firefox has a completely different TLS stack and fingerprint. Some sites that block headless Chrome don't block Firefox.

```javascript
const { firefox } = require('playwright');

async function launchBrowser() {
  const browser = await firefox.launch({ headless: true });
  // ...
}
```

#### Pros
- Different TLS fingerprint — might bypass Lenovo's checks
- No additional dependencies (Playwright bundles Firefox)

#### Cons
- **Untested** against Lenovo
- Different rendering engine — page selectors might need adjustment
- Potentially slower
- `--disable-blink-features=AutomationControlled` is Chromium-only (irrelevant)

---

### Solution 5: Direct API Calls (Bypass Browser Entirely)

**Likelihood of success: 40%**

The existing code already tries Lenovo's internal API endpoint:
```
https://pcsupport.lenovo.com/us/en/api/v4/upsell/redport/getIbaseInfo?serialNumber=XXX
```

If this API works with plain HTTP requests (curl/fetch), we could skip the browser for warranty data.

```javascript
const https = require('https');
// or use got/axios with custom TLS settings
```

#### Pros
- No browser needed at all for warranty data
- Much faster, lighter on resources
- No detection issues

#### Cons
- API endpoint may require cookies/tokens set by the frontend
- Specs page still needs browser rendering
- Lenovo could change/remove the API at any time
- May still need browser for initial session/cookie setup

---

## 3. Implementation Plan

### Phase 1: Quick Fix (30 minutes)

1. **Edit `lib/scraper.js`**:
   - Add `channel: 'chrome'` to `launchBrowser()`
   - Change `headless: false` → `headless: true`
   - Add `Accept-Language` header to context
   - Remove `--disable-http2` from args (no longer needed)

2. **Update `DEPLOYMENT.md`**:
   - Add Chrome installation requirement
   - Add `npx playwright install chrome` to setup steps

3. **Test locally on Mac**

4. **Commit & push**

### Phase 2: Hardening (optional, 1-2 hours)

1. **Add Patchright as alternative** — swap in if `channel: 'chrome'` breaks in future
2. **Add retry logic** — fall back to headed mode if headless fails
3. **Add browser fingerprint tests** — CI check against bot detection test sites
4. **Environment variable** — `HEADLESS=true|false` for easy toggle

### Phase 3: Future-Proofing (as needed)

1. **Investigate direct API** — can warranty data be fetched without browser?
2. **Add proxy support** — for IP-based rate limiting
3. **Monitor** — periodic checks that headless still works

---

## 4. Testing Checklist

- [ ] `channel: 'chrome'` + `headless: true` → loads product page
- [ ] Warranty API endpoint returns data
- [ ] Specs extraction works correctly
- [ ] Full lookup (warranty + specs) completes
- [ ] Bulk lookup handles 5+ serials
- [ ] Works on Mac (local dev)
- [ ] Works on Linux (deployment target, if applicable)

---

## 5. Test Results (2026-02-04)

```
Environment: macOS, Node v25.5.0, Playwright 1.56.1, Chrome 144.0.7559.110

FAIL - Default headless (ERR_HTTP2_PROTOCOL_ERROR)
FAIL - Headless + --disable-http2 (ERR_TIMED_OUT)  
FAIL - Headless + stealth args + spoofed headers (Timeout)
PASS - channel: 'chrome' headless (200 OK, 2352ms, full content)
PASS - channel: 'chrome' + --disable-http2 (200 OK, 2409ms)
```

**Conclusion:** `channel: 'chrome'` is the confirmed fix. The TLS fingerprint from Chrome's "new headless" mode is indistinguishable from headed Chrome, passing Lenovo's server-side detection.

---

## References

- [Playwright issue #36001](https://github.com/microsoft/playwright/issues/36001) — ERR_HTTP2_PROTOCOL_ERROR in headless
- [Playwright issue #33566](https://github.com/microsoft/playwright/issues/33566) — Chromium headless shell changes in v1.49
- [Castle.io — How to detect Headless Chrome](https://blog.castle.io/how-to-detect-headless-chrome-bots-instrumented-with-playwright/)
- [Browserless — TLS Fingerprinting](https://www.browserless.io/blog/tls-fingerprinting-explanation-detection-and-bypassing-it-in-playwright-and-puppeteer)
- [Patchright (Node.js)](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-nodejs)
- [Playwright docs — Browser channels](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge)
