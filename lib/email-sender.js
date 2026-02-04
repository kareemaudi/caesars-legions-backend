/**
 * Email Sender
 * Sends emails via Zoho SMTP
 * Integrated with MetricsTracker for real-time monitoring
 */

const nodemailer = require('nodemailer');
const { getMetricsTracker } = require('./metrics-tracker');

class EmailSender {
  constructor(options = {}) {
    // Support both ZOHO_* and SMTP_* env var formats
    const smtpUser = options.user || process.env.SMTP_USER || process.env.ZOHO_EMAIL;
    const smtpPass = options.pass || process.env.SMTP_PASS || process.env.ZOHO_PASSWORD;
    const smtpHost = options.host || process.env.SMTP_HOST || 'smtp.zoho.com';
    const smtpPort = options.port || parseInt(process.env.SMTP_PORT) || 465;
    
    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
    
    this.fromEmail = options.fromEmail || process.env.CAESAR_EMAIL || smtpUser;
    this.fromName = options.fromName || process.env.FROM_NAME || "Caesar";
    this.metrics = options.metrics || getMetricsTracker();
    this.clientId = options.clientId || null;
    this.campaignId = options.campaignId || null;
  }

  async send({ to, subject, body, replyTo, campaignId, clientId, templateId }) {
    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to,
      subject,
      text: body,
      html: this.textToHtml(body),
      replyTo: replyTo || this.fromEmail
    };

    const emailMeta = {
      campaignId: campaignId || this.campaignId,
      clientId: clientId || this.clientId,
      templateId,
      to,
      subject,
      body
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      
      // Track successful send
      this.metrics.trackEmailSent(emailMeta);
      
      return {
        success: true,
        messageId: result.messageId,
        to,
        subject
      };
    } catch (error) {
      // Track API error
      this.metrics.trackApiError({
        service: 'smtp',
        endpoint: 'sendMail',
        code: error.code || 'SMTP_ERROR',
        message: error.message,
        severity: 'error'
      });
      
      return {
        success: false,
        error: error.message,
        to,
        subject
      };
    }
  }

  async sendBatch(emails, delayMs = 30000, batchOptions = {}) {
    const results = [];
    const batchId = batchOptions.batchId || `batch_${Date.now()}`;
    
    console.log(`[EmailSender] Starting batch ${batchId}: ${emails.length} emails`);
    
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const result = await this.send({
        ...email,
        campaignId: email.campaignId || batchOptions.campaignId,
        clientId: email.clientId || batchOptions.clientId
      });
      results.push(result);
      
      // Progress logging every 10 emails
      if ((i + 1) % 10 === 0) {
        console.log(`[EmailSender] Batch ${batchId}: ${i + 1}/${emails.length} sent`);
      }
      
      // Rate limiting
      if (i < emails.length - 1) {
        await this.delay(delayMs);
      }
    }
    
    const summary = {
      batchId,
      total: emails.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
    
    console.log(`[EmailSender] Batch ${batchId} complete: ${summary.sent} sent, ${summary.failed} failed`);
    
    return summary;
  }

  textToHtml(text) {
    return text
      .split('\n\n')
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async verify() {
    try {
      await this.transporter.verify();
      return { success: true, message: 'SMTP connection verified' };
    } catch (error) {
      this.metrics.trackApiError({
        service: 'smtp',
        endpoint: 'verify',
        code: error.code || 'VERIFY_FAILED',
        message: error.message,
        severity: 'warning'
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Set campaign context for tracking
   * @param {string} campaignId 
   * @param {string} clientId 
   */
  setCampaignContext(campaignId, clientId) {
    this.campaignId = campaignId;
    this.clientId = clientId;
    return this;
  }

  /**
   * Get current metrics summary
   * @returns {Object} Current counters
   */
  getMetrics() {
    return this.metrics.getCounters();
  }

  /**
   * Flush metrics to disk (call before shutdown)
   */
  async flushMetrics() {
    return this.metrics.flush();
  }
}

module.exports = EmailSender;
