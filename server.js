const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());

// Shared browser launch + context helper
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
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/Chicago',
    ignoreHTTPSErrors: true
  });

  // Stealth
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  return { browser, context };
}

// ── Scrape machine specs from the product home page ──
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

    // Debug: log final URL + title + check what we landed on
    const finalUrl = page.url();
    const pageTitle = await page.title();
    console.log(`[spec] Final URL: ${finalUrl}`);
    console.log(`[spec] Page title: ${pageTitle}`);

    // Wait for the machine info section to render (React/SPA content)
    try {
      await page.waitForSelector('.new-machinfo-view-btn, .desc-config-name, .machine-info, .product-info', { timeout: 15000 });
      console.log('[spec] Machine info section found');
    } catch (e) {
      console.log('[spec] Machine info section not found by selector, dumping page info...');
      const debugInfo = await page.evaluate(() => {
        const allClasses = new Set();
        document.querySelectorAll('[class]').forEach(el => {
          const cn = typeof el.className === 'string' ? el.className : (el.className.baseVal || '');
          cn.split(/\s+/).forEach(c => { if (c && (c.includes('mach') || c.includes('spec') || c.includes('config') || c.includes('product') || c.includes('info') || c.includes('serial') || c.includes('desc') || c.includes('view'))) allClasses.add(c); });
        });
        return {
          url: window.location.href,
          relevantClasses: [...allClasses].sort(),
          bodyText: document.body.innerText.substring(0, 3000)
        };
      });
      console.log('[spec] Relevant classes:', debugInfo.relevantClasses.join(', '));
      console.log('[spec] Body text (first 3000 chars):\n', debugInfo.bodyText);
    }

    // The "View Spec Info" button may be off-screen or hidden behind overlays.
    // Use JavaScript to scroll to it, click it, and force the desc panel visible.
    const clicked = await page.evaluate(() => {
      // Dismiss any cookie/consent overlays
      const overlays = document.querySelectorAll('[class*="cookie"] button, [class*="consent"] button, [class*="accept"]');
      overlays.forEach(b => { try { b.click(); } catch(e) {} });

      const btn = document.querySelector('.new-machinfo-view-btn-text') ||
                  document.querySelector('span[aria-label="View Spec Info"]') ||
                  document.querySelector('.new-machinfo-view-btn');
      if (btn) {
        btn.scrollIntoView({ behavior: 'instant', block: 'center' });
        btn.click();
        // Also force the desc panel visible in case click didn't toggle it
        const desc = document.querySelector('.new-machinfo-desc');
        if (desc) desc.style.display = 'block';
        return true;
      }
      // Fallback: force desc panel visible even without clicking
      const desc = document.querySelector('.new-machinfo-desc');
      if (desc) {
        desc.style.display = 'block';
        return true;
      }
      return false;
    });
    console.log(`[spec] JS click result: ${clicked}`);
    await page.waitForTimeout(2000);

    // Extract all spec name/detail pairs using sibling relationships
    const specs = await page.evaluate(() => {
      const result = {};
      const names = document.querySelectorAll('.desc-config-name');

      names.forEach((nameEl) => {
        const key = nameEl.textContent.trim();
        if (!key) return;

        // Walk forward from this name element to collect detail text
        let value = '';
        let next = nameEl.nextElementSibling;
        while (next) {
          if (next.classList.contains('desc-config-name')) break; // next spec field
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

    // Also grab the product name / machine type from the page
    const productInfo = await page.evaluate(() => {
      // The product name is in the "Product Information" section or h2
      const productNameEl = document.querySelector('.new-product-name, .product-name, h2.product-name, h3.product-name');
      const machineTypeEl = document.querySelector('.machine-type, .machineType');

      // Also try to grab serial + MTM from product info section
      const serialEl = document.querySelector('.serial-number, [class*="serial"]');
      const mtmEl = document.querySelector('.machine-type-model, [class*="machine-type"]');

      // Grab the product title from breadcrumb or page title area
      let productName = productNameEl ? productNameEl.textContent.trim() : null;
      if (!productName) {
        // Try the Product Information header area
        const h2s = document.querySelectorAll('h2, h3');
        for (const h of h2s) {
          const t = h.textContent.trim();
          if (t.includes('Laptop') || t.includes('Desktop') || t.includes('ThinkPad') || t.includes('IdeaPad') || t.includes('Legion') || t.includes('V14') || t.includes('V15')) {
            productName = t;
            break;
          }
        }
      }

      return {
        productName: productName || null,
        machineType: machineTypeEl ? machineTypeEl.textContent.trim() : (mtmEl ? mtmEl.textContent.trim() : null),
      };
    });

    console.log(`[spec] Extracted ${Object.keys(specs).length} spec fields`);

    return {
      success: true,
      serialNumber,
      productName: productInfo.productName || null,
      machineType: productInfo.machineType || null,
      specifications: specs
    };

  } catch (error) {
    console.error('[spec] Error:', error.message);
    return {
      success: false,
      serialNumber,
      error: error.message
    };
  } finally {
    if (ownsBrowser && browser) {
      await browser.close();
    }
  }
}

// ── Scrape warranty information ──
async function getWarrantyInfo(serialNumber, opts = {}) {
  let browser, context;

  try {
    ({ browser, context } = await launchBrowser());
    const page = await context.newPage();

    console.log(`[warranty] Looking up serial: ${serialNumber}`);

    // Try direct API endpoint first
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

    // Fallback: scrape the warranty page
    if (!warrantyData) {
      console.log('[warranty] Falling back to page scraping...');
      const warrantyUrl = `https://pcsupport.lenovo.com/us/en/products/${serialNumber}/warranty`;
      await page.goto(warrantyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      warrantyData = await page.evaluate((sn) => {
        const data = {
          serialNumber: sn,
          productName: null,
          warrantyStatus: null,
          startDate: null,
          endDate: null,
          daysRemaining: null,
          coverageDetails: []
        };

        // Try product name
        const h2 = document.querySelector('h2');
        if (h2) data.productName = h2.textContent.trim();

        // Try warranty status
        const statusEl = document.querySelector('.warranty-status, .status-label, [class*="status"]');
        if (statusEl) data.warrantyStatus = statusEl.textContent.trim();

        // Dates
        const datePattern = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g;
        const allText = document.body.innerText;
        const dates = allText.match(datePattern);
        if (dates && dates.length >= 2) {
          data.startDate = dates[0];
          data.endDate = dates[1];
        }

        // Coverage details
        const rows = document.querySelectorAll('tr, .warranty-row, .coverage-item');
        rows.forEach(row => {
          const text = row.textContent.trim();
          if (text && text.length < 300 && (text.includes('warranty') || text.includes('coverage') || text.includes('support') || text.includes('Depot') || text.includes('On-Site'))) {
            data.coverageDetails.push(text);
          }
        });
        data.coverageDetails = [...new Set(data.coverageDetails)];

        return data;
      }, serialNumber);
    }

    // Optionally grab specs too (combined lookup)
    let specsData = null;
    if (opts.includeSpecs) {
      specsData = await getMachineSpecs(serialNumber, page);
    }

    const result = {
      ...warrantyData,
      ...(specsData && specsData.success ? { specifications: specsData.specifications } : {})
    };

    return result;

  } catch (error) {
    console.error('[warranty] Error:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ── Full lookup: warranty + specs in one call ──
async function getFullLookup(serialNumber) {
  let browser, context;

  try {
    ({ browser, context } = await launchBrowser());
    const page = await context.newPage();

    // 1) Get warranty data via API
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
    } catch (e) {
      console.log('[full] API warranty failed, will try scraping warranty page later');
    }

    // 2) Navigate to product home for specs
    const specsResult = await getMachineSpecs(serialNumber, page);

    // 3) If warranty API failed, try scraping the warranty page
    if (!warrantyData) {
      const warrantyUrl = `https://pcsupport.lenovo.com/us/en/products/${serialNumber}/warranty`;
      await page.goto(warrantyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      warrantyData = await page.evaluate((sn) => {
        const data = { serialNumber: sn, productName: null, warrantyStatus: null, startDate: null, endDate: null, daysRemaining: null, coverageDetails: [] };
        const h2 = document.querySelector('h2');
        if (h2) data.productName = h2.textContent.trim();
        const datePattern = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g;
        const dates = document.body.innerText.match(datePattern);
        if (dates && dates.length >= 2) { data.startDate = dates[0]; data.endDate = dates[1]; }
        return data;
      }, serialNumber);
    }

    return {
      success: true,
      serialNumber,
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

// ════════════════════════════════════════════
// API ENDPOINTS
// ════════════════════════════════════════════

// Warranty only
app.post('/api/warranty-lookup', async (req, res) => {
  const { serialNumber } = req.body;
  if (!serialNumber || serialNumber.length < 5 || serialNumber.length > 30) {
    return res.status(400).json({ success: false, error: 'Valid serial number required (5-30 chars)' });
  }
  try {
    console.log(`[POST /api/warranty-lookup] serial: ${serialNumber}`);
    const data = await getWarrantyInfo(serialNumber);
    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to retrieve warranty info', details: error.message });
  }
});

// Specs only
app.post('/api/spec-lookup', async (req, res) => {
  const { serialNumber } = req.body;
  if (!serialNumber || serialNumber.length < 5 || serialNumber.length > 30) {
    return res.status(400).json({ success: false, error: 'Valid serial number required (5-30 chars)' });
  }
  try {
    console.log(`[POST /api/spec-lookup] serial: ${serialNumber}`);
    const data = await getMachineSpecs(serialNumber);
    res.json({ ...data, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to retrieve spec info', details: error.message });
  }
});

// Full lookup (warranty + specs in one browser session)
app.post('/api/full-lookup', async (req, res) => {
  const { serialNumber } = req.body;
  if (!serialNumber || serialNumber.length < 5 || serialNumber.length > 30) {
    return res.status(400).json({ success: false, error: 'Valid serial number required (5-30 chars)' });
  }
  try {
    console.log(`[POST /api/full-lookup] serial: ${serialNumber}`);
    const data = await getFullLookup(serialNumber);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to retrieve info', details: error.message });
  }
});

// Bulk lookup (multiple serials)
app.post('/api/bulk-lookup', async (req, res) => {
  const { serialNumbers } = req.body;
  if (!Array.isArray(serialNumbers) || serialNumbers.length === 0) {
    return res.status(400).json({ success: false, error: 'serialNumbers array required' });
  }
  if (serialNumbers.length > 50) {
    return res.status(400).json({ success: false, error: 'Max 50 serials per request' });
  }

  console.log(`[POST /api/bulk-lookup] ${serialNumbers.length} serials`);
  const results = [];
  for (const sn of serialNumbers) {
    try {
      const data = await getFullLookup(sn.trim());
      results.push(data);
    } catch (error) {
      results.push({ success: false, serialNumber: sn, error: error.message });
    }
  }
  res.json({ success: true, count: results.length, results, timestamp: new Date().toISOString() });
});

// Info endpoints
app.get('/api/warranty-lookup', (req, res) => {
  res.json({
    message: 'Lenovo Warranty + Spec Lookup API',
    endpoints: {
      'POST /api/warranty-lookup': { body: { serialNumber: 'string' }, description: 'Warranty info only' },
      'POST /api/spec-lookup': { body: { serialNumber: 'string' }, description: 'Machine specs only' },
      'POST /api/full-lookup': { body: { serialNumber: 'string' }, description: 'Warranty + specs combined' },
      'POST /api/bulk-lookup': { body: { serialNumbers: ['string'] }, description: 'Multiple serials (max 50)' },
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', service: 'Lenovo Warranty + Spec Lookup API', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Lenovo Warranty + Spec API running on port ${PORT}`);
  console.log('Endpoints:');
  console.log('  POST /api/warranty-lookup  — warranty only');
  console.log('  POST /api/spec-lookup      — machine specs only');
  console.log('  POST /api/full-lookup      — warranty + specs');
  console.log('  POST /api/bulk-lookup      — multiple serials');
  console.log('  GET  /api/health           — health check');
});

module.exports = app;
