/**
 * Email Warm-up System - Caesar's Legions
 * 
 * Complete warm-up infrastructure that replaces $37/mo tools like Instantly
 * 
 * Components:
 * - WarmupScheduler: Orchestrates the warm-up process
 * - InboxRotationManager: Manages multiple SMTP inboxes
 * - DeliverabilityMonitor: Tracks bounce rates and sender reputation
 * - WarmupEmailGenerator: Creates realistic warm-up conversations
 * 
 * Usage:
 * 
 * const warmup = require('./lib/warmup');
 * 
 * // Add inboxes to the rotation pool
 * await warmup.addInbox({
 *   email: 'outreach1@company.com',
 *   password: 'app-password',
 *   host: 'smtp.zoho.com',
 *   port: 465,
 *   name: 'Outreach One'
 * });
 * 
 * await warmup.addInbox({
 *   email: 'outreach2@company.com',
 *   password: 'app-password',
 *   host: 'smtp.zoho.com',
 *   port: 465,
 *   name: 'Outreach Two'
 * });
 * 
 * // Start warm-up
 * await warmup.start();
 * 
 * // Check status
 * const status = await warmup.getStatus();
 * 
 * // Pause/resume
 * warmup.pause();
 * warmup.resume();
 * 
 * // Stop
 * await warmup.stop();
 */

const { WarmupScheduler, getWarmupScheduler, SCHEDULER_STATUS, SCHEDULE_MODES } = require('./scheduler');
const { InboxRotationManager, getInboxRotationManager, INBOX_STATUS, ROTATION_STRATEGIES, DEFAULT_WARMUP_SCHEDULE } = require('./inbox-rotation');
const { DeliverabilityMonitor, getDeliverabilityMonitor, THRESHOLDS, BOUNCE_TYPES, ALERT_SEVERITY } = require('./deliverability-monitor');
const { WarmupEmailGenerator, TOPICS } = require('./email-generator');

// ============================================================================
// UNIFIED API
// ============================================================================

/**
 * WarmupSystem - High-level API for the warm-up infrastructure
 */
