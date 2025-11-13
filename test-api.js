const http = require('http');

// Test configuration
const API_HOST = 'localhost';
const API_PORT = 3001;
const TEST_SERIAL = 'TEST123456'; // Replace with a real Lenovo serial number

// Function to test the warranty lookup
async function testWarrantyLookup(serialNumber) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ serialNumber });

    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/warranty-lookup',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Function to test the health endpoint
async function testHealthEndpoint() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/health',
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Run tests
async function runTests() {
  console.log('Testing Lenovo Warranty Lookup API\n');
  console.log('=====================================\n');

  // Test health endpoint
  console.log('1. Testing health endpoint...');
  try {
    const health = await testHealthEndpoint();
    console.log('✅ Health check passed:', health);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }

  console.log('\n=====================================\n');

  // Test warranty lookup
  console.log(`2. Testing warranty lookup for serial: ${TEST_SERIAL}`);
  console.log('⏳ This may take a few seconds as it launches a browser...\n');

  try {
    const result = await testWarrantyLookup(TEST_SERIAL);

    if (result.success) {
      console.log('✅ Warranty lookup successful!\n');
      console.log('Response:', JSON.stringify(result, null, 2));
    } else {
      console.log('❌ Warranty lookup failed:');
      console.log('Error:', result.error);
      if (result.details) {
        console.log('Details:', result.details);
      }
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }

  console.log('\n=====================================\n');
  console.log('Tests completed!');
}

// Check if server is running before testing
const checkServer = () => {
  const options = {
    hostname: API_HOST,
    port: API_PORT,
    path: '/api/health',
    method: 'GET',
    timeout: 2000,
  };

  const req = http.request(options, (res) => {
    console.log(`API server is running on ${API_HOST}:${API_PORT}\n`);
    runTests();
  });

  req.on('error', (error) => {
    console.error(`\n❌ Cannot connect to API server at ${API_HOST}:${API_PORT}`);
    console.error('Please make sure the server is running with: npm start\n');
    process.exit(1);
  });

  req.on('timeout', () => {
    req.destroy();
    console.error(`\n❌ Connection timeout to ${API_HOST}:${API_PORT}`);
    console.error('Please make sure the server is running with: npm start\n');
    process.exit(1);
  });

  req.end();
};

// Run the test
console.log('\n🔍 Checking if API server is running...');
checkServer();