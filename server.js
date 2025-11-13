const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'https://streamwest.lol',
  credentials: true
}));
app.use(express.json());

// Function to scrape warranty information
async function getWarrantyInfo(serialNumber) {
  let browser;

  try {
    // Launch browser with stealth options
    browser = await chromium.launch({
      headless: false, // Run in non-headless mode to appear more human-like
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1920,1080',
        '--start-maximized'
      ]
    });

    const context = await browser.newContext({
      viewport: null, // Use full window size
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation'],
      geolocation: { latitude: 40.7128, longitude: -74.0060 }, // New York
      ignoreHTTPSErrors: true
    });

    // Add stealth scripts to avoid detection
    await context.addInitScript(() => {
      // Override the navigator.webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Override plugins to look more realistic
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
    });

    const page = await context.newPage();

    console.log('Attempting to navigate to Lenovo warranty page...');

    // Try direct warranty API endpoint first
    const apiUrl = `https://pcsupport.lenovo.com/us/en/api/v4/upsell/redport/getIbaseInfo?serialNumber=${serialNumber}&country=us&language=en`;

    try {
      console.log('Trying API endpoint first...');
      const response = await page.goto(apiUrl, {
        waitUntil: 'networkidle',
        timeout: 15000
      });

      if (response && response.ok()) {
        const jsonText = await page.textContent('body');
        const data = JSON.parse(jsonText);

        if (data && data.data) {
          console.log('Got data from API endpoint');
          return {
            serialNumber: serialNumber,
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
      console.log('API endpoint failed, trying web scraping...', apiError.message);
    }

    // Fallback to web scraping
    await page.goto('https://pcsupport.lenovo.com/us/en/products/laptops-and-netbooks', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait a moment for page to stabilize
    await page.waitForTimeout(2000);

    // Look for warranty search or serial number input
    console.log('Looking for warranty search option...');

    // Try to find and click warranty lookup link
    const warrantyLinks = await page.$$('a[href*="warranty"], button:has-text("warranty"), a:has-text("warranty")');
    if (warrantyLinks.length > 0) {
      await warrantyLinks[0].click();
      await page.waitForTimeout(2000);
    }

    // Alternative: Go directly to the form URL
    await page.goto(`https://pcsupport.lenovo.com/us/en/products/laptops-and-netbooks/detect-my-serial-number`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for the input field to be ready
    await page.waitForSelector('input[type="text"], input[placeholder*="serial" i], #serialNumber', {
      timeout: 10000
    });

    // Find and fill the serial number input
    // Try multiple possible selectors as websites can change
    const inputSelectors = [
      'input#serialNumber',
      'input[placeholder*="serial" i]',
      'input[type="text"]:visible',
      'input[name*="serial" i]'
    ];

    let inputFilled = false;
    for (const selector of inputSelectors) {
      try {
        const input = await page.$(selector);
        if (input) {
          await input.fill(serialNumber);
          inputFilled = true;
          console.log(`Filled serial number using selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!inputFilled) {
      throw new Error('Could not find serial number input field');
    }

    // Submit the form - try multiple methods
    // First try to find and click a submit button
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Submit")',
      'button:has-text("Search")',
      'button:has-text("Find")',
      'button:has-text("Go")',
      'input[type="submit"]',
      'button.btn-primary',
      'button.submit-btn'
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        const button = await page.$(selector);
        if (button && await button.isVisible()) {
          await button.click();
          submitted = true;
          console.log(`Clicked submit using selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // If no button found, try pressing Enter
    if (!submitted) {
      console.log('No submit button found, pressing Enter');
      await page.keyboard.press('Enter');
    }

    // Wait for navigation or results to load
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Wait a bit for any dynamic content to load
    await page.waitForTimeout(3000);

    // Extract warranty information
    // These selectors will need to be adjusted based on the actual page structure
    const warrantyData = await page.evaluate(() => {
      const data = {
        serialNumber: null,
        productName: null,
        warrantyStatus: null,
        startDate: null,
        endDate: null,
        daysRemaining: null,
        coverageDetails: []
      };

      // Helper function to extract text safely
      const getText = (selector) => {
        const element = document.querySelector(selector);
        return element ? element.textContent.trim() : null;
      };

      // Helper function to extract text by containing text
      const getTextByContent = (text) => {
        const elements = Array.from(document.querySelectorAll('*'));
        const element = elements.find(el =>
          el.textContent && el.textContent.includes(text) &&
          el.children.length === 0
        );
        return element ? element.textContent.trim() : null;
      };

      // Try to find warranty dates - these patterns are common
      const datePattern = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g;
      const allText = document.body.innerText;
      const dates = allText.match(datePattern);

      if (dates && dates.length >= 2) {
        data.startDate = dates[0];
        data.endDate = dates[1];
      }

      // Try to find product name
      const productSelectors = [
        'h1', 'h2', 'h3',
        '.product-name',
        '.model-name',
        '[class*="product"]',
        '[class*="model"]'
      ];

      for (const selector of productSelectors) {
        const text = getText(selector);
        if (text && text.length > 3 && text.length < 100) {
          data.productName = text;
          break;
        }
      }

      // Try to find warranty status
      const statusKeywords = ['Active', 'Expired', 'Valid', 'Invalid', 'In Warranty', 'Out of Warranty'];
      for (const keyword of statusKeywords) {
        const statusText = getTextByContent(keyword);
        if (statusText) {
          data.warrantyStatus = statusText;
          break;
        }
      }

      // Look for any coverage details in lists or tables
      const coverageElements = document.querySelectorAll('li, td');
      coverageElements.forEach(element => {
        const text = element.textContent.trim();
        if (text && (text.includes('warranty') || text.includes('coverage') || text.includes('support'))) {
          if (text.length < 200) {
            data.coverageDetails.push(text);
          }
        }
      });

      // Remove duplicates from coverage details
      data.coverageDetails = [...new Set(data.coverageDetails)];

      return data;
    });

    // Add the input serial number if not found on page
    if (!warrantyData.serialNumber) {
      warrantyData.serialNumber = serialNumber;
    }

    console.log('Warranty data extracted:', warrantyData);
    return warrantyData;

  } catch (error) {
    console.error('Error scraping warranty info:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// API endpoint for warranty lookup
app.post('/api/warranty-lookup', async (req, res) => {
  const { serialNumber } = req.body;

  if (!serialNumber) {
    return res.status(400).json({
      success: false,
      error: 'Serial number is required'
    });
  }

  // Basic validation for serial number format
  if (serialNumber.length < 5 || serialNumber.length > 30) {
    return res.status(400).json({
      success: false,
      error: 'Invalid serial number format'
    });
  }

  try {
    console.log(`Processing warranty lookup for serial: ${serialNumber}`);
    const warrantyInfo = await getWarrantyInfo(serialNumber);

    res.json({
      success: true,
      data: warrantyInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Warranty lookup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve warranty information',
      details: error.message
    });
  }
});

// GET endpoint for testing
app.get('/api/warranty-lookup', (req, res) => {
  res.json({
    success: true,
    message: 'Warranty lookup API is running',
    endpoint: 'POST /api/warranty-lookup',
    requiredField: 'serialNumber',
    example: {
      serialNumber: 'YOUR_SERIAL_NUMBER_HERE'
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Lenovo Warranty Lookup API',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Warranty lookup API server running on port ${PORT}`);
  console.log(`CORS enabled for: ${process.env.ALLOWED_ORIGIN || 'https://streamwest.lol'}`);
});

module.exports = app;