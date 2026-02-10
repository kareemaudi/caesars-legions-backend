const https = require('https');

// Test existing /api/leads endpoint
const data = JSON.stringify({
  email: 'test@example.com',
  name: 'Test',
  company: 'TestCo'
});

const options = {
  hostname: 'natural-energy-production-df04.up.railway.app',
  path: '/api/leads',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(`/api/leads → Status: ${res.statusCode}`);
    console.log(`Response: ${body}`);
  });
});

req.on('error', (e) => console.error(`Error: ${e.message}`));
req.write(data);
req.end();

// Also test GET /health and GET /
const get = (path) => {
  https.get(`https://natural-energy-production-df04.up.railway.app${path}`, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log(`GET ${path} → Status: ${res.statusCode}`);
      console.log(`Response (first 200 chars): ${body.slice(0, 200)}`);
    });
  });
};

get('/health');
