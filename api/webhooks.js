// ============================================================================
// INSTANTLY WEBHOOK HANDLER - Caesar's Legions
// ============================================================================
// Purpose: Handle Instantly.ai webhook events (opens, clicks, replies, etc.)
// Events: email_opened, email_clicked, email_replied, email_bounced, 
//         email_unsubscribed, lead_interested, lead_not_interested
// Status: Production Ready
// ============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Event storage paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'webhook-events.jsonl');
const METRICS_FILE = path.join(__dirname, 'metrics.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================================
// EVENT TYPES & HANDLERS
// ============================================================================

const EVENT_HANDLERS = {
  // Email was opened
  'email_opened': async (payload) => {
    const event = normalizeEvent('open', payload);
    await storeEvent(event);
    await updateMetrics('opens', 1);
    
    // Trigger: Consider moving to "warm" status
    if (event.openCount >= 3) {
      await flagAsWarmLead(event.leadEmail);
    }
    
    return { action: 'recorded', warmLead: event.openCount >= 3 };
  },

  // Link was clicked
  'email_clicked': async (payload) => {
    const event = normalizeEvent('click', payload);
    await storeEvent(event);
    await updateMetrics('clicks', 1);
    
    // Trigger: High intent - mark as hot lead
    await flagAsHotLead(event.leadEmail, 'clicked_link');
    
    return { action: 'recorded', hotLead: true, url: event.clickedUrl };
  },

  // Lead replied to email
  'email_replied': async (payload) => {
    const event = normalizeEvent('reply', payload);
    await storeEvent(event);
    await updateMetrics('replies', 1);
    
    // Trigger: Stop follow-up sequence
    await pauseSequenceForLead(event.leadEmail, 'replied');
    
    // Trigger: Sentiment analysis on reply
    const sentiment = await analyzeReplySentiment(event.replyBody);
    event.sentiment = sentiment;
    
    // Alert if positive reply
    if (sentiment.score > 0.5) {
      await notifyPositiveReply(event);
    }
    
    return { action: 'recorded', sequencePaused: true, sentiment };
  },

  // Email bounced
  'email_bounced': async (payload) => {
    const event = normalizeEvent('bounce', payload);
    await storeEvent(event);
    await updateMetrics('bounces', 1);
    
    // Trigger: Mark lead as invalid
    await markLeadInvalid(event.leadEmail, event.bounceType);
    
    return { action: 'recorded', leadInvalidated: true };
  },

  // Lead unsubscribed
  'email_unsubscribed': async (payload) => {
    const event = normalizeEvent('unsubscribe', payload);
    await storeEvent(event);
    await updateMetrics('unsubscribes', 1);
    
    // Trigger: Stop all sequences, add to suppression list
    await pauseSequenceForLead(event.leadEmail, 'unsubscribed');
    await addToSuppressionList(event.leadEmail);
    
    return { action: 'recorded', suppressed: true };
  },

  // Lead marked interested (manual or auto)
  'lead_interested': async (payload) => {
    const event = normalizeEvent('interested', payload);
    await storeEvent(event);
    await updateMetrics('interested', 1);
    
    // Trigger: Move to CRM pipeline, notify team
    await moveToPipeline(event.leadEmail, 'interested');
    await notifyHotLead(event);
    
    return { action: 'recorded', pipeline: 'interested' };
  },

  // Lead marked not interested
  'lead_not_interested': async (payload) => {
    const event = normalizeEvent('not_interested', payload);
    await storeEvent(event);
    await updateMetrics('not_interested', 1);
    
    // Trigger: Stop sequences, log reason
    await pauseSequenceForLead(event.leadEmail, 'not_interested');
    
    return { action: 'recorded', sequencePaused: true };
  }
};

// ============================================================================
// EVENT NORMALIZATION
// ============================================================================

function normalizeEvent(type, payload) {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    
    // Lead info
    leadEmail: payload.lead_email || payload.email || payload.to,
    leadName: payload.lead_name || payload.name || null,
    leadCompany: payload.company || null,
    
    // Campaign info
    campaignId: payload.campaign_id || payload.campaignId || null,
    campaignName: payload.campaign_name || payload.campaignName || null,
    sequenceStep: payload.sequence_step || payload.step || null,
    
    // Event-specific data
    emailSubject: payload.subject || null,
    openCount: payload.open_count || payload.openCount || 1,
    clickedUrl: payload.clicked_url || payload.url || null,
    replyBody: payload.reply_body || payload.body || null,
    bounceType: payload.bounce_type || payload.bounceType || 'unknown',
    
    // Metadata
    ipAddress: payload.ip || null,
    userAgent: payload.user_agent || payload.userAgent || null,
    location: payload.location || null,
    
    // Raw payload for debugging
    _raw: payload
  };
}

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

