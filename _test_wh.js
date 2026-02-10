try {
  const wh = require('./lib/webhook-handler');
  console.log('Type:', typeof wh);
  console.log('Keys:', Object.keys(wh));
  console.log('Is function:', typeof wh === 'function');
  if (wh.router) console.log('Has .router:', typeof wh.router);
} catch(e) {
  console.log('Error:', e.message);
}
