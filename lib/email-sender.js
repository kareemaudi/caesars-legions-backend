const { smtpSender } = require('./smtp-sender');
require('dotenv').config();

/**
 * Send email via SMTP (direct sending, no Instantly.ai)
 * @param {Object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {string} params.body - Email body
 * @param {string} params.fromEmail - Sender email
 * @param {string} params.fromName - Sender name
 * @returns {Promise<Object>} - Send result
 */
async function sendEmail({ to, subject, body, fromEmail, fromName }) {
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
 */
async function sendBatch(emails) {
  return await smtpSender.sendBatch(emails);
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