async function storeEvent(event) {
  const line = JSON.stringify(event) + '\n';
  fs.appendFileSync(EVENTS_FILE, line);
  return event.id;
}

async function updateMetrics(field, increment = 1) {
  let metrics = {};
  
  try {
    if (fs.existsSync(METRICS_FILE)) {
      metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
    }
  } catch (e) {
    metrics = {};
  }
  
  // Initialize structure if needed
  if (!metrics.webhooks) {
    metrics.webhooks = {
      opens: 0,
      clicks: 0,
      replies: 0,
      bounces: 0,
      unsubscribes: 0,
      interested: 0,
      not_interested: 0,
      lastUpdated: null
    };
  }
  
  metrics.webhooks[field] = (metrics.webhooks[field] || 0) + increment;
  metrics.webhooks.lastUpdated = new Date().toISOString();
  
  fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
  return metrics;
}

// ============================================================================
// TRIGGER ACTIONS
// ============================================================================

async function flagAsWarmLead(email) {
  const leadFile = path.join(DATA_DIR, 'warm-leads.jsonl');
  const entry = { email, flaggedAt: new Date().toISOString(), reason: 'multiple_opens' };
  fs.appendFileSync(leadFile, JSON.stringify(entry) + '\n');
  console.log(`[WARM LEAD] ${email} opened 3+ times`);
}

async function flagAsHotLead(email, reason) {
  const leadFile = path.join(DATA_DIR, 'hot-leads.jsonl');
  const entry = { email, flaggedAt: new Date().toISOString(), reason };
  fs.appendFileSync(leadFile, JSON.stringify(entry) + '\n');
  console.log(`[HOT LEAD] ${email} - ${reason}`);
}

async function pauseSequenceForLead(email, reason) {
  const pauseFile = path.join(DATA_DIR, 'paused-sequences.jsonl');
  const entry = { email, pausedAt: new Date().toISOString(), reason };
  fs.appendFileSync(pauseFile, JSON.stringify(entry) + '\n');
  console.log(`[SEQUENCE PAUSED] ${email} - ${reason}`);
}

async function markLeadInvalid(email, bounceType) {
  const invalidFile = path.join(DATA_DIR, 'invalid-leads.jsonl');
  const entry = { email, invalidatedAt: new Date().toISOString(), reason: `bounce_${bounceType}` };
  fs.appendFileSync(invalidFile, JSON.stringify(entry) + '\n');
  console.log(`[INVALID LEAD] ${email} - bounced (${bounceType})`);
}

async function addToSuppressionList(email) {
  const suppressionFile = path.join(DATA_DIR, 'suppression-list.jsonl');
  const entry = { email, addedAt: new Date().toISOString(), reason: 'unsubscribed' };
  fs.appendFileSync(suppressionFile, JSON.stringify(entry) + '\n');
  console.log(`[SUPPRESSED] ${email} added to suppression list`);
}

