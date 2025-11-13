# Lenovo Warranty Lookup API

A Node.js API server that uses Playwright to automate warranty lookups on the Lenovo support website.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
- `PORT`: Server port (default: 3001)
- `ALLOWED_ORIGIN`: Your website domain (default: https://streamwest.lol)

## Running the Server

```bash
# Start the server
npm start

# Or
node server.js
```

## API Endpoints

### POST /api/warranty-lookup
Looks up warranty information for a Lenovo device.

**Request:**
```json
{
  "serialNumber": "YOUR_SERIAL_NUMBER"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "serialNumber": "YOUR_SERIAL_NUMBER",
    "productName": "Product Name",
    "warrantyStatus": "Active/Expired",
    "startDate": "MM/DD/YYYY",
    "endDate": "MM/DD/YYYY",
    "daysRemaining": 123,
    "coverageDetails": ["Coverage detail 1", "Coverage detail 2"]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET /api/warranty-lookup
Returns API information and usage example.

### GET /api/health
Health check endpoint.

## Integration with Your Website

To integrate with your website at streamwest.lol, you can make requests like this:

```javascript
async function checkWarranty(serialNumber) {
  try {
    const response = await fetch('https://YOUR_API_DOMAIN/api/warranty-lookup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ serialNumber }),
    });

    const data = await response.json();

    if (data.success) {
      console.log('Warranty Info:', data.data);
    } else {
      console.error('Error:', data.error);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}
```

## Notes

- The API uses Playwright to automate browser interactions, which may take a few seconds per request
- Make sure the server has enough resources to run headless Chrome
- The scraping selectors may need updates if Lenovo changes their website structure
- For production use, consider adding rate limiting and caching

## Troubleshooting

If the API fails to get warranty information:
1. Check that the serial number is valid
2. Verify that the Lenovo website is accessible
3. Review the server logs for specific error messages
4. The website structure may have changed - selectors in `server.js` might need updating# LenovoWarrantyAPI
