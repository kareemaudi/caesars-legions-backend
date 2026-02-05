/**
 * Inbox Rotation Manager - Caesar's Legions
 * Distributes sends across multiple SMTP accounts to maximize deliverability
 * 
 * Features:
 * - Round-robin and smart rotation strategies
 * - Daily/hourly send limits per inbox
 * - Health-based prioritization (avoid flagged inboxes)
 * - Automatic warm-up level tracking
 * 
 * This is what Instantly charges $37/mo for.
 */

const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

// ============================================================================
// INBOX STATES
// ============================================================================

const INBOX_STATUS = {
  ACTIVE: 'active',           // Ready to send
  WARMING: 'warming',         // In warm-up phase
  PAUSED: 'paused',          // Manually paused
  COOLING: 'cooling',        // High bounce rate, resting
  FLAGGED: 'flagged',        // Spam issues detected
  ERROR: 'error'             // SMTP connection issues
};

const ROTATION_STRATEGIES = {
  ROUND_ROBIN: 'round_robin',     // Equal distribution
  SMART: 'smart',                 // Health + capacity based
  RANDOM: 'random',               // Random selection
  LEAST_USED: 'least_used'        // Prioritize least used today
};

// ============================================================================
// DEFAULT WARM-UP SCHEDULE
// ============================================================================

const DEFAULT_WARMUP_SCHEDULE = [
  { day: 1, dailyLimit: 5, hourlyMax: 2 },
  { day: 2, dailyLimit: 7, hourlyMax: 2 },
  { day: 3, dailyLimit: 10, hourlyMax: 3 },
  { day: 4, dailyLimit: 12, hourlyMax: 3 },
  { day: 5, dailyLimit: 15, hourlyMax: 4 },
  { day: 6, dailyLimit: 18, hourlyMax: 4 },
  { day: 7, dailyLimit: 20, hourlyMax: 5 },
  { day: 14, dailyLimit: 30, hourlyMax: 7 },
  { day: 21, dailyLimit: 40, hourlyMax: 10 },
  { day: 28, dailyLimit: 50, hourlyMax: 12 },
  { day: 35, dailyLimit: 60, hourlyMax: 15 },
  { day: 42, dailyLimit: 75, hourlyMax: 18 },
  { day: 49, dailyLimit: 90, hourlyMax: 22 },
  { day: 56, dailyLimit: 100, hourlyMax: 25 },
  { day: 90, dailyLimit: 150, hourlyMax: 35 }
];

// ============================================================================
// INBOX ROTATION MANAGER
// ============================================================================

