// ============================================================================
// INSTANTLY WEBHOOK HANDLER v2 - Caesar's Legions
// ============================================================================
// Purpose: API routes using the new lib/instantly-webhooks module
// Benefits: Metrics tracking, signature verification, deduplication, A/B test integration
// Status: Production Ready
// Created: 2026-02-04
// ============================================================================

const fs = require('fs');
const path = require('path');

// Import the new lib module with full features
const { getInstance: getWebhookHandler, EVENT_TYPES } = require('../lib/instantly-webhooks');
const { getMetricsTracker } = require('../lib/metrics-tracker');

// Data paths for backward compatibility with existing endpoints
const DATA_DIR = path.join(__dirname, '..', 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'webhook-events.jsonl');
const METRICS_FILE = path.join(__dirname, 'metrics.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================================
// CALLBACK HANDLERS (Business Logic)
// ============================================================================

/**
 * Callbacks triggered by webhook events - customize these for your business logic
 */
const webhookCallbacks = {
  // Called when a reply is received (could be positive or negative)
  onReply: async ({ leadEmail, campaignId, replyBody, sentiment }) => {
    console.log(`[Webhook] Reply from ${leadEmail}: sentiment=${sentiment}`);
    
    // Store for sales team review
    const replyData = {
      timestamp: new Date().toISOString(),
      type: 'reply',
      leadEmail,
      campaignId,
      sentiment,
      replyPreview: replyBody?.substring(0, 200)
    };
    
    // Append to replies file for easy tracking
    const repliesFile = path.join(DATA_DIR, 'replies.jsonl');
    fs.appendFileSync(repliesFile, JSON.stringify(replyData) + '\n');
    
    // If positive, could trigger notification
    if (sentiment === 'positive' || sentiment === 'interested') {
      // TODO: Send Telegram alert for hot lead
      console.log(`[HOT LEAD] Positive reply from ${leadEmail}!`);
    }
  },
  
  // Called when a lead is marked as interested (high confidence)
  onInterested: async ({ leadEmail, campaignId, confidence }) => {
    console.log(`[Webhook] Interested lead: ${leadEmail} (confidence: ${confidence})`);
    
    // Store hot lead for immediate follow-up
    const hotLeadData = {
      timestamp: new Date().toISOString(),
      type: 'hot_lead',
      leadEmail,
      campaignId,
      confidence,
      status: 'pending_contact'
    };
    
    const hotLeadsFile = path.join(DATA_DIR, 'hot-leads.jsonl');
    fs.appendFileSync(hotLeadsFile, JSON.stringify(hotLeadData) + '\n');
  },
  
  // Called when bounce rate is too high (>5%)
  onHighBounceRate: async ({ rate, threshold, recentBounces }) => {
    console.warn(`[ALERT] High bounce rate: ${(rate * 100).toFixed(1)}% (threshold: ${(threshold * 100)}%)`);
    
    // Log alert
    const alertData = {
      timestamp: new Date().toISOString(),
      type: 'high_bounce_alert',
      rate,
      threshold,
      recentBounces: recentBounces.length
    };
    
    const alertsFile = path.join(DATA_DIR, 'alerts.jsonl');
    fs.appendFileSync(alertsFile, JSON.stringify(alertData) + '\n');
    
    // TODO: Pause campaigns and notify
  }
};

// ============================================================================
// INITIALIZE WEBHOOK HANDLER
// ============================================================================

function getHandler() {
  return getWebhookHandler({
    webhookSecret: process.env.INSTANTLY_WEBHOOK_SECRET,
    dataDir: DATA_DIR,
    callbacks: webhookCallbacks
  });
}

// ============================================================================
// ROUTE SETUP
// ============================================================================

function setupWebhookRoutes(app) {
  const handler = getHandler();
  
  // Main webhook endpoint - uses the new lib module
  app.post('/api/webhooks/instantly', handler.middleware());
  
  // Also support legacy path
  app.post('/api/webhook/instantly', handler.middleware());
  
  // Health check
  app.get('/api/webhooks/health', (req, res) => {
    const stats = handler.getStats();
    const metrics = getMetricsTracker();
    
    res.json({
      status: 'healthy',
      service: 'instantly-webhooks-v2',
      version: '2.0.0',
      stats,
      counters: metrics.getAllCounters(),
      timestamp: new Date().toISOString()
    });
  });
  
  // Recent events (backward compatible)
  app.get('/api/webhooks/events', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const type = req.query.type;
      
      if (!fs.existsSync(EVENTS_FILE)) {
        return res.json({ events: [], count: 0 });
      }
      
      const content = fs.readFileSync(EVENTS_FILE, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      let events = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);
      
      // Filter by type if specified
      if (type) {
        events = events.filter(e => e.type === type || e.event_type === type);
      }
      
      // Return most recent first
      events = events.slice(-limit).reverse();
      
      res.json({
        events,
        count: events.length,
        total: lines.length
      });
      
    } catch (error) {
      console.error('[Events] Error:', error);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });
  
  // Metrics endpoint
  app.get('/api/webhooks/metrics', (req, res) => {
    try {
      const metrics = getMetricsTracker();
      const counters = metrics.getAllCounters();
      const dashboard = metrics.getDashboardData();
      
      // Also include legacy metrics if they exist
      let legacyMetrics = {};
      if (fs.existsSync(METRICS_FILE)) {
        try {
          legacyMetrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
        } catch {}
      }
      
      res.json({
        current: counters,
        dashboard,
        legacy: legacyMetrics,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('[Metrics] Error:', error);
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  });
  
  // Hot leads endpoint
  app.get('/api/webhooks/hot-leads', (req, res) => {
    try {
      const hotLeadsFile = path.join(DATA_DIR, 'hot-leads.jsonl');
      
      if (!fs.existsSync(hotLeadsFile)) {
        return res.json({ leads: [], count: 0 });
      }
      
      const content = fs.readFileSync(hotLeadsFile, 'utf-8');
      const leads = content.trim().split('\n').filter(Boolean).map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);
      
      res.json({
        leads: leads.reverse(),
        count: leads.length
      });
      
    } catch (error) {
      console.error('[Hot Leads] Error:', error);
      res.status(500).json({ error: 'Failed to fetch hot leads' });
    }
  });
  
  // Replies endpoint
  app.get('/api/webhooks/replies', (req, res) => {
    try {
      const repliesFile = path.join(DATA_DIR, 'replies.jsonl');
      
      if (!fs.existsSync(repliesFile)) {
        return res.json({ replies: [], count: 0 });
      }
      
      const content = fs.readFileSync(repliesFile, 'utf-8');
      const replies = content.trim().split('\n').filter(Boolean).map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);
      
      res.json({
        replies: replies.reverse(),
        count: replies.length
      });
      
    } catch (error) {
      console.error('[Replies] Error:', error);
      res.status(500).json({ error: 'Failed to fetch replies' });
    }
  });
  
  // Test webhook (development only)
  if (process.env.NODE_ENV !== 'production') {
    app.post('/api/webhooks/test', async (req, res) => {
      try {
        const testEvent = {
          event_type: req.body.event_type || 'email_opened',
          data: {
            lead_email: req.body.lead_email || 'test@example.com',
            campaign_id: req.body.campaign_id || 'test-campaign',
            timestamp: new Date().toISOString(),
            ...req.body.data
          }
        };
        
        const result = await handler.handleWebhook(testEvent, {});
        res.json({ test: true, event: testEvent, result });
        
      } catch (error) {
        console.error('[Test] Error:', error);
        res.status(500).json({ error: error.message });
      }
    });
  }
  
  console.log('[Webhooks v2] Routes configured with metrics integration');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  setupWebhookRoutes,
  getHandler,
  EVENT_TYPES
};
