// Enhanced SMTP Email Sender with:
// - Persistent daily limit tracking
// - Retry logic for transient failures
// - Structured logging
// - Detailed error categorization
// - Performance metrics

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { addUnsubscribeLink, isUnsubscribed } = require('./unsubscribe');
require('dotenv').config();

// State file for persistent tracking
const STATE_FILE = path.join(__dirname, '../data/smtp-state.json');

// Error categories for better debugging
const ErrorTypes = {
  AUTH: 'authentication_failed',
  NETWORK: 'network_error',
  RATE_LIMIT: 'rate_limit_exceeded',
  INVALID_EMAIL: 'invalid_recipient',
  UNSUBSCRIBED: 'recipient_unsubscribed',
  CONFIG: 'smtp_not_configured',
  DAILY_LIMIT: 'daily_limit_reached',
  UNKNOWN: 'unknown_error'
};

class EnhancedSMTPSender {
  constructor() {
    this.transporter = null;
    this.state = this.loadState();
    this.maxPerDay = parseInt(process.env.SMTP_MAX_PER_DAY || '50');
    this.retryAttempts = parseInt(process.env.SMTP_RETRY_ATTEMPTS || '3');
    this.retryDelayMs = parseInt(process.env.SMTP_RETRY_DELAY_MS || '5000');
    this.metrics = {
      totalSent: 0,
      totalFailed: 0,
      avgSendTimeMs: 0,
      errorsByType: {}
    };
  }

  /**
   * Load persistent state from disk
   */
  loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        
        // Reset if new day
        const today = new Date().toISOString().split('T')[0];
        if (data.date !== today) {
          return {
            date: today,
            dailySent: 0,
            lastSentAt: null
          };
        }
        
