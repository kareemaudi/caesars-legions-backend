const https = require('https');

const paths = ['/', '/api/signup', '/api/onboard'];

paths.forEach(p => {
  const opts = {
    hostname: 'natural-energy-production-df04.up.railway.app',
    path: p,
    method: p === '/' ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' }
  };
  
  const req = https.request(opts, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log(`${opts.method} ${p} → ${res.statusCode}: ${body.slice(0, 300)}`);
    });
  });
  
  req.on('error', (e) => console.error(`Error ${p}: ${e.message}`));
  if (opts.method === 'POST') req.write('{}');
  req.end();
});