class WarmupSystem {
  constructor(options = {}) {
    this.inboxManager = options.inboxManager || getInboxRotationManager(options);
    this.deliverability = options.deliverability || getDeliverabilityMonitor({
      ...options,
      onAlert: (alert) => this.handleAlert(alert)
    });
    this.scheduler = options.scheduler || getWarmupScheduler({
      ...options,
      inboxManager: this.inboxManager,
      deliverabilityMonitor: this.deliverability
    });
    this.emailGenerator = new WarmupEmailGenerator();
    
    this.alertHandlers = [];
    this._initialized = false;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Initialize the warm-up system
   */
  async initialize() {
    if (this._initialized) return;
    
    await this.inboxManager.loadState();
    await this.deliverability.loadState();
    
    this._initialized = true;
    console.log('[WarmupSystem] Initialized');
    
    return this;
  }

  /**
   * Start the warm-up scheduler
   */
  async start() {
    await this.initialize();
    return this.scheduler.start();
  }

  /**
   * Pause the warm-up scheduler
   */
  pause() {
    return this.scheduler.pause();
  }

  /**
   * Resume the warm-up scheduler
   */
  resume() {
    return this.scheduler.resume();
  }

  /**
   * Stop the warm-up scheduler
   */
  async stop() {
    const result = await this.scheduler.stop();
    await this.inboxManager.destroy();
    await this.deliverability.destroy();
    return result;
  }

  // ============================================================================
  // INBOX MANAGEMENT
  // ============================================================================

  /**
   * Add an inbox to the warm-up pool
   */
  async addInbox(inbox) {
    await this.initialize();
    const result = await this.inboxManager.addInbox(inbox);
    
    // Verify the inbox can connect
    const verification = await this.inboxManager.verifyInbox(inbox.email);
    
    return {
      ...result,
      verified: verification.success,
      verificationError: verification.error
    };
  }

  /**
   * Remove an inbox from the pool
   */
  async removeInbox(email) {
    return this.inboxManager.removeInbox(email);
  }

  /**
   * Update inbox settings
   */
  async updateInbox(email, updates) {
    return this.inboxManager.updateInbox(email, updates);
  }

  /**
   * Get all inboxes
   */
  getInboxes() {
    return this.inboxManager.getInboxes(true);
  }

  /**
   * Get specific inbox
   */
  getInbox(email) {
    return this.inboxManager.getInbox(email);
  }

  /**
   * Pause an inbox (remove from rotation without deleting)
   */
  async pauseInbox(email) {
    return this.inboxManager.updateInbox(email, { status: INBOX_STATUS.PAUSED });
  }

  /**
   * Resume a paused inbox
   */
  async resumeInbox(email) {
    return this.inboxManager.updateInbox(email, { status: INBOX_STATUS.WARMING });
  }

  /**
   * Verify SMTP connection for an inbox
   */
  async verifyInbox(email) {
    return this.inboxManager.verifyInbox(email);
  }

  /**
   * Verify all inboxes
   */
  async verifyAllInboxes() {
    return this.inboxManager.verifyAllInboxes();
  }

  // ============================================================================
  // ROTATION CONTROL
  // ============================================================================

  /**
   * Get next inbox for sending (manual rotation)
   */
  async getNextInbox(options = {}) {
    return this.inboxManager.getNextInbox(options);
  }

  /**
   * Record a send (for external integrations)
   */
  async recordSend(email, result = {}) {
    return this.inboxManager.recordSend(email, result);
  }

  /**
   * Set rotation strategy
   */
  setRotationStrategy(strategy) {
    return this.inboxManager.setStrategy(strategy);
  }

  // ============================================================================
  // DELIVERABILITY
  // ============================================================================

  /**
   * Get deliverability report for an inbox
   */
  getInboxDeliverability(email) {
    return this.deliverability.getInboxReport(email);
  }

  /**
   * Get overall deliverability report
   */
  getDeliverabilityReport() {
    return this.deliverability.getOverallReport();
  }

  /**
   * Check domain DNS configuration
   */
  async checkDomainDNS(domain) {
    return this.deliverability.checkDomainDNS(domain);
  }

  /**
   * Track a bounce (webhook integration)
   */
  async trackBounce(data) {
    return this.deliverability.trackBounce(data);
  }

  /**
   * Track a spam complaint (webhook integration)
   */
  async trackSpamComplaint(data) {
    return this.deliverability.trackSpamComplaint(data);
  }

  /**
   * Track email opened
   */
  async trackOpened(data) {
    return this.deliverability.trackOpened(data);
  }

  /**
   * Track email reply
   */
  async trackReply(data) {
    return this.deliverability.trackReply(data);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return this.deliverability.getActiveAlerts();
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId, resolution) {
    return this.deliverability.resolveAlert(alertId, resolution);
  }

  // ============================================================================
  // SCHEDULER CONTROL
  // ============================================================================

  /**
   * Get scheduler status
   */
  async getStatus() {
    return this.scheduler.getStatus();
  }

  /**
   * Get detailed report
   */
  async getDetailedReport() {
    return this.scheduler.getDetailedReport();
  }

  /**
   * Set scheduler mode
   */
  setMode(mode) {
    return this.scheduler.setMode(mode);
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(updates) {
    return this.scheduler.updateConfig(updates);
  }

  // ============================================================================
  // EMAIL GENERATION (for testing/preview)
  // ============================================================================

  /**
   * Generate a sample warm-up conversation
   */
  generateSampleConversation() {
    return this.emailGenerator.generateConversation();
  }

  /**
   * Generate a batch of warm-up emails
   */
  generateSampleBatch(count) {
    return this.emailGenerator.generateBatch(count);
  }

  // ============================================================================
  // ALERTS
  // ============================================================================

  /**
   * Register an alert handler
   */
  onAlert(handler) {
    this.alertHandlers.push(handler);
  }

  /**
   * Handle alerts internally
   */
  handleAlert(alert) {
    console.log(`[WarmupSystem] ALERT: ${alert.severity} - ${alert.message}`);
    
    // Notify all registered handlers
    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (e) {
        console.error('[WarmupSystem] Alert handler error:', e);
      }
    }
    
    // Auto-pause on critical alerts
    if (alert.severity === ALERT_SEVERITY.CRITICAL) {
      console.log('[WarmupSystem] Auto-pausing due to critical alert');
      this.scheduler.pause();
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get warm-up schedule for a given day
   */
  getScheduleForDay(day) {
    const schedules = DEFAULT_WARMUP_SCHEDULE;
    for (let i = schedules.length - 1; i >= 0; i--) {
      if (day >= schedules[i].day) {
        return schedules[i];
      }
    }
    return schedules[0];
  }

  /**
   * Get available constants
   */
  static getConstants() {
    return {
      SCHEDULER_STATUS,
      SCHEDULE_MODES,
      INBOX_STATUS,
      ROTATION_STRATEGIES,
      BOUNCE_TYPES,
      ALERT_SEVERITY,
      THRESHOLDS
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let systemInstance = null;

function getWarmupSystem(options) {
  if (!systemInstance) {
    systemInstance = new WarmupSystem(options);
  }
  return systemInstance;
}

// ============================================================================
// QUICK START API
// ============================================================================

// Expose singleton methods at module level for convenience
module.exports = {
  // Main class
  WarmupSystem,
  
  // Singleton getter
  getWarmupSystem,
  
  // Individual components
  WarmupScheduler,
  getWarmupScheduler,
  InboxRotationManager,
  getInboxRotationManager,
  DeliverabilityMonitor,
  getDeliverabilityMonitor,
  WarmupEmailGenerator,
  
  // Constants
  SCHEDULER_STATUS,
  SCHEDULE_MODES,
  INBOX_STATUS,
  ROTATION_STRATEGIES,
  BOUNCE_TYPES,
  ALERT_SEVERITY,
  THRESHOLDS,
  DEFAULT_WARMUP_SCHEDULE,
  TOPICS,
  
  // Quick-start convenience methods (use singleton)
  async initialize(options) {
    return getWarmupSystem(options).initialize();
  },
  
  async start() {
    return getWarmupSystem().start();
  },
  
  pause() {
    return getWarmupSystem().pause();
  },
  
  resume() {
    return getWarmupSystem().resume();
  },
  
  async stop() {
    return getWarmupSystem().stop();
  },
  
  async addInbox(inbox) {
    return getWarmupSystem().addInbox(inbox);
  },
  
  async removeInbox(email) {
    return getWarmupSystem().removeInbox(email);
  },
  
  getInboxes() {
    return getWarmupSystem().getInboxes();
  },
  
  async getStatus() {
    return getWarmupSystem().getStatus();
  },
  
  async getDetailedReport() {
    return getWarmupSystem().getDetailedReport();
  }
};

// ============================================================================
// USAGE EXAMPLES (in comments)
// ============================================================================

/*
// ==========================================
// BASIC USAGE
// ==========================================

const warmup = require('./lib/warmup');

// Add your SMTP inboxes
await warmup.addInbox({
  email: 'outreach1@yourdomain.com',
  password: 'your-app-password',
  host: 'smtp.zoho.com',
  port: 465,
  name: 'Sales Outreach 1'
});

await warmup.addInbox({
  email: 'outreach2@yourdomain.com',
  password: 'your-app-password',
  host: 'smtp.zoho.com',
  port: 465,
  name: 'Sales Outreach 2'
});

// Start warm-up
await warmup.start();

// Check status anytime
const status = await warmup.getStatus();
console.log(status);

// ==========================================
// ADVANCED USAGE
// ==========================================

const { WarmupSystem, SCHEDULE_MODES } = require('./lib/warmup');

const system = new WarmupSystem({
  dataDir: './data/warmup',
  mode: SCHEDULE_MODES.CONSERVATIVE
});

await system.initialize();

// Add inboxes
await system.addInbox({ ... });

// Set up alert handling
system.onAlert((alert) => {
  if (alert.severity === 'critical') {
    // Send to Slack, email, etc.
    notifyTeam(alert);
  }
});

// Start with custom mode
system.setMode(SCHEDULE_MODES.NORMAL);
await system.start();

// Get detailed reports
const report = await system.getDetailedReport();
console.log(report);

// Check domain DNS
const dns = await system.checkDomainDNS('yourdomain.com');
console.log(dns);

// ==========================================
// WEBHOOK INTEGRATION
// ==========================================

// Handle bounces from your email provider
app.post('/webhooks/bounce', async (req, res) => {
  await warmup.trackBounce({
    fromEmail: req.body.sender,
    toEmail: req.body.recipient,
    bounceType: 'hard',
    bounceCode: req.body.code,
    bounceMessage: req.body.message
  });
  res.sendStatus(200);
});

// Handle spam complaints
app.post('/webhooks/spam-complaint', async (req, res) => {
  await warmup.trackSpamComplaint({
    fromEmail: req.body.sender,
    toEmail: req.body.recipient,
    source: 'feedback_loop'
  });
  res.sendStatus(200);
});

// ==========================================
// MANUAL ROTATION (for production sends)
// ==========================================

// Get next available inbox for a campaign send
const inbox = await warmup.getNextInbox({
  excludeDomain: 'gmail.com'  // Don't send to Gmail from Gmail
});

if (inbox) {
  // Send your campaign email using inbox.email
  // ...
  
  // Record the send
  await warmup.recordSend(inbox.email, { messageId: result.messageId });
}

*/
