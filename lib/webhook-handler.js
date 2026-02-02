// Instantly.ai Webhook Handler
// Receives events for opens, clicks, replies, bounces

const express = require('express');
const db = require('./db');
const dbUpdates = require('./db-updates');
const tracking = require('./email-tracking');
const notifier = require('./client-notifier');
const unsubscribeList = require('./unsubscribe-list');

const router = express.Router();

/**
 * Webhook endpoint for Instantly.ai events
 * POST /webhooks/instantly
 */
router.post('/instantly', async (req, res) => {
  try {
    const event = req.body;
    
    console.log('[Webhook] Instantly event:', event.type);
    
    // Verify webhook signature (if Instantly provides one)
    // TODO: Add signature verification
    
    switch (event.type) {
      case 'email.opened':
        await handleEmailOpened(event);
        break;
      
      case 'email.clicked':
        await handleEmailClicked(event);
        break;
      
      case 'email.replied':
        await handleEmailReplied(event);
        break;
      
      case 'email.bounced':
        await handleEmailBounced(event);
        break;
      
      case 'email.unsubscribed':
        await handleUnsubscribed(event);
        break;
      
      default:
        console.log('[Webhook] Unknown event type:', event.type);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle email opened event
 */
async function handleEmailOpened(event) {
  const { email, campaign_id, opened_at } = event.data;
  
  // Find the email in our database
  const emailRecord = dbUpdates.findEmailByLeadAndCampaign(email, campaign_id);
  
  if (!emailRecord) {
    console.log('[Webhook] Email not found:', email);
    return;
  }
  
  // Update database
  const timestamp = opened_at ? Math.floor(new Date(opened_at).getTime() / 1000) : Math.floor(Date.now() / 1000);
  dbUpdates.updateEmailOpened(emailRecord.id, timestamp);
  
  console.log(`✓ Email opened: ${email}`);
}

/**
 * Handle email clicked event
 */
async function handleEmailClicked(event) {
  const { email, campaign_id, clicked_at, link } = event.data;
  
  const emailRecord = dbUpdates.findEmailByLeadAndCampaign(email, campaign_id);
  
  if (!emailRecord) return;
  
  const timestamp = clicked_at ? Math.floor(new Date(clicked_at).getTime() / 1000) : Math.floor(Date.now() / 1000);
  dbUpdates.updateEmailClicked(emailRecord.id, link, timestamp);
  
  console.log(`✓ Link clicked: ${email} → ${link}`);
}

/**
 * Handle email replied event
 */
async function handleEmailReplied(event) {
  const { email, campaign_id, replied_at, reply_text, reply_subject } = event.data;
  
  const emailRecord = dbUpdates.findEmailByLeadAndCampaign(email, campaign_id);
  
  if (!emailRecord) return;
  
  const timestamp = replied_at ? Math.floor(new Date(replied_at).getTime() / 1000) : Math.floor(Date.now() / 1000);
  
  // Use email-tracking module for sentiment analysis
  const sentiment = tracking.analyzeSentiment(reply_text);
  const hasMeetingIntent = tracking.checkForMeetingIntent(reply_text);
  
  // Create reply record
  dbUpdates.insertReply({
    email_sent_id: emailRecord.id,
    lead_id: emailRecord.lead_id,
    subject: reply_subject,
    body: reply_text,
    received_at: timestamp,
    sentiment,
    has_meeting_intent: hasMeetingIntent
  });
  
  // Update email record
  dbUpdates.updateEmailReplied(emailRecord.id, timestamp);
  
  console.log(`✓ Reply received: ${email} (${sentiment}${hasMeetingIntent ? ', wants meeting!' : ''})`);
  
  // Notify client if positive or meeting intent
  if (hasMeetingIntent) {
    // Meeting request - highest priority
    const client = db.getClient(emailRecord.client_id);
    const campaign = db.getCampaign(campaign_id);
    await notifier.notifyMeetingRequest(
      client.name,
      email,
      reply_text,
      campaign.name
    );
  } else if (sentiment === 'positive') {
    // Positive reply - notify client
    const client = db.getClient(emailRecord.client_id);
    const campaign = db.getCampaign(campaign_id);
    await notifier.notifyPositiveReply(
      client.name,
      email,
      reply_text,
      campaign.name
    );
  }
}

/**
 * Handle email bounced event
 */
async function handleEmailBounced(event) {
  const { email, campaign_id, bounced_at, bounce_type } = event.data;
  
  const emailRecord = dbUpdates.findEmailByLeadAndCampaign(email, campaign_id);
  
  if (!emailRecord) return;
  
  const timestamp = bounced_at ? Math.floor(new Date(bounced_at).getTime() / 1000) : Math.floor(Date.now() / 1000);
  
  console.log(`✓ Email bounced: ${email} (${bounce_type})`);
  
  // Update lead status
  db.updateLeadStatus(emailRecord.lead_id, 'bounced');
  
  // Update email record
  dbUpdates.updateEmailBounced(emailRecord.id, bounce_type, timestamp);
}

/**
 * Handle unsubscribe event
 */
async function handleUnsubscribed(event) {
  const { email, campaign_id, unsubscribed_at } = event.data;
  
  const emails = db.getRecentEmails(1, 10000);
  const emailRecord = emails.find(e => 
    e.lead_email === email && 
    e.campaign_id === campaign_id
  );
  
  if (!emailRecord) {
    // Even if we don't have a record, add to global unsubscribe list
    unsubscribeList.addToUnsubscribeList(email, {
      source: 'webhook_instantly',
      campaign_id,
      reason: 'user_unsubscribe'
    });
    console.log(`✓ Unsubscribed (no record found): ${email}`);
    return;
  }
  
  console.log(`✓ Unsubscribed: ${email}`);
  
  // Update lead status
  db.updateLeadStatus(emailRecord.lead_id, 'unsubscribed');
  
  // Add to global unsubscribe list (never email again across ALL campaigns)
  unsubscribeList.addToUnsubscribeList(email, {
    source: 'webhook_instantly',
    campaign_id,
    client_id: emailRecord.client_id,
    reason: 'user_unsubscribe'
  });
}

// Sentiment analysis moved to email-tracking.js module

/**
 * Test webhook endpoint
 * GET /webhooks/test
 */
router.get('/test', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Webhook handler is running',
    supported_events: [
      'email.opened',
      'email.clicked',
      'email.replied',
      'email.bounced',
      'email.unsubscribed'
    ]
  });
});

module.exports = router;