class InboxRotationManager {
  /**
   * @param {Object} options
   * @param {string} options.dataDir - Directory for inbox state persistence
   * @param {string} options.strategy - Rotation strategy (default: smart)
   * @param {number} options.cooldownHours - Hours to rest flagged inbox
   */
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, '../../data/warmup');
    this.strategy = options.strategy || ROTATION_STRATEGIES.SMART;
    this.cooldownHours = options.cooldownHours || 24;
    
    this.inboxes = new Map(); // email -> inbox config
    this.transporters = new Map(); // email -> nodemailer transporter
    this.dailyStats = new Map(); // email -> { sent: 0, bounced: 0, hour: { [h]: count } }
    this.rotationIndex = 0;
    
    this._stateLoaded = false;
  }

  // ============================================================================
  // INBOX MANAGEMENT
  // ============================================================================

  /**
   * Add an inbox to the rotation pool
   * @param {Object} inbox - Inbox configuration
   * @param {string} inbox.email - Email address
   * @param {string} inbox.password - SMTP password
   * @param {string} inbox.host - SMTP host
   * @param {number} inbox.port - SMTP port
   * @param {string} inbox.name - Display name
   * @param {Date} inbox.warmupStartDate - When warm-up began
   */
  async addInbox(inbox) {
    const email = inbox.email.toLowerCase();
    
    // Validate required fields
    if (!email || !inbox.password || !inbox.host) {
      throw new Error('Inbox requires email, password, and host');
    }

    // Calculate warm-up day
    const warmupStartDate = inbox.warmupStartDate || new Date();
    const warmupDay = this.calculateWarmupDay(warmupStartDate);
    const limits = this.getLimitsForDay(warmupDay);

    const config = {
      email,
      password: inbox.password,
      host: inbox.host,
      port: inbox.port || 465,
      secure: inbox.secure !== false,
      name: inbox.name || email.split('@')[0],
      status: inbox.status || INBOX_STATUS.WARMING,
      warmupStartDate,
      warmupDay,
      dailyLimit: inbox.dailyLimit || limits.dailyLimit,
      hourlyMax: inbox.hourlyMax || limits.hourlyMax,
      healthScore: inbox.healthScore || 100,
      lastUsed: null,
      createdAt: inbox.createdAt || new Date(),
      metadata: inbox.metadata || {}
    };

    this.inboxes.set(email, config);
    await this.createTransporter(email, config);
    await this.saveState();

    return { success: true, inbox: this.sanitizeInbox(config) };
  }

  /**
   * Remove an inbox from rotation
   */
  async removeInbox(email) {
    email = email.toLowerCase();
    
    const transporter = this.transporters.get(email);
    if (transporter) {
      transporter.close();
      this.transporters.delete(email);
    }
    
    this.inboxes.delete(email);
    this.dailyStats.delete(email);
    await this.saveState();
    
    return { success: true };
  }

  /**
   * Update inbox configuration
   */
  async updateInbox(email, updates) {
    email = email.toLowerCase();
    const inbox = this.inboxes.get(email);
    
    if (!inbox) {
      throw new Error(`Inbox not found: ${email}`);
    }

    // Apply updates (excluding sensitive fields from direct override)
    const allowedUpdates = ['name', 'status', 'dailyLimit', 'hourlyMax', 'metadata'];
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        inbox[key] = updates[key];
      }
    }

    // Handle password update separately (requires transporter recreation)
    if (updates.password) {
      inbox.password = updates.password;
      await this.createTransporter(email, inbox);
    }

    this.inboxes.set(email, inbox);
    await this.saveState();

    return { success: true, inbox: this.sanitizeInbox(inbox) };
  }

  /**
   * Get all inboxes
   */
  getInboxes(includeStats = true) {
    const inboxes = [];
    
    for (const [email, config] of this.inboxes) {
      const inbox = this.sanitizeInbox(config);
      
      if (includeStats) {
        const stats = this.dailyStats.get(email) || { sent: 0, bounced: 0 };
        inbox.todayStats = {
          sent: stats.sent,
          bounced: stats.bounced,
          remaining: Math.max(0, config.dailyLimit - stats.sent)
        };
      }
      
      inboxes.push(inbox);
    }
    
    return inboxes;
  }

  /**
   * Get a specific inbox
   */
  getInbox(email) {
    email = email.toLowerCase();
    const config = this.inboxes.get(email);
    return config ? this.sanitizeInbox(config) : null;
  }

  // ============================================================================
  // ROTATION LOGIC
  // ============================================================================

  /**
   * Get next inbox for sending based on rotation strategy
   * @param {Object} options
   * @param {string} options.excludeDomain - Don't use inbox from this domain
   * @param {string} options.preferDomain - Prefer inbox from this domain
   * @returns {Object|null} Selected inbox or null if none available
   */
  async getNextInbox(options = {}) {
    await this.ensureStateLoaded();
    
    const availableInboxes = this.getAvailableInboxes(options);
    
    if (availableInboxes.length === 0) {
      return null;
    }

    let selected;
    
    switch (this.strategy) {
      case ROTATION_STRATEGIES.ROUND_ROBIN:
        selected = this.selectRoundRobin(availableInboxes);
        break;
      case ROTATION_STRATEGIES.RANDOM:
        selected = this.selectRandom(availableInboxes);
        break;
      case ROTATION_STRATEGIES.LEAST_USED:
        selected = this.selectLeastUsed(availableInboxes);
        break;
      case ROTATION_STRATEGIES.SMART:
      default:
        selected = this.selectSmart(availableInboxes);
        break;
    }

    return selected;
  }

  /**
   * Get list of available inboxes (not at limit, not flagged)
   */
  getAvailableInboxes(options = {}) {
    const now = new Date();
    const currentHour = now.getHours();
    const available = [];

    for (const [email, config] of this.inboxes) {
      // Skip non-active statuses
      if (config.status !== INBOX_STATUS.ACTIVE && config.status !== INBOX_STATUS.WARMING) {
        continue;
      }

      // Domain filtering
      const domain = email.split('@')[1];
      if (options.excludeDomain && domain === options.excludeDomain) {
        continue;
      }

      // Get today's stats
      const stats = this.getDailyStats(email);
      
      // Check daily limit
      if (stats.sent >= config.dailyLimit) {
        continue;
      }

      // Check hourly limit
      const hourSent = stats.hourly[currentHour] || 0;
      if (hourSent >= config.hourlyMax) {
        continue;
      }

      // Add with scoring info
      available.push({
        email,
        config,
        stats,
        score: this.calculateInboxScore(config, stats),
        remainingToday: config.dailyLimit - stats.sent,
        remainingThisHour: config.hourlyMax - hourSent
      });
    }

    // Prefer domain if specified
    if (options.preferDomain) {
      const preferred = available.filter(i => i.email.includes(options.preferDomain));
      if (preferred.length > 0) {
        return preferred;
      }
    }

    return available;
  }

  /**
   * Round-robin selection
   */
  selectRoundRobin(available) {
    this.rotationIndex = (this.rotationIndex + 1) % available.length;
    return available[this.rotationIndex];
  }

  /**
   * Random selection
   */
  selectRandom(available) {
    const index = Math.floor(Math.random() * available.length);
    return available[index];
  }

  /**
   * Least-used selection (most remaining capacity)
   */
  selectLeastUsed(available) {
    return available.sort((a, b) => b.remainingToday - a.remainingToday)[0];
  }

  /**
   * Smart selection - balances health, capacity, and usage
   */
  selectSmart(available) {
    // Sort by composite score (health * capacity factor)
    return available.sort((a, b) => b.score - a.score)[0];
  }

  /**
   * Calculate inbox score for smart rotation
   */
  calculateInboxScore(config, stats) {
    // Health score (0-100)
    const healthFactor = config.healthScore / 100;
    
    // Capacity factor (how much room left)
    const capacityUsed = stats.sent / config.dailyLimit;
    const capacityFactor = 1 - capacityUsed;
    
    // Recency factor (prefer not recently used)
    const hoursSinceUse = config.lastUsed 
      ? (Date.now() - new Date(config.lastUsed).getTime()) / (1000 * 60 * 60)
      : 24;
    const recencyFactor = Math.min(hoursSinceUse / 24, 1);
    
    // Warm-up bonus (prefer more warmed inboxes)
    const warmupFactor = Math.min(config.warmupDay / 60, 1);
    
    return (healthFactor * 0.4) + 
           (capacityFactor * 0.3) + 
           (recencyFactor * 0.15) + 
           (warmupFactor * 0.15);
  }

  // ============================================================================
  // SEND TRACKING
  // ============================================================================

  /**
   * Record a send from an inbox
   */
  async recordSend(email, result = {}) {
    email = email.toLowerCase();
    const stats = this.getDailyStats(email);
    const hour = new Date().getHours();
    
    stats.sent++;
    stats.hourly[hour] = (stats.hourly[hour] || 0) + 1;
    
    if (result.bounced) {
      stats.bounced++;
    }
    
    if (result.messageId) {
      stats.messageIds.push(result.messageId);
    }

    // Update inbox lastUsed
    const inbox = this.inboxes.get(email);
    if (inbox) {
      inbox.lastUsed = new Date();
    }

    this.dailyStats.set(email, stats);
    
    // Check if we need to flag this inbox
    await this.checkInboxHealth(email);
    
    return stats;
  }

  /**
   * Record a bounce
   */
  async recordBounce(email, bounceData = {}) {
    email = email.toLowerCase();
    const stats = this.getDailyStats(email);
    stats.bounced++;
    stats.bounceDetails.push({
      timestamp: new Date().toISOString(),
      type: bounceData.type || 'hard',
      recipient: bounceData.recipient,
      reason: bounceData.reason
    });
    
    this.dailyStats.set(email, stats);
    await this.checkInboxHealth(email);
    
    return stats;
  }

  /**
   * Record spam complaint
   */
  async recordSpamComplaint(email, complaintData = {}) {
    email = email.toLowerCase();
    const inbox = this.inboxes.get(email);
    
    if (inbox) {
      // Immediate health penalty
      inbox.healthScore = Math.max(0, inbox.healthScore - 25);
      
      // If multiple complaints, flag the inbox
      const stats = this.getDailyStats(email);
      stats.complaints = (stats.complaints || 0) + 1;
      
      if (stats.complaints >= 2 || inbox.healthScore < 50) {
        inbox.status = INBOX_STATUS.FLAGGED;
        console.log(`[InboxRotation] FLAGGED inbox ${email} due to spam complaints`);
      }
      
      this.dailyStats.set(email, stats);
      await this.saveState();
    }
  }

  /**
   * Get daily stats for an inbox
   */
  getDailyStats(email) {
    email = email.toLowerCase();
    const today = new Date().toISOString().split('T')[0];
    
    let stats = this.dailyStats.get(email);
    
    // Reset if it's a new day
    if (!stats || stats.date !== today) {
      stats = {
        date: today,
        sent: 0,
        bounced: 0,
        complaints: 0,
        hourly: {},
        messageIds: [],
        bounceDetails: []
      };
      this.dailyStats.set(email, stats);
    }
    
    return stats;
  }

  // ============================================================================
  // HEALTH MANAGEMENT
  // ============================================================================

  /**
   * Check and update inbox health
   */
  async checkInboxHealth(email) {
    email = email.toLowerCase();
    const inbox = this.inboxes.get(email);
    const stats = this.getDailyStats(email);
    
    if (!inbox || stats.sent < 5) return; // Need enough sends to evaluate
    
    const bounceRate = stats.bounced / stats.sent;
    
    // High bounce rate - reduce health and potentially cool down
    if (bounceRate > 0.1) { // >10% bounce rate
      inbox.healthScore = Math.max(0, inbox.healthScore - 10);
      
      if (bounceRate > 0.2) { // >20% - enter cooling
        inbox.status = INBOX_STATUS.COOLING;
        inbox.cooldownUntil = new Date(Date.now() + this.cooldownHours * 60 * 60 * 1000);
        console.log(`[InboxRotation] Cooling down ${email} due to ${(bounceRate * 100).toFixed(1)}% bounce rate`);
      }
    }
    
    // Good performance - slowly recover health
    if (bounceRate < 0.02 && stats.sent >= 10) {
      inbox.healthScore = Math.min(100, inbox.healthScore + 2);
    }
    
    await this.saveState();
  }

  /**
   * Recover cooled/flagged inboxes that have rested enough
   */
  async recoverInboxes() {
    const now = new Date();
    
    for (const [email, inbox] of this.inboxes) {
      if (inbox.status === INBOX_STATUS.COOLING && inbox.cooldownUntil) {
        if (now >= new Date(inbox.cooldownUntil)) {
          inbox.status = INBOX_STATUS.WARMING;
          inbox.cooldownUntil = null;
          console.log(`[InboxRotation] Recovered ${email} from cooling`);
        }
      }
    }
    
    await this.saveState();
  }

  // ============================================================================
  // WARM-UP CALCULATIONS
  // ============================================================================

  /**
   * Calculate warm-up day from start date
   */
  calculateWarmupDay(startDate) {
    const start = new Date(startDate);
    const now = new Date();
    const diffTime = Math.abs(now - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
  }

  /**
   * Get limits for a specific warm-up day
   */
  getLimitsForDay(day) {
    // Find the appropriate tier
    for (let i = DEFAULT_WARMUP_SCHEDULE.length - 1; i >= 0; i--) {
      if (day >= DEFAULT_WARMUP_SCHEDULE[i].day) {
        return DEFAULT_WARMUP_SCHEDULE[i];
      }
    }
    return DEFAULT_WARMUP_SCHEDULE[0];
  }

  /**
   * Update warm-up levels for all inboxes
   */
  async updateWarmupLevels() {
    for (const [email, inbox] of this.inboxes) {
      const newDay = this.calculateWarmupDay(inbox.warmupStartDate);
      
      if (newDay !== inbox.warmupDay) {
        const limits = this.getLimitsForDay(newDay);
        inbox.warmupDay = newDay;
        inbox.dailyLimit = limits.dailyLimit;
        inbox.hourlyMax = limits.hourlyMax;
        
        // Promote from warming to active after day 14
        if (inbox.status === INBOX_STATUS.WARMING && newDay >= 14) {
          inbox.status = INBOX_STATUS.ACTIVE;
        }
      }
    }
    
    await this.saveState();
  }

  // ============================================================================
  // NODEMAILER INTEGRATION
  // ============================================================================

  /**
   * Create nodemailer transporter for an inbox
   */
  async createTransporter(email, config) {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.email,
        pass: config.password
      },
      pool: true,
      maxConnections: 2,
      maxMessages: 50
    });

    this.transporters.set(email, transporter);
    return transporter;
  }

  /**
   * Get transporter for an inbox
   */
  async getTransporter(email) {
    email = email.toLowerCase();
    
    let transporter = this.transporters.get(email);
    
    if (!transporter) {
      const config = this.inboxes.get(email);
      if (!config) {
        throw new Error(`Inbox not found: ${email}`);
      }
      transporter = await this.createTransporter(email, config);
    }
    
    return transporter;
  }

  /**
   * Verify SMTP connection for an inbox
   */
  async verifyInbox(email) {
    try {
      const transporter = await this.getTransporter(email);
      await transporter.verify();
      
      const inbox = this.inboxes.get(email.toLowerCase());
      if (inbox && inbox.status === INBOX_STATUS.ERROR) {
        inbox.status = INBOX_STATUS.WARMING;
        await this.saveState();
      }
      
      return { success: true, email };
    } catch (error) {
      const inbox = this.inboxes.get(email.toLowerCase());
      if (inbox) {
        inbox.status = INBOX_STATUS.ERROR;
        inbox.lastError = error.message;
        await this.saveState();
      }
      
      return { success: false, email, error: error.message };
    }
  }

  /**
   * Verify all inboxes
   */
  async verifyAllInboxes() {
    const results = [];
    
    for (const email of this.inboxes.keys()) {
      const result = await this.verifyInbox(email);
      results.push(result);
      // Small delay between verifications
      await new Promise(r => setTimeout(r, 500));
    }
    
    return results;
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  /**
   * Save state to disk
   */
  async saveState() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Save inbox configs (excluding passwords from main state)
      const inboxState = [];
      for (const [email, config] of this.inboxes) {
        inboxState.push({
          ...config,
          password: undefined // Don't persist passwords in state file
        });
      }
      
      const state = {
        updatedAt: new Date().toISOString(),
        strategy: this.strategy,
        rotationIndex: this.rotationIndex,
        inboxes: inboxState
      };
      
      await fs.writeFile(
        path.join(this.dataDir, 'inbox-rotation-state.json'),
        JSON.stringify(state, null, 2),
        'utf8'
      );
      
      // Save daily stats separately
      const statsState = {};
      for (const [email, stats] of this.dailyStats) {
        statsState[email] = stats;
      }
      
      await fs.writeFile(
        path.join(this.dataDir, 'inbox-daily-stats.json'),
        JSON.stringify(statsState, null, 2),
        'utf8'
      );
      
    } catch (error) {
      console.error('[InboxRotation] Failed to save state:', error);
    }
  }

  /**
   * Load state from disk
   */
  async loadState() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load inbox state
      const statePath = path.join(this.dataDir, 'inbox-rotation-state.json');
      try {
        const stateData = await fs.readFile(statePath, 'utf8');
        const state = JSON.parse(stateData);
        
        this.strategy = state.strategy || this.strategy;
        this.rotationIndex = state.rotationIndex || 0;
        
        // Inboxes need passwords from secure storage
        // This just loads the structure; passwords must be re-added
        for (const inbox of state.inboxes || []) {
          if (inbox.email && inbox.host) {
            this.inboxes.set(inbox.email, inbox);
          }
        }
      } catch (e) {
        // No existing state
      }
      
      // Load daily stats
      const statsPath = path.join(this.dataDir, 'inbox-daily-stats.json');
      try {
        const statsData = await fs.readFile(statsPath, 'utf8');
        const stats = JSON.parse(statsData);
        
        const today = new Date().toISOString().split('T')[0];
        for (const [email, data] of Object.entries(stats)) {
          // Only load today's stats
          if (data.date === today) {
            this.dailyStats.set(email, data);
          }
        }
      } catch (e) {
        // No existing stats
      }
      
      this._stateLoaded = true;
      
    } catch (error) {
      console.error('[InboxRotation] Failed to load state:', error);
      this._stateLoaded = true;
    }
  }

  /**
   * Ensure state is loaded
   */
  async ensureStateLoaded() {
    if (!this._stateLoaded) {
      await this.loadState();
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Sanitize inbox for API response (remove password)
   */
  sanitizeInbox(inbox) {
    const { password, ...safe } = inbox;
    return safe;
  }

  /**
   * Get rotation summary
   */
  async getSummary() {
    await this.ensureStateLoaded();
    
    const totalInboxes = this.inboxes.size;
    const byStatus = {};
    let totalSentToday = 0;
    let totalCapacityToday = 0;
    
    for (const [email, config] of this.inboxes) {
      byStatus[config.status] = (byStatus[config.status] || 0) + 1;
      
      const stats = this.getDailyStats(email);
      totalSentToday += stats.sent;
      totalCapacityToday += config.dailyLimit;
    }
    
    return {
      totalInboxes,
      byStatus,
      todaySent: totalSentToday,
      todayCapacity: totalCapacityToday,
      todayRemaining: totalCapacityToday - totalSentToday,
      strategy: this.strategy
    };
  }

  /**
   * Set rotation strategy
   */
  setStrategy(strategy) {
    if (Object.values(ROTATION_STRATEGIES).includes(strategy)) {
      this.strategy = strategy;
      return { success: true, strategy };
    }
    throw new Error(`Invalid strategy: ${strategy}`);
  }

  /**
   * Cleanup - close all transporters
   */
  async destroy() {
    await this.saveState();
    
    for (const transporter of this.transporters.values()) {
      transporter.close();
    }
    
    this.transporters.clear();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance = null;

function getInboxRotationManager(options) {
  if (!instance) {
    instance = new InboxRotationManager(options);
  }
  return instance;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  InboxRotationManager,
  getInboxRotationManager,
  INBOX_STATUS,
  ROTATION_STRATEGIES,
  DEFAULT_WARMUP_SCHEDULE
};
