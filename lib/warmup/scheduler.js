/**
 * Warm-up Scheduler - Caesar's Legions
 * Orchestrates the email warm-up process across all inboxes
 * 
 * Features:
 * - Gradual volume increase per inbox
 * - Smart scheduling with realistic timing patterns
 * - Cross-inbox warm-up conversations
 * - Automatic pause on deliverability issues
 * - Integration with inbox rotation + deliverability monitoring
 * 
 * This is the brain of the warm-up system.
 */

const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

const { InboxRotationManager, getInboxRotationManager, INBOX_STATUS } = require('./inbox-rotation');
const { DeliverabilityMonitor, getDeliverabilityMonitor } = require('./deliverability-monitor');
const { WarmupEmailGenerator } = require('./email-generator');

// ============================================================================
// SCHEDULER STATES
// ============================================================================

const SCHEDULER_STATUS = {
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error'
};

const SCHEDULE_MODES = {
  CONSERVATIVE: 'conservative',  // Slower warm-up, safer
  NORMAL: 'normal',              // Standard pace
  AGGRESSIVE: 'aggressive'       // Faster warm-up (riskier)
};

// ============================================================================
// TIMING PATTERNS
// ============================================================================

const SEND_WINDOWS = {
  // Realistic business hours sending
  BUSINESS_HOURS: [
    { start: 8, end: 11, weight: 3 },   // Morning peak
    { start: 11, end: 14, weight: 2 },  // Lunch hours
    { start: 14, end: 17, weight: 3 },  // Afternoon peak
    { start: 17, end: 20, weight: 1 }   // Evening wind-down
  ],
  
  // More spread out
  EXTENDED_HOURS: [
    { start: 7, end: 22, weight: 1 }
  ]
};

const REPLY_DELAYS = {
  QUICK: { min: 5, max: 30 },        // 5-30 minutes
  NORMAL: { min: 30, max: 180 },     // 30 min - 3 hours
  SLOW: { min: 180, max: 480 }       // 3-8 hours
};

// ============================================================================
// WARM-UP SCHEDULER
// ============================================================================

