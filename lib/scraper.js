/**
 * Shared Lenovo scraping module.
 * Extracts warranty + spec lookup logic so it can be used by
 * server.js, cli.js, and csv-lookup.js alike.
 */
const { chromium } = require('playwright');

// ── Browser helpers ──────────────────────────────────────────────
async function launchBrowser() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      '--disable-http2'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/Chicago',
    ignoreHTTPSErrors: true
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  return { browser, context };
}

// ── Scrape machine specs ─────────────────────────────────────────
async function getMachineSpecs(serialNumber, existingPage) {
  let browser, context, page;
  const ownsBrowser = !existingPage;

  try {
    if (existingPage) {
      page = existingPage;
    } else {
      ({ browser, context } = await launchBrowser());
      page = await context.newPage();
    }

    const productUrl = `https://pcsupport.lenovo.com/us/en/products/${serialNumber}`;
    console.log(`[spec] Navigating to ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(5000);

    try {
      await page.waitForSelector('.new-machinfo-view-btn, .desc-config-name', { timeout: 15000 });
      console.log('[spec] Machine info section found');
    } catch (_) {
      console.log('[spec] Machine info section not found by selector, continuing anyway...');
    }

    const clicked = await page.evaluate(() => {
      const overlays = document.querySelectorAll(
        '[class*="cookie"] button, [class*="consent"] button, [class*="accept"]'
      );
      overlays.forEach((b) => { try { b.click(); } catch (_) {} });

      const btn =
        document.querySelector('.new-machinfo-view-btn-text') ||
        document.querySelector('span[aria-label="View Spec Info"]') ||
        document.querySelector('.new-machinfo-view-btn');
      if (btn) {
        btn.scrollIntoView({ behavior: 'instant', block: 'center' });
        btn.click();
        const desc = document.querySelector('.new-machinfo-desc');
        if (desc) desc.style.display = 'block';
        return true;
      }
      const desc = document.querySelector('.new-machinfo-desc');
      if (desc) { desc.style.display = 'block'; return true; }
      return false;
    });
    console.log(`[spec] JS click result: ${clicked}`);
    await page.waitForTimeout(2000);

    const specs = await page.evaluate(() => {
      const result = {};
      const names = document.querySelectorAll('.desc-config-name');
      names.forEach((nameEl) => {
        const key = nameEl.textContent.trim();
        if (!key) return;
        let value = '';
        let next = nameEl.nextElementSibling;
        while (next) {
          if (next.classList.contains('desc-config-name')) break;
          if (next.classList.contains('desc-config-detail') || next.tagName === 'DIV') {
            const text = next.textContent.trim();
            if (text) value += (value ? ' ' : '') + text;
          }
          next = next.nextElementSibling;
        }
        result[key] = value || 'N/A';
      });
      return result;
    });

    const productInfo = await page.evaluate(() => {
      const productNameEl = document.querySelector(
        '.new-product-name, .product-name, h2.product-name, h3.product-name'
      );
      const machineTypeEl = document.querySelector('.machine-type, .machineType');
      let productName = productNameEl ? productNameEl.textContent.trim() : null;
      if (!productName) {
        const h2s = document.querySelectorAll('h2, h3');
        for (const h of h2s) {
          const t = h.textContent.trim();
          if (/Laptop|Desktop|ThinkPad|IdeaPad|Legion|V14|V15/i.test(t)) {
            productName = t;
            break;
          }
        }
      }
      return {
        productName: productName || null,
        machineType: machineTypeEl ? machineTypeEl.textContent.trim() : null
      };
    });

    console.log(`[spec] Extracted ${Object.keys(specs).length} spec fields`);
    return {
      success: true, serialNumber,
      productName: productInfo.productName || null,
      machineType: productInfo.machineType || null,
      specifications: specs
    };
  } catch (error) {
    console.error('[spec] Error:', error.message);
    return { success: false, serialNumber, error: error.message };
  } finally {
    if (ownsBrowser && browser) await browser.close();
  }
}

// ── Scrape warranty info ─────────────────────────────────────────
async function getWarrantyInfo(serialNumber, opts = {}) {
  let browser, context;
  try {
    ({ browser, context } = await launchBrowser());
    const page = await context.newPage();
    console.log(`[warranty] Looking up serial: ${serialNumber}`);

    const apiUrl = `https://pcsupport.lenovo.com/us/en/api/v4/upsell/redport/getIbaseInfo?serialNumber=${serialNumber}&country=us&language=en`;
    let warrantyData = null;

    try {
      console.log('[warranty] Trying API endpoint...');
      const response = await page.goto(apiUrl, { waitUntil: 'networkidle', timeout: 15000 });
      if (response && response.ok()) {
        const jsonText = await page.textContent('body');
        const data = JSON.parse(jsonText);
        if (data && data.data) {
          console.log('[warranty] Got data from API endpoint');
          warrantyData = {
            serialNumber,
            productName: data.data.productName || data.data.machineType || 'Unknown',
            warrantyStatus: data.data.warrantyStatus || 'Unknown',
            startDate: data.data.warrantyStartDate || null,
            endDate: data.data.warrantyEndDate || null,
            daysRemaining: data.data.warrantyDaysRemaining || null,
            coverageDetails: data.data.warrantyDetails || []
          };
        }
      }
    } catch (apiError) {
      console.log('[warranty] API endpoint failed:', apiError.message);
    }

    if (!warrantyData) {
      console.log('[warranty] Falling back to page scraping...');
      const warrantyUrl = `https://pcsupport.lenovo.com/us/en/products/${serialNumber}/warranty`;
      await page.goto(warrantyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      warrantyData = await page.evaluate((sn) => {
        const d = { serialNumber: sn, productName: null, warrantyStatus: null, startDate: null, endDate: null, daysRemaining: null, coverageDetails: [] };
        const h2 = document.querySelector('h2');
        if (h2) d.productName = h2.textContent.trim();
        const statusEl = document.querySelector('.warranty-status, .status-label, [class*="status"]');
        if (statusEl) d.warrantyStatus = statusEl.textContent.trim();
        const datePattern = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g;
        const dates = document.body.innerText.match(datePattern);
        if (dates && dates.length >= 2) { d.startDate = dates[0]; d.endDate = dates[1]; }
        const rows = document.querySelectorAll('tr, .warranty-row, .coverage-item');
        rows.forEach((row) => {
          const text = row.textContent.trim();
          if (text && text.length < 300 && /warranty|coverage|support|Depot|On-Site/i.test(text)) d.coverageDetails.push(text);
        });
        d.coverageDetails = [...new Set(d.coverageDetails)];
        return d;
      }, serialNumber);
    }

    let specsData = null;
    if (opts.includeSpecs) specsData = await getMachineSpecs(serialNumber, page);

    return {
      ...warrantyData,
      ...(specsData && specsData.success ? { specifications: specsData.specifications } : {})
    };
  } catch (error) {
    console.error('[warranty] Error:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

// ── Full lookup (warranty + specs, one browser session) ──────────
async function getFullLookup(serialNumber) {
  let browser, context;
  try {
    ({ browser, context } = await launchBrowser());
    const page = await context.newPage();

    let warrantyData = null;
    const apiUrl = `https://pcsupport.lenovo.com/us/en/api/v4/upsell/redport/getIbaseInfo?serialNumber=${serialNumber}&country=us&language=en`;

    try {
      const response = await page.goto(apiUrl, { waitUntil: 'networkidle', timeout: 15000 });
      if (response && response.ok()) {
        const jsonText = await page.textContent('body');
        const data = JSON.parse(jsonText);
        if (data && data.data) {
          warrantyData = {
            serialNumber,
            productName: data.data.productName || data.data.machineType || 'Unknown',
            warrantyStatus: data.data.warrantyStatus || 'Unknown',
            startDate: data.data.warrantyStartDate || null,
            endDate: data.data.warrantyEndDate || null,
            daysRemaining: data.data.warrantyDaysRemaining || null,
            coverageDetails: data.data.warrantyDetails || []
          };
        }
      }
    } catch (_) {
      console.log('[full] API warranty failed, will try scraping warranty page later');
    }

    const specsResult = await getMachineSpecs(serialNumber, page);

    if (!warrantyData) {
      const warrantyUrl = `https://pcsupport.lenovo.com/us/en/products/${serialNumber}/warranty`;
      await page.goto(warrantyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      warrantyData = await page.evaluate((sn) => {
        const d = { serialNumber: sn, productName: null, warrantyStatus: null, startDate: null, endDate: null, daysRemaining: null, coverageDetails: [] };
        const h2 = document.querySelector('h2');
        if (h2) d.productName = h2.textContent.trim();
        const datePattern = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g;
        const dates = document.body.innerText.match(datePattern);
        if (dates && dates.length >= 2) { d.startDate = dates[0]; d.endDate = dates[1]; }
        return d;
      }, serialNumber);
    }

    return {
      success: true, serialNumber,
      warranty: warrantyData,
      specifications: specsResult.success ? specsResult.specifications : {},
      productName: specsResult.productName || warrantyData?.productName || null,
      machineType: specsResult.machineType || null,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[full] Error:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { launchBrowser, getMachineSpecs, getWarrantyInfo, getFullLookup };
