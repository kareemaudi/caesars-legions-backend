const https = require('https');

function test(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: 'natural-energy-production-df04.up.railway.app',
      path,
      method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => {
        console.log(`${method} ${path} → ${res.statusCode}`);
        try { console.log(JSON.stringify(JSON.parse(b), null, 2)); } catch(e) { console.log(b.slice(0, 300)); }
        console.log('---');
        resolve(res.statusCode);
      });
    });
    req.on('error', (e) => { console.log(`Error: ${e.message}`); resolve(0); });
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  // Test health
  await test('GET', '/health', null);
  
  // Test new signup endpoint
  const code = await test('POST', '/api/clients/signup', {
    companyName: 'Demo Corp',
    email: 'demo@democorp.com',
    name: 'Demo User',
    website: 'https://democorp.com',
    industry: 'saas'
  });
  
  if (code === 200) {
    console.log('✅ SIGNUP ENDPOINT IS LIVE!');
    // Test status
    await test('GET', '/api/clients/1/status', null);
  } else {
    console.log('⏳ Deploy not live yet (still old version)');
  }
})();
