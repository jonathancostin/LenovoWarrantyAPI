const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { getMachineSpecs, getWarrantyInfo, getFullLookup } = require('./lib/scraper');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());

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
