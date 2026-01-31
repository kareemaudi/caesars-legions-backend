// Enhanced Instantly.ai Webhook Handler
// Production-ready with security, rate limiting, and comprehensive logging

const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const dbUpdates = require('./db-updates');
const tracking = require('./email-tracking');
const notifier = require('./client-notifier');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Configuration
const CONFIG = {
  WEBHOOK_SECRET: process.env.INSTANTLY_WEBHOOK_SECRET || null,
  ENABLE_SIGNATURE_VERIFICATION: process.env.INSTANTLY_VERIFY_SIGNATURE === 'true',
  MAX_REQUESTS_PER_MINUTE: 100,
  LOG_ALL_EVENTS: process.env.LOG_WEBHOOK_EVENTS === 'true',
  METRICS_FILE: path.join(__dirname, '../logs/webhook-metrics.jsonl')
};

// Rate limiting - simple in-memory store
const rateLimitStore = new Map();

/**
 * Rate limiter middleware
 */
function rateLimiter(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const key = `${ip}:${minute}`;
  
  const count = rateLimitStore.get(key) || 0;
  
  if (count >= CONFIG.MAX_REQUESTS_PER_MINUTE) {
    logMetric('rate_limit_exceeded', { ip });
    return res.status(429).json({ 
      error: 'Rate limit exceeded',
      retry_after: 60 - (Math.floor(now / 1000) % 60)
    });
  }
  
  rateLimitStore.set(key, count + 1);
  
  // Clean up old entries (keep last 2 minutes)
  for (const [k] of rateLimitStore) {
    const [, m] = k.split(':');
    if (parseInt(m) < minute - 1) {
      rateLimitStore.delete(k);
    }
  }
  
  next();
}

/**
 * Verify webhook signature (HMAC-SHA256)
 */
