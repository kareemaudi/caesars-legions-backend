/**
 * Email Sender
 * Sends emails via Zoho SMTP
 */

const nodemailer = require('nodemailer');

class EmailSender {
  constructor(options = {}) {
    this.transporter = nodemailer.createTransport({
      host: options.host || 'smtp.zoho.com',
      port: options.port || 465,
      secure: true,
      auth: {
        user: options.user || process.env.ZOHO_EMAIL,
        pass: options.pass || process.env.ZOHO_PASSWORD
      }
    });
    
    this.fromEmail = options.fromEmail || process.env.ZOHO_EMAIL;
    this.fromName = options.fromName || "Caesar";
  }

  async send({ to, subject, body, replyTo }) {
    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to,
      subject,
      text: body,
      html: this.textToHtml(body),
      replyTo: replyTo || this.fromEmail
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      return {
        success: true,
        messageId: result.messageId,
        to,
        subject
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        to,
        subject
      };
    }
  }

  async sendBatch(emails, delayMs = 30000) {
    const results = [];
    
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const result = await this.send(email);
      results.push(result);
      
      // Rate limiting
      if (i < emails.length - 1) {
        await this.delay(delayMs);
      }
    }
    
    return {
      total: emails.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
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
      return { success: false, error: error.message };
    }
  }
}

module.exports = EmailSender;
