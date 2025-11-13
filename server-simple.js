const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'https://streamwest.lol',
  credentials: true
}));
app.use(express.json());

// Simple API approach without browser automation
async function getWarrantyInfoSimple(serialNumber) {
  try {
    // Try various Lenovo API endpoints with different methods
    const apiAttempts = [
      {
        url: `https://pcsupport.lenovo.com/us/en/api/v4/upsell/redport/getIbaseInfo`,
        method: 'POST',
        body: JSON.stringify({ serialNumber: serialNumber, country: 'us', language: 'en' })
      },
      {
        url: `https://pcsupport.lenovo.com/us/en/api/v4/upsell/redport/getIbaseInfo?serialNumber=${serialNumber}&country=us&language=en`,
        method: 'POST',
        body: null
      },
      {
        url: `https://pcsupport.lenovo.com/us/en/api/v4/mse/getproducts`,
        method: 'POST',
        body: JSON.stringify({ productId: serialNumber })
      },
      {
        url: `https://supportapi.lenovo.com/v2.5/warranty`,
        method: 'POST',
        body: JSON.stringify({ Serial: serialNumber })
      },
      {
        url: `https://pcsupport.lenovo.com/us/en/api/v4/warranties/check`,
        method: 'POST',
        body: JSON.stringify({ serialNumber: serialNumber })
      }
    ];

    console.log(`Checking warranty for serial: ${serialNumber}`);

    for (const attempt of apiAttempts) {
      try {
        console.log(`Trying ${attempt.method} to: ${attempt.url}`);

        const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://pcsupport.lenovo.com/',
          'Origin': 'https://pcsupport.lenovo.com'
        };

        if (attempt.body) {
          headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(attempt.url, {
          method: attempt.method,
          headers: headers,
          body: attempt.body
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type');

          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            console.log('Got JSON response:', JSON.stringify(data, null, 2));

            // Try to extract warranty info from various possible response formats
            if (data.data) {
              // Check for Lenovo API v4 format
              if (data.data.machineInfo) {
                const machineInfo = data.data.machineInfo;
                const currentWarranty = data.data.currentWarranty;
                const baseWarranties = data.data.baseWarranties || [];
                const upgradeWarranties = data.data.upgradeWarranties || [];

                // Combine all warranties
                const allWarranties = [...baseWarranties, ...upgradeWarranties];

                return {
                  success: true,
                  serialNumber: machineInfo.serial || serialNumber,
                  productName: machineInfo.productName || machineInfo.model || 'Unknown',
                  productModel: machineInfo.model || null,
                  productType: machineInfo.type || null,
                  buildDate: machineInfo.buildDate || null,
                  shipDate: machineInfo.shipDate || null,
                  warrantyStatus: data.data.warrantyStatus || 'Unknown',
                  isOutOfWarranty: data.data.oow || false,
                  currentWarranty: currentWarranty ? {
                    name: currentWarranty.name,
                    description: currentWarranty.description,
                    type: currentWarranty.deliveryTypeName,
                    startDate: currentWarranty.startDate,
                    endDate: currentWarranty.endDate,
                    remainingDays: currentWarranty.remainingDays || 0
                  } : null,
                  warranties: allWarranties.map(w => ({
                    name: w.name,
                    type: w.type,
                    deliveryType: w.deliveryTypeName,
                    duration: w.duration,
                    startDate: w.startDate,
                    endDate: w.endDate,
                    description: w.description
                  })),
                  specifications: machineInfo.specification || null
                };
              }

              // Fallback for other formats
              return {
                success: true,
                serialNumber: serialNumber,
                productName: data.data.productName || data.data.model || data.data.machineType || 'Unknown',
                warrantyStatus: data.data.warrantyStatus || data.data.status || 'Unknown',
                startDate: data.data.warrantyStartDate || data.data.startDate || null,
                endDate: data.data.warrantyEndDate || data.data.endDate || null,
                expirationDate: data.data.expirationDate || null,
                daysRemaining: data.data.warrantyDaysRemaining || data.data.daysRemaining || null,
                coverageDetails: data.data.warrantyDetails || data.data.coverage || [],
                raw: data
              };
            } else if (data.warranty) {
              return {
                success: true,
                serialNumber: serialNumber,
                productName: data.product || 'Unknown',
                warrantyStatus: data.warranty.status || 'Unknown',
                startDate: data.warranty.startDate || null,
                endDate: data.warranty.endDate || null,
                expirationDate: data.warranty.expirationDate || null,
                daysRemaining: data.warranty.daysRemaining || null,
                coverageDetails: data.warranty.details || [],
                raw: data
              };
            } else {
              // Return raw data if structure is unknown
              return {
                success: true,
                serialNumber: serialNumber,
                raw: data,
                message: 'Data retrieved but structure unknown'
              };
            }
          } else {
            const text = await response.text();
            console.log('Got text response (first 500 chars):', text.substring(0, 500));
          }
        } else {
          console.log(`Request returned status ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.log(`Request failed: ${error.message}`);
      }
    }

    // If all endpoints fail, return error
    return {
      success: false,
      serialNumber: serialNumber,
      error: 'Could not retrieve warranty information from any endpoint'
    };

  } catch (error) {
    console.error('Error in getWarrantyInfoSimple:', error);
    return {
      success: false,
      serialNumber: serialNumber,
      error: error.message
    };
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
    const warrantyInfo = await getWarrantyInfoSimple(serialNumber);

    res.json({
      ...warrantyInfo,
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
    message: 'Simple Warranty lookup API is running',
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
    service: 'Lenovo Warranty Lookup API (Simple Version)',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Simple Warranty lookup API server running on port ${PORT}`);
  console.log(`CORS enabled for: ${process.env.ALLOWED_ORIGIN || 'https://streamwest.lol'}`);
});

module.exports = app;