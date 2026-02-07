// Simple Express API for public metrics dashboard
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - restrict to allowed domains
const ALLOWED_ORIGINS = [
  'https://caesarslegions.ai',
  'https://promptabusiness.com',
  'https://www.promptabusiness.com',
  process.env.BASE_URL || 'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed'), false);
  },
  credentials: true
}));

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public metrics endpoint
app.get('/api/metrics', async (req, res) => {
  try {
    // Read from caesar's memory/metrics.json or hardcode current state
    const metrics = {
      revenue: {
        mrr: 0,
        mrrChange: 0,
        clients: 0,
        clientsChange: 0
      },
      product: {
        features_shipped_week: 3,
        tests_passing: "16/16"
      },
      history: {
        labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
        values: [0, 0, 0, 0]
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Metrics API running on port ${PORT}`);
});
