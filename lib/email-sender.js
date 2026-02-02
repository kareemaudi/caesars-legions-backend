const { smtpSender } = require('./smtp-sender');
const unsubscribeList = require('./unsubscribe-list');
require('dotenv').config();

/**
 * Send email via SMTP (direct sending, no Instantly.ai)
 * @param {Object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {string} params.body - Email body
 * @param {string} params.fromEmail - Sender email
 * @param {string} params.fromName - Sender name
 * @param {boolean} params.skipUnsubscribeCheck - Override unsubscribe check (use with caution)
 * @returns {Promise<Object>} - Send result
 */
async function sendEmail({ to, subject, body, fromEmail, fromName, skipUnsubscribeCheck = false }) {
  // Check global unsubscribe list (CAN-SPAM compliance)
  if (!skipUnsubscribeCheck && unsubscribeList.isUnsubscribed(to)) {
    console.log(`[Email Send] BLOCKED: ${to} is on global unsubscribe list`);
    return {
      success: false,
      error: 'Recipient is on global unsubscribe list',
      blocked: true,
      to
    };
  }
  
  return await smtpSender.sendEmail({
    to,
    subject,
    body,
    fromEmail,
    fromName: fromName || 'Caesar\'s Legions'
  });
}

/**
 * Batch send multiple emails
 * @param {Array} emails - Array of email objects
 * @param {boolean} filterUnsubscribed - Whether to filter out unsubscribed emails (default: true)
 * @returns {Promise<Object>} - { sent, blocked }
 */
async function sendBatch(emails, filterUnsubscribed = true) {
  if (!filterUnsubscribed) {
    return await smtpSender.sendBatch(emails);
  }
  
  // Filter out globally unsubscribed emails
  const filtered = unsubscribeList.filterUnsubscribed(
    emails.map(e => ({ email: e.to, ...e }))
  );
  
  if (filtered.blocked.length > 0) {
    console.log(`[Email Send] Filtered ${filtered.blocked.length} unsubscribed emails from batch`);
  }
  
  // Send only allowed emails
  const allowedEmails = filtered.allowed.map(lead => {
    const { email, ...rest } = lead;
    return { to: email, ...rest };
  });
  
  const result = await smtpSender.sendBatch(allowedEmails);
  
  return {
    ...result,
    blockedByUnsubscribe: filtered.blocked.map(b => b.email)
  };
}

/**
 * Check email deliverability
 */
async function verifyEmail(email) {
  // Simple regex validation for now
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = {
  sendEmail,
  sendBatch,
  verifyEmail
};
