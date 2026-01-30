// Client Notification System
// Notify clients via Telegram about hot leads and important events

const axios = require('axios');

// Load from environment
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send Telegram notification
 */
async function sendTelegramNotification(message, priority = 'normal') {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️  Telegram not configured (missing BOT_TOKEN or CHAT_ID)');
    return { success: false, error: 'Telegram not configured' };
  }
  
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
      disable_notification: priority !== 'urgent'
    });
    
    console.log('✓ Telegram notification sent');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Telegram error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Notify client about positive reply
 */
async function notifyPositiveReply(clientName, leadEmail, replyText, campaignName) {
  const message = `🎯 *HOT LEAD ALERT*\n\n` +
    `Client: ${clientName}\n` +
    `Campaign: ${campaignName}\n` +
    `Lead: ${leadEmail}\n\n` +
    `*Reply:*\n"${replyText.substring(0, 200)}${replyText.length > 200 ? '...' : ''}"\n\n` +
    `✅ Sentiment: Positive\n` +
    `Action: Follow up ASAP!`;
  
  return sendTelegramNotification(message, 'urgent');
}

/**
 * Notify client about meeting request
 */
async function notifyMeetingRequest(clientName, leadEmail, replyText, campaignName) {
  const message = `🔥 *MEETING REQUEST*\n\n` +
    `Client: ${clientName}\n` +
    `Campaign: ${campaignName}\n` +
    `Lead: ${leadEmail}\n\n` +
    `*They want to meet!*\n"${replyText.substring(0, 200)}${replyText.length > 200 ? '...' : ''}"\n\n` +
    `⏰ Action: Send calendar link NOW`;
  
  return sendTelegramNotification(message, 'urgent');
}

/**
 * Daily campaign summary
 */
async function sendDailySummary(clientName, stats) {
  const message = `📊 *Daily Summary: ${clientName}*\n\n` +
    `Emails sent: ${stats.sent}\n` +
    `Opens: ${stats.opens} (${stats.openRate}%)\n` +
    `Clicks: ${stats.clicks} (${stats.clickRate}%)\n` +
    `Replies: ${stats.replies} (${stats.replyRate}%)\n` +
    `  • Positive: ${stats.positiveReplies}\n` +
    `  • Neutral: ${stats.neutralReplies}\n` +
    `  • Negative: ${stats.negativeReplies}\n\n` +
    `Meetings booked: ${stats.meetings}\n\n` +
    `Keep crushing it! 🚀`;
  
  return sendTelegramNotification(message, 'normal');
}

/**
 * Campaign performance alert
 */
async function notifyPerformanceIssue(clientName, campaignName, issue) {
  const message = `⚠️ *Performance Alert*\n\n` +
    `Client: ${clientName}\n` +
    `Campaign: ${campaignName}\n\n` +
    `Issue: ${issue}\n\n` +
    `Recommendation: Review campaign settings`;
  
  return sendTelegramNotification(message, 'normal');
}

/**
 * New client onboarded
 */
async function notifyClientOnboarded(clientName, clientEmail) {
  const message = `🎉 *New Client Onboarded*\n\n` +
    `Name: ${clientName}\n` +
    `Email: ${clientEmail}\n\n` +
    `Caesar's Legions marches forward! 🏛️`;
  
  return sendTelegramNotification(message, 'normal');
}

module.exports = {
  sendTelegramNotification,
  notifyPositiveReply,
  notifyMeetingRequest,
  sendDailySummary,
  notifyPerformanceIssue,
  notifyClientOnboarded
};