class WarmupScheduler {
  /**
   * @param {Object} options
   * @param {string} options.dataDir - Directory for scheduler data
   * @param {string} options.mode - Schedule mode (conservative/normal/aggressive)
   * @param {Object} options.inboxManager - InboxRotationManager instance
   * @param {Object} options.deliverabilityMonitor - DeliverabilityMonitor instance
   */
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, '../../data/warmup');
    this.mode = options.mode || SCHEDULE_MODES.NORMAL;
    
    // Component instances
    this.inboxManager = options.inboxManager || getInboxRotationManager();
    this.deliverability = options.deliverabilityMonitor || getDeliverabilityMonitor();
    this.emailGenerator = new WarmupEmailGenerator();
    
    // State
    this.status = SCHEDULER_STATUS.STOPPED;
    this.scheduledTasks = [];       // Pending sends
    this.pendingReplies = [];       // Replies waiting to be sent
    this.activeConversations = new Map();  // Track ongoing warm-up conversations
    this.dailyStats = {
      date: null,
      sent: 0,
      received: 0,
      conversations: 0
    };
    
    // Intervals
    this.mainLoopInterval = null;
    this.replyCheckInterval = null;
    
    // Configuration
    this.config = {
      mainLoopIntervalMs: 60000,      // Check every minute
      replyCheckIntervalMs: 30000,    // Check for pending replies
      minDelayBetweenSends: 45000,    // Min 45s between sends from same inbox
      maxDailyWarmupPerInbox: 0.8,    // Use 80% of daily limit for warm-up
      replyRate: 0.85,                // 85% of warm-up emails get replies
      conversationDepth: 2.5          // Avg emails per conversation
    };

    this.lastSendTime = new Map();  // inbox -> timestamp
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Start the warm-up scheduler
   */
  async start() {
    if (this.status === SCHEDULER_STATUS.RUNNING) {
      return { success: false, message: 'Scheduler already running' };
    }

    console.log('[WarmupScheduler] Starting warm-up scheduler...');
    
    await this.loadState();
    await this.inboxManager.loadState();
    await this.deliverability.loadState();
    
    // Update warm-up levels for all inboxes
    await this.inboxManager.updateWarmupLevels();
    
    this.status = SCHEDULER_STATUS.RUNNING;
    this.resetDailyStats();
    
    // Start main loop
    this.mainLoopInterval = setInterval(
      () => this.mainLoop(), 
      this.config.mainLoopIntervalMs
    );
    
    // Start reply checker
    this.replyCheckInterval = setInterval(
      () => this.processReplies(),
      this.config.replyCheckIntervalMs
    );
    
    // Initial run
    await this.mainLoop();
    
    console.log('[WarmupScheduler] Started successfully');
    return { success: true, status: this.status };
  }

  /**
   * Pause the scheduler
   */
  pause() {
    if (this.status !== SCHEDULER_STATUS.RUNNING) {
      return { success: false, message: 'Scheduler not running' };
    }
    
    this.status = SCHEDULER_STATUS.PAUSED;
    console.log('[WarmupScheduler] Paused');
    return { success: true };
  }

  /**
   * Resume the scheduler
   */
  resume() {
    if (this.status !== SCHEDULER_STATUS.PAUSED) {
      return { success: false, message: 'Scheduler not paused' };
    }
    
    this.status = SCHEDULER_STATUS.RUNNING;
    console.log('[WarmupScheduler] Resumed');
    return { success: true };
  }

  /**
   * Stop the scheduler
   */
  async stop() {
    console.log('[WarmupScheduler] Stopping...');
    
    if (this.mainLoopInterval) {
      clearInterval(this.mainLoopInterval);
      this.mainLoopInterval = null;
    }
    
    if (this.replyCheckInterval) {
      clearInterval(this.replyCheckInterval);
      this.replyCheckInterval = null;
    }
    
    this.status = SCHEDULER_STATUS.STOPPED;
    await this.saveState();
    
    console.log('[WarmupScheduler] Stopped');
    return { success: true };
  }

  // ============================================================================
  // MAIN LOOP
  // ============================================================================

  /**
   * Main scheduling loop
   */
  async mainLoop() {
    if (this.status !== SCHEDULER_STATUS.RUNNING) return;
    
    try {
      // Check if within send window
      if (!this.isWithinSendWindow()) {
        return;
      }
      
      // Reset daily stats if new day
      this.checkDayRollover();
      
      // Get available inboxes for warm-up
      const summary = await this.inboxManager.getSummary();
      if (summary.totalInboxes < 2) {
        // Need at least 2 inboxes for warm-up conversations
        return;
      }
      
      // Check for any critical alerts
      const alerts = this.deliverability.getActiveAlerts();
      const criticalAlerts = alerts.filter(a => a.severity === 'critical');
      if (criticalAlerts.length > 0) {
        console.log(`[WarmupScheduler] Pausing due to ${criticalAlerts.length} critical alerts`);
        return;
      }
      
      // Determine how many emails to send this cycle
      const sendsThisCycle = this.calculateSendsThisCycle(summary);
      
      // Generate and schedule warm-up emails
      for (let i = 0; i < sendsThisCycle; i++) {
        await this.scheduleWarmupEmail();
      }
      
    } catch (error) {
      console.error('[WarmupScheduler] Error in main loop:', error);
      this.status = SCHEDULER_STATUS.ERROR;
    }
  }

  /**
   * Schedule a single warm-up email
   */
  async scheduleWarmupEmail() {
    // Get two different available inboxes
    const sender = await this.inboxManager.getNextInbox();
    if (!sender) return null;
    
    const recipient = await this.inboxManager.getNextInbox({
      excludeDomain: sender.email.split('@')[1] // Different domain preferred
    });
    
    if (!recipient || recipient.email === sender.email) return null;
    
    // Check minimum delay since last send from this inbox
    const lastSend = this.lastSendTime.get(sender.email);
    if (lastSend && Date.now() - lastSend < this.config.minDelayBetweenSends) {
      return null; // Too soon
    }
    
    // Generate warm-up email pair
    const warmupPair = this.emailGenerator.generateWarmupPair(
      sender.email,
      recipient.email
    );
    
    // Send the outbound email
    const result = await this.sendWarmupEmail({
      from: sender.email,
      to: recipient.email,
      subject: warmupPair.outbound.subject,
      body: warmupPair.outbound.body,
      conversationId: warmupPair.outbound.conversationId
    });
    
    if (result.success) {
      // Schedule the reply
      if (Math.random() < this.config.replyRate) {
        const replyDelay = this.calculateReplyDelay();
        
        this.pendingReplies.push({
          ...warmupPair.reply,
          scheduledFor: Date.now() + replyDelay,
          originalMessageId: result.messageId
        });
      }
      
      // Track conversation
      this.activeConversations.set(warmupPair.outbound.conversationId, {
        startedAt: new Date().toISOString(),
        participants: [sender.email, recipient.email],
        emailCount: 1
      });
      
      this.dailyStats.sent++;
      this.dailyStats.conversations++;
      this.lastSendTime.set(sender.email, Date.now());
    }
    
    return result;
  }

  /**
   * Send a warm-up email
   */
  async sendWarmupEmail(email) {
    try {
      const transporter = await this.inboxManager.getTransporter(email.from);
      
      const mailOptions = {
        from: email.from,
        to: email.to,
        subject: email.subject,
        text: email.body,
        html: this.textToHtml(email.body),
        headers: {
          'X-Warmup-Conversation': email.conversationId
        }
      };
      
      // Add reply headers if this is a reply
      if (email.inReplyTo) {
        mailOptions.inReplyTo = email.inReplyTo;
        mailOptions.references = email.inReplyTo;
      }
      
      const result = await transporter.sendMail(mailOptions);
      
      // Record the send
      await this.inboxManager.recordSend(email.from, {
        messageId: result.messageId,
        type: 'warmup'
      });
      
      // Track in deliverability
      await this.deliverability.trackSent({
        fromEmail: email.from,
        toEmail: email.to,
        messageId: result.messageId,
        campaignId: 'warmup'
      });
      
      console.log(`[WarmupScheduler] Sent: ${email.from} -> ${email.to}`);
      
      return {
        success: true,
        messageId: result.messageId,
        from: email.from,
        to: email.to
      };
      
    } catch (error) {
      console.error(`[WarmupScheduler] Failed to send: ${email.from} -> ${email.to}:`, error.message);
      
      // Handle bounce/error
      if (error.responseCode >= 500) {
        await this.deliverability.trackBounce({
          fromEmail: email.from,
          toEmail: email.to,
          bounceType: 'hard',
          bounceCode: error.responseCode,
          bounceMessage: error.message
        });
      }
      
      return {
        success: false,
        error: error.message,
        from: email.from,
        to: email.to
      };
    }
  }

  /**
   * Process pending replies
   */
  async processReplies() {
    if (this.status !== SCHEDULER_STATUS.RUNNING) return;
    
    const now = Date.now();
    const dueReplies = this.pendingReplies.filter(r => r.scheduledFor <= now);
    
    for (const reply of dueReplies) {
      // Check if within send window
      if (!this.isWithinSendWindow()) {
        // Reschedule to next window
        reply.scheduledFor = this.getNextWindowStart();
        continue;
      }
      
      // Check inbox availability
      const senderInfo = await this.inboxManager.getInbox(reply.from);
      if (!senderInfo || senderInfo.status === INBOX_STATUS.FLAGGED) {
        // Remove this reply
        this.pendingReplies = this.pendingReplies.filter(r => r !== reply);
        continue;
      }
      
      // Send the reply
      const result = await this.sendWarmupEmail({
        from: reply.from,
        to: reply.to,
        subject: reply.subject,
        body: reply.body,
        conversationId: reply.conversationId,
        inReplyTo: reply.originalMessageId
      });
      
      // Remove from pending
      this.pendingReplies = this.pendingReplies.filter(r => r !== reply);
      
      if (result.success) {
        this.dailyStats.received++;
        
        // Update conversation
        const convo = this.activeConversations.get(reply.conversationId);
        if (convo) {
          convo.emailCount++;
        }
        
        // Maybe schedule a follow-up
        if (Math.random() > 0.6) {
          const followupDelay = this.calculateReplyDelay() * 2;
          const followup = this.emailGenerator.generateFollowup(
            { subject: reply.subject.replace('Re: ', ''), senderName: this.extractName(reply.to) },
            { senderName: this.extractName(reply.from) }
          );
          
          this.pendingReplies.push({
            from: reply.to,
            to: reply.from,
            subject: `Re: ${reply.subject.replace('Re: ', '')}`,
            body: followup.body,
            conversationId: reply.conversationId,
            scheduledFor: Date.now() + followupDelay,
            originalMessageId: result.messageId
          });
        }
      }
    }
    
    await this.saveState();
  }

  // ============================================================================
  // SCHEDULING HELPERS
  // ============================================================================

  /**
   * Check if current time is within send window
   */
  isWithinSendWindow() {
    const hour = new Date().getHours();
    const windows = SEND_WINDOWS.BUSINESS_HOURS;
    
    return windows.some(w => hour >= w.start && hour < w.end);
  }

  /**
   * Get next send window start time
   */
  getNextWindowStart() {
    const now = new Date();
    const hour = now.getHours();
    const windows = SEND_WINDOWS.BUSINESS_HOURS;
    
    // Find next window
    for (const w of windows) {
      if (hour < w.start) {
        const next = new Date(now);
        next.setHours(w.start, 0, 0, 0);
        return next.getTime();
      }
    }
    
    // Next day, first window
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(windows[0].start, 0, 0, 0);
    return tomorrow.getTime();
  }

  /**
   * Calculate number of sends for this cycle
   */
  calculateSendsThisCycle(summary) {
    // Base: distribute remaining daily capacity across remaining hours
    const hour = new Date().getHours();
    const endHour = 20; // Last send hour
    const remainingHours = Math.max(1, endHour - hour);
    
    const dailyCapacity = summary.todayRemaining * this.config.maxDailyWarmupPerInbox;
    const capacityPerHour = dailyCapacity / remainingHours;
    
    // Adjust by mode
    let multiplier = 1;
    switch (this.mode) {
      case SCHEDULE_MODES.CONSERVATIVE:
        multiplier = 0.6;
        break;
      case SCHEDULE_MODES.AGGRESSIVE:
        multiplier = 1.4;
        break;
    }
    
    // Add randomness
    const sends = Math.floor(capacityPerHour * multiplier * (0.7 + Math.random() * 0.6));
    
    return Math.min(sends, 10); // Max 10 per cycle to spread things out
  }

  /**
   * Calculate delay for a reply
   */
  calculateReplyDelay() {
    const delays = REPLY_DELAYS.NORMAL;
    const minutes = delays.min + Math.random() * (delays.max - delays.min);
    return minutes * 60 * 1000; // Convert to ms
  }

  /**
   * Check and handle day rollover
   */
  checkDayRollover() {
    const today = new Date().toISOString().split('T')[0];
    
    if (this.dailyStats.date !== today) {
      // Archive yesterday's stats
      this.archiveDailyStats();
      this.resetDailyStats();
      
      // Update inbox warm-up levels
      this.inboxManager.updateWarmupLevels();
    }
  }

  /**
   * Reset daily stats
   */
  resetDailyStats() {
    this.dailyStats = {
      date: new Date().toISOString().split('T')[0],
      sent: 0,
      received: 0,
      conversations: 0
    };
  }

  /**
   * Archive daily stats
   */
  async archiveDailyStats() {
    if (!this.dailyStats.date) return;
    
    try {
      const archiveDir = path.join(this.dataDir, 'history');
      await fs.mkdir(archiveDir, { recursive: true });
      
      const filename = `warmup-${this.dailyStats.date}.json`;
      await fs.writeFile(
        path.join(archiveDir, filename),
        JSON.stringify(this.dailyStats, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('[WarmupScheduler] Failed to archive stats:', error);
    }
  }

  // ============================================================================
  // STATE PERSISTENCE
  // ============================================================================

  /**
   * Save scheduler state
   */
  async saveState() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      const state = {
        status: this.status,
        mode: this.mode,
        dailyStats: this.dailyStats,
        pendingReplies: this.pendingReplies,
        config: this.config,
        savedAt: new Date().toISOString()
      };
      
      await fs.writeFile(
        path.join(this.dataDir, 'scheduler-state.json'),
        JSON.stringify(state, null, 2),
        'utf8'
      );
      
    } catch (error) {
      console.error('[WarmupScheduler] Failed to save state:', error);
    }
  }

  /**
   * Load scheduler state
   */
  async loadState() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      const statePath = path.join(this.dataDir, 'scheduler-state.json');
      const data = await fs.readFile(statePath, 'utf8');
      const state = JSON.parse(data);
      
      // Only load today's data
      const today = new Date().toISOString().split('T')[0];
      
      if (state.dailyStats?.date === today) {
        this.dailyStats = state.dailyStats;
      }
      
      // Load pending replies that are still relevant
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      this.pendingReplies = (state.pendingReplies || [])
        .filter(r => now - r.scheduledFor < maxAge);
      
      // Load config overrides
      if (state.config) {
        Object.assign(this.config, state.config);
      }
      
      if (state.mode) {
        this.mode = state.mode;
      }
      
    } catch (error) {
      // No existing state, start fresh
    }
  }

  // ============================================================================
  // STATUS & REPORTING
  // ============================================================================

  /**
   * Get scheduler status
   */
  async getStatus() {
    const inboxSummary = await this.inboxManager.getSummary();
    const deliverabilityReport = this.deliverability.getOverallReport();
    
    return {
      status: this.status,
      mode: this.mode,
      today: this.dailyStats,
      pendingReplies: this.pendingReplies.length,
      activeConversations: this.activeConversations.size,
      inboxes: inboxSummary,
      deliverability: {
        health: deliverabilityReport.health,
        bounceRate: deliverabilityReport.summary.bounceRate,
        activeAlerts: deliverabilityReport.activeAlerts.length
      },
      nextWindow: this.isWithinSendWindow() ? 'now' : new Date(this.getNextWindowStart()).toISOString()
    };
  }

  /**
   * Get detailed report
   */
  async getDetailedReport() {
    const status = await this.getStatus();
    const inboxes = this.inboxManager.getInboxes(true);
    const deliverability = this.deliverability.getOverallReport();
    
    return {
      ...status,
      inboxBreakdown: inboxes,
      deliverabilityDetails: deliverability,
      config: this.config
    };
  }

  /**
   * Set scheduler mode
   */
  setMode(mode) {
    if (!Object.values(SCHEDULE_MODES).includes(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }
    
    this.mode = mode;
    this.saveState();
    
    return { success: true, mode };
  }

  /**
   * Update configuration
   */
  updateConfig(updates) {
    const allowedKeys = [
      'minDelayBetweenSends',
      'maxDailyWarmupPerInbox',
      'replyRate',
      'conversationDepth'
    ];
    
    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        this.config[key] = updates[key];
      }
    }
    
    this.saveState();
    return { success: true, config: this.config };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Convert plain text to HTML
   */
  textToHtml(text) {
    return text
      .split('\n\n')
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  /**
   * Extract name from email
   */
  extractName(email) {
    const local = email.split('@')[0];
    const name = local.replace(/[0-9._-]/g, ' ').trim().split(' ')[0];
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance = null;

function getWarmupScheduler(options) {
  if (!instance) {
    instance = new WarmupScheduler(options);
  }
  return instance;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  WarmupScheduler,
  getWarmupScheduler,
  SCHEDULER_STATUS,
  SCHEDULE_MODES,
  SEND_WINDOWS
};
