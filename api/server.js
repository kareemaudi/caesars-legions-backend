// ============================================================================
// API SERVER - Caesar's Legions
// ============================================================================
// Purpose: Express server for webhooks and API endpoints
// Usage: node api/server.js
// ============================================================================

const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Use v2 webhooks with metrics integration (set WEBHOOKS_V1=true for legacy)
const { setupWebhookRoutes } = process.env.WEBHOOKS_V1 
  ? require('./webhooks')
  : require('./webhooks-v2');
const { setupStripeRoutes } = require('./stripe');
const { setupOnboardingRoutes } = require('./onboarding');
const { setupPublicAPIRoutes } = require('./public-api');

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
    version: '1.1.0',
    status: 'operational',
    endpoints: {
      signup: [
        'POST /api/signup - Create Stripe checkout session',
        'GET  /api/stripe/health - Stripe configuration status'
      ],
      webhooks: [
        'POST /api/webhooks/instantly - Instantly.ai webhook receiver',
        'POST /api/stripe/webhook - Stripe payment webhook',
        'GET  /api/webhooks/health - Webhook health check',
        'GET  /api/webhooks/events - Recent webhook events',
        'GET  /api/webhooks/metrics - Webhook metrics'
      ],
      clients: [
        'GET  /api/clients - List all clients (admin)',
        'GET  /api/onboarding/:clientId - Onboarding status',
        'GET  /api/subscription/:customerId - Subscription status'
      ]
    }
  });
});

// Setup routes
setupWebhookRoutes(app);
setupStripeRoutes(app);
setupOnboardingRoutes(app);
setupPublicAPIRoutes(app);

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