function verifySignature(req) {
  if (!CONFIG.ENABLE_SIGNATURE_VERIFICATION) {
    return true; // Skip verification if disabled
  }
  
  if (!CONFIG.WEBHOOK_SECRET) {
    console.warn('[Webhook] Signature verification enabled but no secret configured');
    return false;
  }
  
  const signature = req.headers['x-instantly-signature'];
  if (!signature) {
    return false;
  }
  
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', CONFIG.WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Validate webhook payload
 */
function validatePayload(event) {
  if (!event || typeof event !== 'object') {
    return { valid: false, error: 'Invalid payload format' };
  }
  
  if (!event.type) {
    return { valid: false, error: 'Missing event type' };
  }
  
  if (!event.data) {
    return { valid: false, error: 'Missing event data' };
  }
  
  // Type-specific validation
  const requiredFields = {
    'email.opened': ['email', 'campaign_id'],
    'email.clicked': ['email', 'campaign_id', 'link'],
    'email.replied': ['email', 'campaign_id', 'reply_text'],
    'email.bounced': ['email', 'campaign_id', 'bounce_type'],
    'email.unsubscribed': ['email', 'campaign_id']
  };
  
  const fields = requiredFields[event.type];
  if (fields) {
    for (const field of fields) {
      if (!event.data[field]) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }
  }
  
  return { valid: true };
}

/**
 * Log webhook metrics
 */
function logMetric(eventType, data = {}) {
  if (!CONFIG.LOG_ALL_EVENTS && eventType === 'webhook_received') {
    return; // Skip logging every webhook if not enabled
  }
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: eventType,
    ...data
  };
  
  try {
    const logDir = path.dirname(CONFIG.METRICS_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(
      CONFIG.METRICS_FILE,
      JSON.stringify(logEntry) + '\n'
    );
  } catch (error) {
    console.error('[Webhook] Failed to write metrics:', error.message);
  }
}

/**
 * Main webhook endpoint
 * POST /webhooks/instantly
 */
router.post('/instantly', rateLimiter, async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Verify signature
    if (!verifySignature(req)) {
      logMetric('signature_verification_failed', { ip: req.ip });
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const event = req.body;
    
    // Validate payload
    const validation = validatePayload(event);
    if (!validation.valid) {
      logMetric('invalid_payload', { error: validation.error });
      return res.status(400).json({ error: validation.error });
    }
    
    console.log(`[Webhook] ${event.type} - ${event.data.email || 'unknown'}`);
    
    logMetric('webhook_received', {
      type: event.type,
      email: event.data.email,
      campaign_id: event.data.campaign_id
    });
    
    // Route to appropriate handler
    let result;
    switch (event.type) {
      case 'email.opened':
        result = await handleEmailOpened(event);
        break;
      
      case 'email.clicked':
        result = await handleEmailClicked(event);
        break;
      
      case 'email.replied':
        result = await handleEmailReplied(event);
        break;
      
      case 'email.bounced':
        result = await handleEmailBounced(event);
        break;
      
      case 'email.unsubscribed':
        result = await handleUnsubscribed(event);
        break;
      
      default:
        logMetric('unknown_event_type', { type: event.type });
        return res.status(400).json({ error: 'Unknown event type' });
    }
    
    const duration = Date.now() - startTime;
    
    logMetric('webhook_processed', {
      type: event.type,
      duration_ms: duration,
      success: result.success
    });
    
    res.json({ 
      received: true,
      processed: result.success,
      duration_ms: duration
    });
    
  } catch (error) {
    console.error('[Webhook] Error:', error);
    
    logMetric('webhook_error', {
      error: error.message,
      stack: error.stack,
      duration_ms: Date.now() - startTime
    });
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * Handle email opened event
 */
async function handleEmailOpened(event) {
  try {
    const { email, campaign_id, opened_at } = event.data;
    
    const emailRecord = dbUpdates.findEmailByLeadAndCampaign(email, campaign_id);
    
    if (!emailRecord) {
      console.log(`[Webhook] Email not found: ${email} (campaign ${campaign_id})`);
      return { success: false, reason: 'email_not_found' };
    }
    
    // Skip if already marked as opened
    if (emailRecord.opened) {
      return { success: true, reason: 'already_opened' };
    }
    
    const timestamp = opened_at 
      ? Math.floor(new Date(opened_at).getTime() / 1000) 
      : Math.floor(Date.now() / 1000);
    
    dbUpdates.updateEmailOpened(emailRecord.id, timestamp);
    
    logMetric('email_opened', {
      email,
      campaign_id,
      lead_id: emailRecord.lead_id,
      time_to_open_hours: ((timestamp - emailRecord.sent_at) / 3600).toFixed(1)
    });
    
    return { success: true };
  } catch (error) {
    console.error('[handleEmailOpened] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle email clicked event
 */
async function handleEmailClicked(event) {
  try {
    const { email, campaign_id, clicked_at, link } = event.data;
    
    const emailRecord = dbUpdates.findEmailByLeadAndCampaign(email, campaign_id);
    
    if (!emailRecord) {
      return { success: false, reason: 'email_not_found' };
    }
    
    const timestamp = clicked_at 
      ? Math.floor(new Date(clicked_at).getTime() / 1000) 
      : Math.floor(Date.now() / 1000);
    
    dbUpdates.updateEmailClicked(emailRecord.id, link, timestamp);
    
    logMetric('email_clicked', {
      email,
      campaign_id,
      link,
      lead_id: emailRecord.lead_id
    });
    
    return { success: true };
  } catch (error) {
    console.error('[handleEmailClicked] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle email replied event
 */
async function handleEmailReplied(event) {
  try {
    const { email, campaign_id, replied_at, reply_text, reply_subject } = event.data;
    
    const emailRecord = dbUpdates.findEmailByLeadAndCampaign(email, campaign_id);
    
    if (!emailRecord) {
      return { success: false, reason: 'email_not_found' };
    }
    
    // Skip if already marked as replied
    if (emailRecord.replied) {
      return { success: true, reason: 'already_replied' };
    }
    
    const timestamp = replied_at 
      ? Math.floor(new Date(replied_at).getTime() / 1000) 
      : Math.floor(Date.now() / 1000);
    
    // Analyze sentiment and intent
    const sentiment = tracking.analyzeSentiment(reply_text);
    const hasMeetingIntent = tracking.checkForMeetingIntent(reply_text);
    
    // Create reply record
    dbUpdates.insertReply({
      email_sent_id: emailRecord.id,
      lead_id: emailRecord.lead_id,
      subject: reply_subject || 'Re: ' + emailRecord.subject,
      body: reply_text,
      received_at: timestamp,
      sentiment,
      has_meeting_intent: hasMeetingIntent
    });
    
    // Update email record
    dbUpdates.updateEmailReplied(emailRecord.id, timestamp);
    
    const timeToReply = ((timestamp - emailRecord.sent_at) / 3600).toFixed(1);
    
    console.log(`✓ Reply received: ${email} (${sentiment}${hasMeetingIntent ? ', MEETING REQUEST!' : ''})`);
    
    logMetric('email_replied', {
      email,
      campaign_id,
      sentiment,
      has_meeting_intent: hasMeetingIntent,
      time_to_reply_hours: timeToReply,
      reply_length: reply_text.length
    });
    
    // Send client notification
    const client = db.getClient(emailRecord.client_id);
    
    if (hasMeetingIntent) {
      await notifier.notifyMeetingRequest(
        client.name,
        email,
        reply_text,
        emailRecord.subject
      );
      
      logMetric('notification_sent', {
        type: 'meeting_request',
        client_id: client.id,
        email
      });
    } else if (sentiment === 'positive') {
      await notifier.notifyPositiveReply(
        client.name,
        email,
        reply_text,
        emailRecord.subject
      );
      
      logMetric('notification_sent', {
        type: 'positive_reply',
        client_id: client.id,
        email
      });
    }
    
    return { success: true, sentiment, has_meeting_intent: hasMeetingIntent };
  } catch (error) {
    console.error('[handleEmailReplied] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle email bounced event
 */
async function handleEmailBounced(event) {
  try {
    const { email, campaign_id, bounced_at, bounce_type } = event.data;
    
    const emailRecord = dbUpdates.findEmailByLeadAndCampaign(email, campaign_id);
    
    if (!emailRecord) {
      return { success: false, reason: 'email_not_found' };
    }
    
    const timestamp = bounced_at 
      ? Math.floor(new Date(bounced_at).getTime() / 1000) 
      : Math.floor(Date.now() / 1000);
    
    dbUpdates.updateEmailBounced(emailRecord.id, bounce_type, timestamp);
    
    // Update lead status
    db.updateLeadStatus(emailRecord.lead_id, 'bounced');
    
    logMetric('email_bounced', {
      email,
      campaign_id,
      bounce_type,
      lead_id: emailRecord.lead_id
    });
    
    console.log(`✓ Email bounced: ${email} (${bounce_type})`);
    
    return { success: true };
  } catch (error) {
    console.error('[handleEmailBounced] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle unsubscribe event
 */
async function handleUnsubscribed(event) {
  try {
    const { email, campaign_id, unsubscribed_at } = event.data;
    
    const emailRecord = dbUpdates.findEmailByLeadAndCampaign(email, campaign_id);
    
    if (!emailRecord) {
      return { success: false, reason: 'email_not_found' };
    }
    
    // Update lead status
    db.updateLeadStatus(emailRecord.lead_id, 'unsubscribed');
    
    logMetric('email_unsubscribed', {
      email,
      campaign_id,
      lead_id: emailRecord.lead_id
    });
    
    console.log(`✓ Unsubscribed: ${email}`);
    
    // TODO: Add to global unsubscribe list in production
    
    return { success: true };
  } catch (error) {
    console.error('[handleUnsubscribed] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  const stats = getWebhookStats();
  
  res.json({
    status: 'healthy',
    config: {
      signature_verification_enabled: CONFIG.ENABLE_SIGNATURE_VERIFICATION,
      rate_limit: CONFIG.MAX_REQUESTS_PER_MINUTE,
      logging_enabled: CONFIG.LOG_ALL_EVENTS
    },
    stats
  });
});

/**
 * Get webhook statistics
 */
function getWebhookStats() {
  try {
    if (!fs.existsSync(CONFIG.METRICS_FILE)) {
      return { total: 0 };
    }
    
    const lines = fs.readFileSync(CONFIG.METRICS_FILE, 'utf8').trim().split('\n');
    const events = lines.map(l => JSON.parse(l));
    
    const last24h = events.filter(e => {
      const eventTime = new Date(e.timestamp).getTime();
      const cutoff = Date.now() - (24 * 60 * 60 * 1000);
      return eventTime > cutoff;
    });
    
    const stats = {
      total: last24h.length,
      by_type: {},
      errors: 0,
      avg_duration_ms: 0
    };
    
    let totalDuration = 0;
    let durationCount = 0;
    
    for (const event of last24h) {
      if (event.event === 'webhook_received') {
        stats.by_type[event.type] = (stats.by_type[event.type] || 0) + 1;
      }
      
      if (event.event === 'webhook_error') {
        stats.errors++;
      }
      
      if (event.duration_ms) {
        totalDuration += event.duration_ms;
        durationCount++;
      }
    }
    
    stats.avg_duration_ms = durationCount > 0 
      ? Math.round(totalDuration / durationCount) 
      : 0;
    
    return stats;
  } catch (error) {
    console.error('[getWebhookStats] Error:', error);
    return { error: error.message };
  }
}

/**
 * Test endpoint
 */
router.get('/test', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Enhanced webhook handler is running',
    supported_events: [
      'email.opened',
      'email.clicked',
      'email.replied',
      'email.bounced',
      'email.unsubscribed'
    ],
    features: [
      'HMAC signature verification',
      'Rate limiting (100 req/min)',
      'Comprehensive logging',
      'Metrics tracking',
      'Error handling',
      'Duplicate detection'
    ]
  });
});

module.exports = router;
