// Simple Express API for public metrics dashboard
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - allow public access
app.use(cors({
  origin: '*'
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