        return data;
      }
    } catch (error) {
      console.error('[SMTP] Error loading state:', error.message);
    }
    
    return {
      date: new Date().toISOString().split('T')[0],
      dailySent: 0,
      lastSentAt: null
    };
  }

  /**
   * Save state to disk
   */
  saveState() {
    try {
      const dir = path.dirname(STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error('[SMTP] Error saving state:', error.message);
    }
  }

  /**
   * Initialize SMTP transport with verification
   */
  async init() {
    if (this.transporter) return { success: true };

    const config = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };

    if (!config.auth.user || !config.auth.pass) {
      return {
        success: false,
        errorType: ErrorTypes.CONFIG,
        error: 'SMTP credentials not configured'
      };
    }

    this.transporter = nodemailer.createTransport(config);

    try {
      await this.transporter.verify();
      console.log('[SMTP] ✓ Connection verified');
      return { success: true };
    } catch (error) {
      console.error('[SMTP] ✗ Connection failed:', error.message);
      this.transporter = null;
      
      return {
        success: false,
        errorType: this.categorizeError(error),
        error: error.message
      };
    }
  }

  /**
   * Categorize error for better debugging
   */
  categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('auth') || message.includes('authentication')) {
      return ErrorTypes.AUTH;
    }
    if (message.includes('network') || message.includes('timeout') || message.includes('econnrefused')) {
      return ErrorTypes.NETWORK;
    }
    if (message.includes('rate limit') || message.includes('too many')) {
      return ErrorTypes.RATE_LIMIT;
    }
    if (message.includes('invalid') || message.includes('recipient')) {
      return ErrorTypes.INVALID_EMAIL;
    }
    
    return ErrorTypes.UNKNOWN;
  }

  /**
   * Check if we can send more emails today
   */
  canSendToday() {
    this.resetIfNewDay();
    return this.state.dailySent < this.maxPerDay;
  }

  /**
   * Get remaining sends for today
   */
  getRemainingToday() {
    this.resetIfNewDay();
    return Math.max(0, this.maxPerDay - this.state.dailySent);
  }

  /**
   * Reset daily count if new day
   */
  resetIfNewDay() {
    const today = new Date().toISOString().split('T')[0];
    if (this.state.date !== today) {
      this.state.date = today;
      this.state.dailySent = 0;
      this.state.lastSentAt = null;
      this.saveState();
    }
  }

  /**
   * Send email with retry logic
   */
  async sendEmail({ to, subject, body, fromEmail, fromName }, attempt = 1) {
    const startTime = Date.now();

    // Pre-flight checks
    const preflight = this.preflightCheck(to);
    if (!preflight.success) {
      return {
        success: false,
        errorType: preflight.errorType,
        error: preflight.error,
        to,
        attempt
      };
    }

    // Initialize if needed
    if (!this.transporter) {
      const init = await this.init();
      if (!init.success) {
        return {
          success: false,
          errorType: init.errorType,
          error: init.error,
          to,
          attempt
        };
      }
    }

    // Prepare email content
    const content = this.prepareEmailContent(body, to, fromEmail, fromName, subject);

    try {
      const info = await this.transporter.sendMail(content);
      
      // Update state
      this.state.dailySent++;
      this.state.lastSentAt = new Date().toISOString();
      this.saveState();
      
      // Track metrics
      const sendTimeMs = Date.now() - startTime;
      this.updateMetrics(true, sendTimeMs);
      
      this.log('success', { to, subject, messageId: info.messageId, sendTimeMs, attempt });
      
      return {
        success: true,
        messageId: info.messageId,
        to,
        sendTimeMs,
        attempt,
        remainingToday: this.getRemainingToday()
      };
      
    } catch (error) {
      const errorType = this.categorizeError(error);
      const sendTimeMs = Date.now() - startTime;
      
      // Retry logic for transient errors
      if (this.shouldRetry(errorType) && attempt < this.retryAttempts) {
        this.log('retry', { to, subject, error: error.message, attempt, nextAttempt: attempt + 1 });
        
        await this.sleep(this.retryDelayMs * attempt); // Exponential backoff
        return this.sendEmail({ to, subject, body, fromEmail, fromName }, attempt + 1);
      }
      
      // Track failure
      this.updateMetrics(false, sendTimeMs, errorType);
      this.log('error', { to, subject, error: error.message, errorType, attempt });
      
      return {
        success: false,
        errorType,
        error: error.message,
        to,
        attempt,
        sendTimeMs
      };
    }
  }

  /**
   * Pre-flight checks before sending
   */
  preflightCheck(to) {
    // Check unsubscribe list
    if (isUnsubscribed(to)) {
      return {
        success: false,
        errorType: ErrorTypes.UNSUBSCRIBED,
        error: 'Recipient is unsubscribed'
      };
    }

    // Check daily limit
    if (!this.canSendToday()) {
      return {
        success: false,
        errorType: ErrorTypes.DAILY_LIMIT,
        error: `Daily limit reached (${this.maxPerDay}). Remaining: 0`
      };
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return {
        success: false,
        errorType: ErrorTypes.INVALID_EMAIL,
        error: 'Invalid email format'
      };
    }

    return { success: true };
  }

  /**
   * Prepare email content with compliance additions
   */
  prepareEmailContent(body, to, fromEmail, fromName, subject) {
    // Add unsubscribe link
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const bodyWithUnsubscribe = addUnsubscribeLink(body, to, baseUrl);

    // Add physical address (CAN-SPAM requirement)
    const physicalAddress = process.env.PHYSICAL_ADDRESS || '123 Business St, City, State, ZIP';
    const bodyWithFooter = `${bodyWithUnsubscribe}\n\n---\n\n${physicalAddress}`;

    return {
      from: `"${fromName || 'Caesar\'s Legions'}" <${fromEmail || process.env.SMTP_USER}>`,
      to,
      subject,
      text: bodyWithFooter,
      html: bodyWithFooter.replace(/\n/g, '<br>')
    };
  }

  /**
   * Determine if error type should trigger retry
   */
  shouldRetry(errorType) {
    const retryableErrors = [
      ErrorTypes.NETWORK,
      ErrorTypes.RATE_LIMIT,
      ErrorTypes.UNKNOWN
    ];
    return retryableErrors.includes(errorType);
  }

  /**
   * Send batch of emails with intelligent rate limiting
   */
  async sendBatch(emails, options = {}) {
    const {
      delayBetweenMs = 1000,
      stopOnDailyLimit = true,
      returnPartialResults = true
    } = options;

    const results = {
      sent: [],
      failed: [],
      blocked: [],
      metrics: {
        totalAttempted: emails.length,
        successCount: 0,
        failureCount: 0,
        blockedCount: 0,
        avgSendTimeMs: 0
      }
    };

    let totalSendTime = 0;

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      
      // Check if we should continue
      if (stopOnDailyLimit && !this.canSendToday()) {
        this.log('info', { 
          message: 'Daily limit reached during batch send',
          processed: i,
          remaining: emails.length - i
        });
        break;
      }

      const result = await this.sendEmail(email);

      // Categorize result
      if (result.success) {
        results.sent.push(result);
        results.metrics.successCount++;
        totalSendTime += result.sendTimeMs;
      } else if (result.errorType === ErrorTypes.UNSUBSCRIBED || 
                 result.errorType === ErrorTypes.DAILY_LIMIT) {
        results.blocked.push(result);
        results.metrics.blockedCount++;
      } else {
        results.failed.push(result);
        results.metrics.failureCount++;
      }

      // Rate limiting between emails
      if (i < emails.length - 1) {
        await this.sleep(delayBetweenMs);
      }
    }

    // Calculate average send time
    if (results.metrics.successCount > 0) {
      results.metrics.avgSendTimeMs = Math.round(totalSendTime / results.metrics.successCount);
    }

    this.log('batch_complete', results.metrics);

    return results;
  }

  /**
   * Update metrics tracking
   */
  updateMetrics(success, sendTimeMs, errorType = null) {
    if (success) {
      this.metrics.totalSent++;
      
      // Rolling average send time
      const n = this.metrics.totalSent;
      this.metrics.avgSendTimeMs = 
        ((this.metrics.avgSendTimeMs * (n - 1)) + sendTimeMs) / n;
    } else {
      this.metrics.totalFailed++;
      
      if (errorType) {
        this.metrics.errorsByType[errorType] = 
          (this.metrics.errorsByType[errorType] || 0) + 1;
      }
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      dailySent: this.state.dailySent,
      remainingToday: this.getRemainingToday(),
      maxPerDay: this.maxPerDay,
      lastSentAt: this.state.lastSentAt,
      successRate: this.metrics.totalSent > 0
        ? ((this.metrics.totalSent / (this.metrics.totalSent + this.metrics.totalFailed)) * 100).toFixed(2) + '%'
        : 'N/A'
    };
  }

  /**
   * Structured logging
   */
  log(level, data) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: 'smtp-sender',
      ...data
    };

    // Console output
    const symbol = {
      success: '✓',
      error: '✗',
      retry: '⟳',
      info: 'ℹ',
      batch_complete: '✓✓'
    }[level] || '·';

    console.log(`[SMTP] ${symbol}`, JSON.stringify(logEntry));

    // Persist to log file for debugging
    this.appendToLog(logEntry);
  }

  /**
   * Append to daily log file
   */
  appendToLog(entry) {
    try {
      const logDir = path.join(__dirname, '../logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(logDir, `smtp-${today}.jsonl`);
      
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch (error) {
      // Fail silently to not break email sending
      console.error('[SMTP] Log write failed:', error.message);
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check
   */
  async healthCheck() {
    const health = {
      smtp: {
        configured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
        connected: !!this.transporter,
        healthy: false
      },
      limits: {
        dailySent: this.state.dailySent,
        dailyLimit: this.maxPerDay,
        remainingToday: this.getRemainingToday()
      },
      metrics: this.getMetrics()
    };

    // Test connection if configured
    if (health.smtp.configured) {
      const init = await this.init();
      health.smtp.healthy = init.success;
      
      if (!init.success) {
        health.smtp.error = init.error;
        health.smtp.errorType = init.errorType;
      }
    }

    return health;
  }
}

// Singleton instance
const enhancedSMTPSender = new EnhancedSMTPSender();

module.exports = {
  EnhancedSMTPSender,
  enhancedSMTPSender,
  ErrorTypes
};
