const crypto = require('crypto');
require('dotenv').config();

/**
 * Instantly.ai Webhook Handler
 * 
 * Handles events from Instantly.ai (email opens, clicks, replies, bounces)
 * Updates campaign_emails table with engagement data
 * Triggers alerts for high-priority events (replies, out-of-office)
 * 
 * Events supported:
 * - email.opened
 * - email.clicked
 * - email.replied
 * - email.bounced
 * - email.unsubscribed
 * - email.out_of_office
 */

/**
 * Verify webhook signature (security)
 * Instantly.ai signs webhooks with HMAC-SHA256
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!secret) {
    console.warn('[Webhook] No INSTANTLY_WEBHOOK_SECRET set - skipping signature verification');
    return true; // Allow in development
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Process webhook event and update database
 * @param {Object} event - Webhook payload from Instantly.ai
 * @param {Object} db - Database connection
 * @returns {Promise<Object>} - Processing result
 */
async function processWebhook(event, db) {
  const { type, data, timestamp } = event;

  console.log(`[Webhook] Received: ${type} at ${new Date(timestamp).toISOString()}`);

  // Map Instantly event types to our database events
  const eventTypeMap = {
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.replied': 'replied',
    'email.bounced': 'bounced',
    'email.unsubscribed': 'unsubscribed',
    'email.out_of_office': 'out_of_office'
  };

  const dbEventType = eventTypeMap[type];
  if (!dbEventType) {
    console.warn(`[Webhook] Unknown event type: ${type}`);
    return { status: 'ignored', reason: 'unknown_event_type' };
  }

  // Extract email identifier (Instantly provides message_id or email address)
  const { message_id, email_address, campaign_id } = data;

  if (!message_id && !email_address) {
    console.error('[Webhook] Missing message_id and email_address');
    return { status: 'error', reason: 'missing_identifier' };
  }

  try {
    // Find the email in our database
    // Match by message_id (if available) or by recipient email + campaign
    let emailRecord;
    
    if (message_id) {
      emailRecord = await db.get(
        'SELECT * FROM campaign_emails WHERE message_id = ?',
        [message_id]
      );
    }

    if (!emailRecord && email_address && campaign_id) {
      emailRecord = await db.get(
        'SELECT * FROM campaign_emails WHERE recipient_email = ? AND campaign_id = ? ORDER BY created_at DESC LIMIT 1',
        [email_address, campaign_id]
      );
    }

    if (!emailRecord) {
      console.warn(`[Webhook] Email not found: message_id=${message_id}, email=${email_address}`);
      return { status: 'ignored', reason: 'email_not_found' };
    }

    // Update email record with event
    const updateField = `${dbEventType}_at`;
    const currentTime = new Date().toISOString();

    await db.run(
      `UPDATE campaign_emails 
       SET ${updateField} = ?, 
           status = ?,
           updated_at = ?
       WHERE id = ?`,
      [currentTime, dbEventType, currentTime, emailRecord.id]
    );

    console.log(`[Webhook] ✓ Updated email ${emailRecord.id}: ${dbEventType}`);

    // Handle special events
    const alerts = [];

    if (type === 'email.replied') {
      alerts.push({
        type: 'reply',
        priority: 'high',
        email_id: emailRecord.id,
        recipient: emailRecord.recipient_email,
        campaign: emailRecord.campaign_id,
        message: `🎯 Reply received from ${emailRecord.recipient_name || emailRecord.recipient_email}!`,
        action: 'Check inbox and respond within 1 hour'
      });
    }

    if (type === 'email.out_of_office') {
      alerts.push({
        type: 'ooo',
        priority: 'low',
        email_id: emailRecord.id,
        recipient: emailRecord.recipient_email,
        message: `📅 Out of office: ${emailRecord.recipient_email}`,
        action: 'Schedule follow-up for +7 days'
      });
    }

    if (type === 'email.bounced') {
      alerts.push({
        type: 'bounce',
        priority: 'medium',
        email_id: emailRecord.id,
        recipient: emailRecord.recipient_email,
        message: `⚠️ Bounce: ${emailRecord.recipient_email}`,
        action: 'Verify email address, mark as invalid'
      });
    }

    // Update campaign stats (aggregate)
    await updateCampaignStats(db, emailRecord.campaign_id);

    return {
      status: 'success',
      event_type: dbEventType,
      email_id: emailRecord.id,
      alerts: alerts.length > 0 ? alerts : null
    };

  } catch (error) {
    console.error('[Webhook] Processing error:', error);
    return {
      status: 'error',
      reason: error.message
    };
  }
}