async function moveToPipeline(email, stage) {
  const pipelineFile = path.join(DATA_DIR, 'pipeline.jsonl');
  const entry = { email, stage, movedAt: new Date().toISOString() };
  fs.appendFileSync(pipelineFile, JSON.stringify(entry) + '\n');
  console.log(`[PIPELINE] ${email} moved to ${stage}`);
}

// ============================================================================
// NOTIFICATION FUNCTIONS
// ============================================================================

async function notifyPositiveReply(event) {
  // Log for now - integrate with Telegram notifier later
  const notificationFile = path.join(DATA_DIR, 'notifications.jsonl');
  const notification = {
    type: 'positive_reply',
    priority: 'high',
    lead: event.leadEmail,
    campaign: event.campaignName,
    sentiment: event.sentiment,
    timestamp: new Date().toISOString(),
    message: `🔥 Positive reply from ${event.leadEmail}! Sentiment: ${event.sentiment?.label}`
  };
  fs.appendFileSync(notificationFile, JSON.stringify(notification) + '\n');
  console.log(`[ALERT] ${notification.message}`);
  
  // TODO: Integrate with telegram-notifier.js
  // await sendTelegramMessage(notification.message, 'urgent');
}

async function notifyHotLead(event) {
  const notificationFile = path.join(DATA_DIR, 'notifications.jsonl');
  const notification = {
    type: 'hot_lead',
    priority: 'high',
    lead: event.leadEmail,
    campaign: event.campaignName,
    timestamp: new Date().toISOString(),
    message: `🔥 Hot lead: ${event.leadEmail} marked as interested!`
  };
  fs.appendFileSync(notificationFile, JSON.stringify(notification) + '\n');
  console.log(`[ALERT] ${notification.message}`);
}

// ============================================================================
// SENTIMENT ANALYSIS (Basic implementation)
// ============================================================================

async function analyzeReplySentiment(replyBody) {
  if (!replyBody) {
    return { score: 0, label: 'neutral', confidence: 0 };
  }
  
  const text = replyBody.toLowerCase();
  
  // Positive signals
  const positivePatterns = [
    /yes/i, /interested/i, /let'?s\s+(talk|chat|meet|schedule)/i,
    /sounds?\s+good/i, /tell\s+me\s+more/i, /love\s+to/i, /please\s+send/i,
    /great/i, /perfect/i, /when\s+(can|are)\s+(you|we)/i, /book\s+a?\s*(time|call|meeting)/i,
    /free\s+(this|next)/i, /available/i, /calendly/i, /schedule/i
  ];
  
  // Negative signals
  const negativePatterns = [
    /not\s+interested/i, /no\s+thanks/i, /unsubscribe/i, /remove\s+me/i,
    /stop\s+(emailing|contacting)/i, /don'?t\s+contact/i, /not\s+a\s+fit/i,
    /not\s+right\s+now/i, /maybe\s+later/i, /wrong\s+(person|company)/i,
    /not\s+the\s+(right|decision)/i, /budget/i, /no\s+budget/i
  ];
  
  // Auto-reply signals (neutral/ignore)
  const autoReplyPatterns = [
    /out\s+of\s+(the\s+)?office/i, /on\s+vacation/i, /automatic\s+reply/i,
    /auto-?reply/i, /will\s+be\s+back/i, /away\s+from/i, /limited\s+access/i
  ];
  
  // Check for auto-reply first
  for (const pattern of autoReplyPatterns) {
    if (pattern.test(text)) {
      return { score: 0, label: 'auto_reply', confidence: 0.9 };
    }
  }
  
  // Score based on patterns
  let positiveScore = 0;
  let negativeScore = 0;
  
  for (const pattern of positivePatterns) {
    if (pattern.test(text)) positiveScore += 1;
  }
  
  for (const pattern of negativePatterns) {
    if (pattern.test(text)) negativeScore += 1;
  }
  
  // Calculate final score (-1 to 1)
  const totalMatches = positiveScore + negativeScore;
  if (totalMatches === 0) {
    return { score: 0, label: 'neutral', confidence: 0.3 };
  }
  
  const score = (positiveScore - negativeScore) / Math.max(positiveScore, negativeScore, 1);
  const confidence = Math.min(totalMatches / 5, 1); // Cap at 1.0
  
  let label = 'neutral';
  if (score > 0.3) label = 'positive';
  else if (score < -0.3) label = 'negative';
  
  return { 
    score: parseFloat(score.toFixed(2)), 
    label, 
    confidence: parseFloat(confidence.toFixed(2)),
    positiveSignals: positiveScore,
    negativeSignals: negativeScore
  };
}

