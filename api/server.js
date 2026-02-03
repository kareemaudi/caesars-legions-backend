// ============================================================================
// API SERVER - Caesar's Legions
// ============================================================================
// Purpose: Express server for webhooks and API endpoints
// Usage: node api/server.js
// ============================================================================

const express = require('express');
const { setupWebhookRoutes } = require('./webhooks');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS (allow all for now, tighten in production)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({
    service: "Caesar's Legions API",
    version: '1.0.0',
    status: 'operational',
    endpoints: [
      'POST /api/webhooks/instantly - Instantly.ai webhook receiver',
      'GET  /api/webhooks/health - Webhook health check',
      'GET  /api/webhooks/events - Recent webhook events',
      'GET  /api/webhooks/metrics - Webhook metrics'
    ]
  });
});

// Setup webhook routes
setupWebhookRoutes(app);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║           🏛️ CAESAR'S LEGIONS API SERVER 🏛️                ║
╠════════════════════════════════════════════════════════════╣
║  Status:    OPERATIONAL                                    ║
║  Port:      ${PORT}                                            ║
║  Webhook:   http://localhost:${PORT}/api/webhooks/instantly    ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}

module.exports = app;