/**
 * Update campaign aggregate stats
 * Recalculates open rate, click rate, reply rate
 */
async function updateCampaignStats(db, campaignId) {
  const stats = await db.get(`
    SELECT 
      COUNT(*) as total_sent,
      COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as total_opened,
      COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as total_clicked,
      COUNT(CASE WHEN replied_at IS NOT NULL THEN 1 END) as total_replied,
      COUNT(CASE WHEN bounced_at IS NOT NULL THEN 1 END) as total_bounced
    FROM campaign_emails
    WHERE campaign_id = ?
  `, [campaignId]);

  const openRate = stats.total_sent > 0 ? (stats.total_opened / stats.total_sent * 100).toFixed(2) : 0;
  const clickRate = stats.total_sent > 0 ? (stats.total_clicked / stats.total_sent * 100).toFixed(2) : 0;
  const replyRate = stats.total_sent > 0 ? (stats.total_replied / stats.total_sent * 100).toFixed(2) : 0;
  const bounceRate = stats.total_sent > 0 ? (stats.total_bounced / stats.total_sent * 100).toFixed(2) : 0;

  await db.run(`
    UPDATE campaigns
    SET 
      emails_sent = ?,
      emails_opened = ?,
      emails_clicked = ?,
      emails_replied = ?,
      open_rate = ?,
      click_rate = ?,
      reply_rate = ?,
      updated_at = ?
    WHERE id = ?
  `, [
    stats.total_sent,
    stats.total_opened,
    stats.total_clicked,
    stats.total_replied,
    openRate,
    clickRate,
    replyRate,
    new Date().toISOString(),
    campaignId
  ]);

  console.log(`[Webhook] Updated campaign ${campaignId} stats: ${openRate}% open, ${replyRate}% reply`);
}

/**
 * Express middleware for handling Instantly.ai webhooks
 * Usage:
 *   app.post('/webhooks/instantly', express.json(), webhookMiddleware);
 */
function webhookMiddleware(req, res) {
  const signature = req.headers['x-instantly-signature'];
  const secret = process.env.INSTANTLY_WEBHOOK_SECRET;
  
  // Verify signature
  if (!verifyWebhookSignature(req.body, signature, secret)) {
    console.error('[Webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook asynchronously
  processWebhook(req.body, req.db)
    .then(result => {
      res.status(200).json(result);

      // Send alerts if needed
      if (result.alerts && result.alerts.length > 0) {
        result.alerts.forEach(alert => {
          console.log(`[Webhook Alert] ${alert.message}`);
          // TODO: Integrate with telegram-notifier.js
          // sendTelegramMessage(alert.message, alert.priority === 'high' ? 'urgent' : 'normal');
        });
      }
    })
    .catch(error => {
      console.error('[Webhook] Fatal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
}

/**
 * Batch process missed events
 * Useful for backfilling engagement data if webhook was down
 */
async function backfillEvents(db, events) {
  console.log(`[Webhook] Backfilling ${events.length} events...`);
  
  let processed = 0;
  let errors = 0;

  for (const event of events) {
    try {
      await processWebhook(event, db);
      processed++;
    } catch (error) {
      console.error(`[Webhook] Backfill error for event ${event.type}:`, error.message);
      errors++;
    }
  }

  console.log(`[Webhook] Backfill complete: ${processed} processed, ${errors} errors`);
  
  return { processed, errors };
}

/**
 * Get webhook status (for health checks)
 */
async function getWebhookStats(db) {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const stats = await db.get(`
    SELECT 
      COUNT(CASE WHEN opened_at > ? THEN 1 END) as opens_24h,
      COUNT(CASE WHEN clicked_at > ? THEN 1 END) as clicks_24h,
      COUNT(CASE WHEN replied_at > ? THEN 1 END) as replies_24h,
      COUNT(CASE WHEN bounced_at > ? THEN 1 END) as bounces_24h
    FROM campaign_emails
    WHERE updated_at > ?
  `, [last24h, last24h, last24h, last24h, last24h]);

  return {
    last_24h: stats,
    status: 'operational',
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  processWebhook,
  webhookMiddleware,
  verifyWebhookSignature,
  backfillEvents,
  getWebhookStats,
  updateCampaignStats
};
