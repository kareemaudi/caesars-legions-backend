const https = require('https');

const data = JSON.stringify({
  companyName: 'TestCo',
  email: 'testdemo@example.com',
  name: 'Test User',
  website: 'https://testco.com',
  industry: 'saas'
});

const options = {
  hostname: 'natural-energy-production-df04.up.railway.app',
  path: '/api/clients/signup',
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
    console.log(`Status: ${res.statusCode}`);
    console.log(`Response: ${body}`);
  });
});

req.on('error', (e) => console.error(`Error: ${e.message}`));
req.write(data);
req.end();