// ============================================================================
// MAIN WEBHOOK HANDLER
// ============================================================================

/**
 * Process incoming webhook from Instantly.ai
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleInstantlyWebhook(req, res) {
  try {
    const { event_type, ...payload } = req.body;
    
    // Validate event type
    if (!event_type || !EVENT_HANDLERS[event_type]) {
      console.warn(`[WEBHOOK] Unknown event type: ${event_type}`);
      return res.status(400).json({ 
        error: 'Unknown event type', 
        received: event_type,
        supported: Object.keys(EVENT_HANDLERS)
      });
    }
    
    // Log incoming webhook
    console.log(`[WEBHOOK] Received ${event_type} for ${payload.lead_email || 'unknown'}`);
    
    // Process event
    const result = await EVENT_HANDLERS[event_type](payload);
    
    return res.status(200).json({ 
      success: true, 
      event_type,
      ...result 
    });
    
  } catch (error) {
    console.error('[WEBHOOK] Error processing webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
}

/**
 * Verify webhook signature (if Instantly provides one)
 * 
 * @param {string} signature - Webhook signature from header
 * @param {string} payload - Raw request body
 * @param {string} secret - Webhook secret
 */
function verifyWebhookSignature(signature, payload, secret) {
  if (!signature || !secret) return true; // Skip if not configured
  
  const hmac = crypto.createHmac('sha256', secret);
  const expectedSignature = hmac.update(payload).digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ============================================================================
// EXPRESS ROUTER SETUP
// ============================================================================

function setupWebhookRoutes(app) {
  // Main Instantly webhook endpoint
  app.post('/api/webhooks/instantly', handleInstantlyWebhook);
  
  // Health check
  app.get('/api/webhooks/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      service: 'Caesar\'s Legions Webhook Handler',
      supportedEvents: Object.keys(EVENT_HANDLERS),
      timestamp: new Date().toISOString()
    });
  });
  
  // Get recent events (for debugging/dashboard)
  app.get('/api/webhooks/events', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const type = req.query.type || null;
      
      if (!fs.existsSync(EVENTS_FILE)) {
        return res.json({ events: [], count: 0 });
      }
      
      const lines = fs.readFileSync(EVENTS_FILE, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
      
      let events = type 
        ? lines.filter(e => e.type === type)
        : lines;
      
      events = events.slice(-limit).reverse(); // Most recent first
      
      res.json({ events, count: events.length, total: lines.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get metrics summary
  app.get('/api/webhooks/metrics', (req, res) => {
    try {
      if (!fs.existsSync(METRICS_FILE)) {
        return res.json({ webhooks: null, message: 'No metrics yet' });
      }
      const metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  console.log('[WEBHOOK] Routes configured:');
  console.log('  POST /api/webhooks/instantly - Main webhook endpoint');
  console.log('  GET  /api/webhooks/health - Health check');
  console.log('  GET  /api/webhooks/events - Recent events');
  console.log('  GET  /api/webhooks/metrics - Metrics summary');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  handleInstantlyWebhook,
  setupWebhookRoutes,
  verifyWebhookSignature,
  analyzeReplySentiment,
  EVENT_HANDLERS,
  
  // For testing
  normalizeEvent,
  storeEvent,
  updateMetrics
};
