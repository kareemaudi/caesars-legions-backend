// Email Tracking System
// Track opens, clicks, and replies for campaign analytics

const db = require('./db');
const notifier = require('./client-notifier');

/**
 * Record email open event
 * Triggered via tracking pixel in email
 */
function trackEmailOpen(leadId, emailId, clientId) {
  const timestamp = Math.floor(Date.now() / 1000);
  
  try {
    // Get email record
    const email = db.getEmailById(emailId);
    
    if (!email) {
      console.error(`Email ${emailId} not found`);
      return { success: false, error: 'Email not found' };
    }
    
    // Update email record with open
    db.updateEmail(emailId, {
      opened: true,
      opened_at: timestamp
    });
    
    // Log event
    db.insertEvent({
      type: 'email_open',
      lead_id: leadId,
      email_id: emailId,
      client_id: clientId,
      timestamp,
      metadata: JSON.stringify({
        first_open: !email.opened
      })
    });
    
    console.log(`✉️  Email opened: ${email.lead_email}`);
    
    return { success: true };
    
  } catch (error) {
    console.error('Error tracking open:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Record email click event
 * Triggered via wrapped links in email
 */
function trackEmailClick(leadId, emailId, clientId, linkUrl) {
  const timestamp = Math.floor(Date.now() / 1000);
  
  try {
    // Get email record
    const email = db.getEmailById(emailId);
    
    if (!email) {
      console.error(`Email ${emailId} not found`);
      return { success: false, error: 'Email not found' };
    }
    
    // Update email record
    db.updateEmail(emailId, {
      clicked: true,
      clicked_at: timestamp
    });
    
    // Log event
    db.insertEvent({
      type: 'email_click',
      lead_id: leadId,
      email_id: emailId,
      client_id: clientId,
      timestamp,
      metadata: JSON.stringify({
        link_url: linkUrl,
        first_click: !email.clicked
      })
    });
    
    console.log(`🔗 Link clicked: ${email.lead_email} → ${linkUrl}`);
    
    return { success: true, redirect_url: linkUrl };
    
  } catch (error) {
    console.error('Error tracking click:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Record email reply event
 * Triggered by inbox monitoring or webhook
 */
async function trackEmailReply(leadId, emailId, clientId, replyText) {
  const timestamp = Math.floor(Date.now() / 1000);
  
  try {
    // Get email record
    const email = db.getEmailById(emailId);
    
    if (!email) {
      console.error(`Email ${emailId} not found`);
      return { success: false, error: 'Email not found' };
    }
    
    // Update email record
    db.updateEmail(emailId, {
      replied: true,
      replied_at: timestamp,
      reply_text: replyText
    });
    
    // Analyze sentiment (basic)
    const sentiment = analyzeSentiment(replyText);
    
    // Log event
    db.insertEvent({
      type: 'email_reply',
      lead_id: leadId,
      email_id: emailId,
      client_id: clientId,
      timestamp,
      metadata: JSON.stringify({
        reply_length: replyText.length,
        sentiment,
        contains_meeting_words: checkForMeetingIntent(replyText)
      })
    });
    
    console.log(`💬 Reply received: ${email.lead_email}`);
    console.log(`   Sentiment: ${sentiment}`);
    
    // Notify client if positive reply
    if (sentiment === 'positive' || checkForMeetingIntent(replyText)) {
      await notifyClient(clientId, {
        type: 'positive_reply',
        lead_email: email.lead_email,
        reply_text: replyText,
        campaign_id: email.campaign_id
      });
    }
    
    return { success: true, sentiment };
    
  } catch (error) {
    console.error('Error tracking reply:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Basic sentiment analysis
 */
function analyzeSentiment(text) {
  const lowerText = text.toLowerCase();
  
  // Positive signals
  const positiveWords = ['yes', 'interested', 'sure', 'sounds good', 'let\'s talk', 'call', 'meeting', 'demo', 'schedule'];
  const hasPositive = positiveWords.some(word => lowerText.includes(word));
  
  // Negative signals
  const negativeWords = ['no', 'not interested', 'unsubscribe', 'remove', 'stop', 'spam'];
  const hasNegative = negativeWords.some(word => lowerText.includes(word));
  
  if (hasPositive && !hasNegative) return 'positive';
  if (hasNegative) return 'negative';
  return 'neutral';
}

/**
 * Check if reply contains meeting intent
 */
function checkForMeetingIntent(text) {
  const meetingWords = [
    'meeting', 'call', 'demo', 'schedule', 'calendar', 'available',
    'when can', 'book', 'zoom', 'phone', 'discuss'
  ];
  
  const lowerText = text.toLowerCase();
  return meetingWords.some(word => lowerText.includes(word));
}

/**
 * Notify client of important events
 * Sends Telegram notifications for hot leads and important replies
 */
async function notifyClient(clientId, notification) {
  try {
    // Get client details
    const client = db.getClient(clientId);
    if (!client) {
      console.warn(`Client ${clientId} not found`);
      return;
    }
    
    // Get campaign details (if available)
    let campaignName = 'Unknown Campaign';
    if (notification.campaign_id) {
      const campaign = db.getCampaign(notification.campaign_id);
      campaignName = campaign ? campaign.name : 'Unknown Campaign';
    }
    
    // Send appropriate notification based on type
    if (notification.type === 'positive_reply') {
      const hasMeetingIntent = checkForMeetingIntent(notification.reply_text);
      
      if (hasMeetingIntent) {
        // High priority - meeting request
        await notifier.notifyMeetingRequest(
          client.name,
          notification.lead_email,
          notification.reply_text,
          campaignName
        );
      } else {
        // Positive reply
        await notifier.notifyPositiveReply(
          client.name,
          notification.lead_email,
          notification.reply_text,
          campaignName
        );
      }
    }
    
    console.log(`✓ Notified client ${client.name} about ${notification.type}`);
    
  } catch (error) {
    console.error('Error sending notification:', error.message);
  }
}

/**
 * Generate tracking pixel URL
 */
function generateTrackingPixelUrl(leadId, emailId, clientId, baseUrl) {
  return `${baseUrl}/track/open?lead=${leadId}&email=${emailId}&client=${clientId}`;
}

/**
 * Generate tracked link URL
 */
function generateTrackedLinkUrl(leadId, emailId, clientId, targetUrl, baseUrl) {
  const encodedUrl = encodeURIComponent(targetUrl);
  return `${baseUrl}/track/click?lead=${leadId}&email=${emailId}&client=${clientId}&url=${encodedUrl}`;
}

module.exports = {
  trackEmailOpen,
  trackEmailClick,
  trackEmailReply,
  generateTrackingPixelUrl,
  generateTrackedLinkUrl,
  analyzeSentiment,
  checkForMeetingIntent
};
