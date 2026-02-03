// Direct SMTP Email Sender (No Instantly.ai dependency)
// Uses nodemailer for direct SMTP sending

const nodemailer = require('nodemailer');
const { addUnsubscribeLink, isUnsubscribed } = require('./unsubscribe');
require('dotenv').config();

class SMTPSender {
  constructor() {
    this.transporter = null;
    this.dailySent = 0;
    this.maxPerDay = 50;
    this.lastResetDate = new Date().toISOString().split('T')[0];
  }

  /**
   * Initialize SMTP transport
   */
  async init() {
    if (this.transporter) return;

    const config = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };

    if (!config.auth.user || !config.auth.pass) {
      console.warn('⚠️  SMTP credentials not set. Emails will not be sent.');
      return false;
    }

    this.transporter = nodemailer.createTransport(config);

    // Verify connection
    try {
      await this.transporter.verify();
      console.log('✓ SMTP connection verified');
      return true;
    } catch (error) {
      console.error('❌ SMTP connection failed:', error.message);
      this.transporter = null;
      return false;
    }
  }

  /**
   * Send email via SMTP
   */
  async sendEmail({ to, subject, body, fromEmail, fromName }) {
    // Check unsubscribe list
    if (isUnsubscribed(to)) {
      return {
        success: false,
        error: 'Recipient is unsubscribed',
        to
      };
    }

    // Check daily limit
    this.resetIfNewDay();
    if (this.dailySent >= this.maxPerDay) {
      return {
        success: false,
        error: `Daily limit reached (${this.maxPerDay})`,
        to
      };
    }

    // Initialize if needed
    if (!this.transporter) {
      const initialized = await this.init();
      if (!initialized) {
        return {
          success: false,
          error: 'SMTP not configured',
          to
        };
      }
    }

    // Add unsubscribe link
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const bodyWithUnsubscribe = addUnsubscribeLink(body, to, baseUrl);

    // Add physical address (CAN-SPAM requirement)
    const physicalAddress = process.env.PHYSICAL_ADDRESS || '123 Business St, City, State, ZIP';
    const bodyWithFooter = `${bodyWithUnsubscribe}\n\n---\n\n${physicalAddress}`;

    // Create professional HTML email
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .content { margin-bottom: 30px; }
    .footer { border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; font-size: 12px; color: #666; }
    .unsubscribe { color: #999; }
    .unsubscribe a { color: #666; }
    .address { margin-top: 10px; color: #999; }
  </style>
</head>
<body>
  <div class="content">
    ${body.replace(/\n/g, '<br>')}
  </div>
  <div class="footer">
    <p class="unsubscribe">Don't want these emails? <a href="${baseUrl}/unsubscribe?email=${encodeURIComponent(to)}&token=${require('crypto').createHash('md5').update(to + 'caesar-secret').digest('hex').slice(0, 16)}">Unsubscribe</a></p>
    <p class="address">${physicalAddress}</p>
  </div>
</body>
</html>`;

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName || 'Caesar\'s Legions'}" <${fromEmail || process.env.SMTP_USER}>`,
        to,
        subject,
        text: bodyWithFooter,
        html: htmlBody
      });

      this.dailySent++;

      console.log(`✓ Email sent to ${to}`);

      return {
        success: true,
        messageId: info.messageId,
        to
      };
    } catch (error) {
      console.error(`✗ Email failed to ${to}:`, error.message);
      return {
        success: false,
        error: error.message,
        to
      };
    }
  }

  /**
   * Send batch of emails with rate limiting
   */
  async sendBatch(emails) {
    const results = [];

    for (const email of emails) {
      const result = await this.sendEmail(email);
      results.push(result);

      // Rate limiting: 1 email per second
      if (results.length < emails.length) {
        await this.sleep(1000);
      }

      // Stop if daily limit reached
      if (this.dailySent >= this.maxPerDay) {
        console.log(`⚠️  Daily limit reached. Stopping batch send.`);
        break;
      }
    }

    return results;
  }

  /**
   * Get remaining sends for today
   */
  getRemainingToday() {
    this.resetIfNewDay();
    return Math.max(0, this.maxPerDay - this.dailySent);
  }

  /**
   * Reset daily count if new day
   */
  resetIfNewDay() {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.dailySent = 0;
      this.lastResetDate = today;
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
const smtpSender = new SMTPSender();

module.exports = {
  SMTPSender,
  smtpSender
};
