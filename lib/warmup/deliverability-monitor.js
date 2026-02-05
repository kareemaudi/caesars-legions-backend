/**
 * Deliverability Monitor - Caesar's Legions
 * Tracks bounce rates, spam complaints, and inbox placement
 * 
 * Features:
 * - Real-time bounce/complaint tracking
 * - Domain reputation monitoring
 * - Sender score estimation
 * - Automated alerts for deliverability issues
 * - Historical trend analysis
 * 
 * This replaces expensive tools like GlockApps, MailMonitor
 */

const fs = require('fs').promises;
const path = require('path');
const dns = require('dns').promises;

// ============================================================================
// DELIVERABILITY THRESHOLDS
// ============================================================================

const THRESHOLDS = {
  // Bounce rates
  BOUNCE_RATE_WARNING: 0.02,    // 2% - yellow flag
  BOUNCE_RATE_CRITICAL: 0.05,   // 5% - red flag, pause inbox
  
  // Spam complaints
  COMPLAINT_RATE_WARNING: 0.001,  // 0.1% - yellow flag
  COMPLAINT_RATE_CRITICAL: 0.005, // 0.5% - red flag
  
  // Open rates (low = potential deliverability issues)
  OPEN_RATE_WARNING: 0.15,      // <15% might indicate spam folder
  OPEN_RATE_CRITICAL: 0.05,     // <5% definitely in spam
  
  // Reply rates
  REPLY_RATE_HEALTHY: 0.02,     // 2%+ is healthy engagement
};

const BOUNCE_TYPES = {
  HARD: 'hard',           // Invalid email, permanent failure
  SOFT: 'soft',           // Temporary issue (mailbox full, etc)
  BLOCK: 'block',         // Blocked by recipient server
  SPAM: 'spam',           // Marked as spam
  TECHNICAL: 'technical'  // DNS/connection issues
};

const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

// ============================================================================
// DELIVERABILITY MONITOR
// ============================================================================

class DeliverabilityMonitor {
  /**
   * @param {Object} options
   * @param {string} options.dataDir - Directory for deliverability data
   * @param {Function} options.onAlert - Callback for alerts
   * @param {Object} options.metricsTracker - Optional metrics integration
   */
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, '../../data/deliverability');
    this.onAlert = options.onAlert || console.log;
    this.metrics = options.metricsTracker || null;
    
    // In-memory tracking
    this.inboxStats = new Map();   // email -> stats
    this.domainStats = new Map();  // domain -> stats
    this.recentEvents = [];        // Last 1000 events
    this.alerts = [];              // Active alerts
    
    this.maxRecentEvents = 1000;
  }

  // ============================================================================
  // EVENT TRACKING
  // ============================================================================

  /**
   * Track email sent
   */
  async trackSent(data) {
    const { fromEmail, toEmail, messageId, campaignId } = data;
    
    const event = {
      type: 'sent',
      fromEmail: fromEmail.toLowerCase(),
      toEmail: toEmail.toLowerCase(),
      toDomain: this.extractDomain(toEmail),
      messageId,
      campaignId,
      timestamp: new Date().toISOString()
    };

    this.recordEvent(event);
    this.updateInboxStats(fromEmail, { sent: 1 });
    this.updateDomainStats(event.toDomain, { sent: 1 });
    
    return event;
  }

  /**
   * Track bounce
   */
  async trackBounce(data) {
    const { 
      fromEmail, 
      toEmail, 
      messageId, 
      bounceType = BOUNCE_TYPES.HARD,
      bounceCode,
      bounceMessage,
      campaignId 
    } = data;

    const event = {
      type: 'bounce',
      bounceType,
      bounceCode,
      bounceMessage: bounceMessage?.substring(0, 500),
      fromEmail: fromEmail?.toLowerCase(),
      toEmail: toEmail?.toLowerCase(),
      toDomain: this.extractDomain(toEmail),
      messageId,
      campaignId,
      timestamp: new Date().toISOString()
    };

    this.recordEvent(event);
    this.updateInboxStats(fromEmail, { 
      bounced: 1, 
      [`bounce_${bounceType}`]: 1 
    });
    this.updateDomainStats(event.toDomain, { bounced: 1 });

    // Check for alerts
    await this.checkBounceAlerts(fromEmail);
    
    // Track in metrics if available
    if (this.metrics) {
      this.metrics.track('email_bounced', {
        fromEmail,
        toDomain: event.toDomain,
        bounceType,
        bounceCode
      });
    }

    return event;
  }

  /**
   * Track spam complaint
   */
  async trackSpamComplaint(data) {
    const { fromEmail, toEmail, messageId, source, campaignId } = data;

    const event = {
      type: 'spam_complaint',
      source: source || 'unknown', // 'feedback_loop', 'manual', 'detected'
      fromEmail: fromEmail?.toLowerCase(),
      toEmail: toEmail?.toLowerCase(),
      toDomain: this.extractDomain(toEmail),
      messageId,
      campaignId,
      timestamp: new Date().toISOString()
    };

    this.recordEvent(event);
    this.updateInboxStats(fromEmail, { spamComplaints: 1 });
    this.updateDomainStats(event.toDomain, { spamComplaints: 1 });

    // Spam complaints are always serious
    await this.createAlert({
      type: 'SPAM_COMPLAINT',
      severity: ALERT_SEVERITY.CRITICAL,
      inbox: fromEmail,
      message: `Spam complaint received for ${fromEmail} (recipient: ${toEmail})`,
      data: event
    });

    return event;
  }

  /**
   * Track email opened
   */
  async trackOpened(data) {
    const { fromEmail, toEmail, messageId, campaignId, device, location } = data;

    const event = {
      type: 'opened',
      fromEmail: fromEmail?.toLowerCase(),
      toEmail: toEmail?.toLowerCase(),
      toDomain: this.extractDomain(toEmail),
      messageId,
      campaignId,
      device,
      location,
      timestamp: new Date().toISOString()
    };

    this.recordEvent(event);
    this.updateInboxStats(fromEmail, { opened: 1 });
    this.updateDomainStats(event.toDomain, { opened: 1 });

    return event;
  }

  /**
   * Track reply received
   */
  async trackReply(data) {
    const { fromEmail, toEmail, messageId, campaignId, sentiment } = data;

    const event = {
      type: 'reply',
      fromEmail: fromEmail?.toLowerCase(),
      toEmail: toEmail?.toLowerCase(),
      toDomain: this.extractDomain(toEmail),
      messageId,
      campaignId,
      sentiment,
      timestamp: new Date().toISOString()
    };

    this.recordEvent(event);
    this.updateInboxStats(fromEmail, { replied: 1 });
    this.updateDomainStats(event.toDomain, { replied: 1 });

    return event;
  }

  /**
   * Track unsubscribe
   */
  async trackUnsubscribe(data) {
    const { fromEmail, toEmail, messageId, campaignId } = data;

    const event = {
      type: 'unsubscribe',
      fromEmail: fromEmail?.toLowerCase(),
      toEmail: toEmail?.toLowerCase(),
      toDomain: this.extractDomain(toEmail),
      messageId,
      campaignId,
      timestamp: new Date().toISOString()
    };

    this.recordEvent(event);
    this.updateInboxStats(fromEmail, { unsubscribed: 1 });

    return event;
  }

  // ============================================================================
  // STATS MANAGEMENT
  // ============================================================================

  /**
   * Update inbox statistics
   */
  updateInboxStats(email, increments) {
    if (!email) return;
    
    email = email.toLowerCase();
    const today = new Date().toISOString().split('T')[0];
    
    let stats = this.inboxStats.get(email);
    if (!stats || stats.date !== today) {
      stats = this.createEmptyStats(today);
    }
    
    for (const [key, value] of Object.entries(increments)) {
      stats[key] = (stats[key] || 0) + value;
    }
    
    // Recalculate rates
    if (stats.sent > 0) {
      stats.bounceRate = stats.bounced / stats.sent;
      stats.openRate = stats.opened / stats.sent;
      stats.replyRate = stats.replied / stats.sent;
      stats.complaintRate = stats.spamComplaints / stats.sent;
    }
    
    this.inboxStats.set(email, stats);
  }

  /**
   * Update domain statistics
   */
  updateDomainStats(domain, increments) {
    if (!domain) return;
    
    domain = domain.toLowerCase();
    const today = new Date().toISOString().split('T')[0];
    
    let stats = this.domainStats.get(domain);
    if (!stats || stats.date !== today) {
      stats = this.createEmptyStats(today);
    }
    
    for (const [key, value] of Object.entries(increments)) {
      stats[key] = (stats[key] || 0) + value;
    }
    
    // Recalculate rates
    if (stats.sent > 0) {
      stats.bounceRate = stats.bounced / stats.sent;
    }
    
    this.domainStats.set(domain, stats);
  }

  /**
   * Create empty stats object
   */
  createEmptyStats(date) {
    return {
      date,
      sent: 0,
      bounced: 0,
      bounce_hard: 0,
      bounce_soft: 0,
      bounce_block: 0,
      opened: 0,
      replied: 0,
      spamComplaints: 0,
      unsubscribed: 0,
      bounceRate: 0,
      openRate: 0,
      replyRate: 0,
      complaintRate: 0
    };
  }

  /**
   * Record event in recent events buffer
   */
  recordEvent(event) {
    this.recentEvents.unshift(event);
    
    // Trim to max size
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.pop();
    }
  }

  // ============================================================================
  // REPORTING
  // ============================================================================

  /**
   * Get inbox deliverability report
   */
  getInboxReport(email) {
    email = email.toLowerCase();
    const stats = this.inboxStats.get(email);
    
    if (!stats) {
      return { email, noData: true };
    }

    return {
      email,
      date: stats.date,
      metrics: {
        sent: stats.sent,
        bounced: stats.bounced,
        bounceRate: stats.bounceRate,
        opened: stats.opened,
        openRate: stats.openRate,
        replied: stats.replied,
        replyRate: stats.replyRate,
        spamComplaints: stats.spamComplaints,
        complaintRate: stats.complaintRate
      },
      health: this.calculateHealthScore(stats),
      issues: this.identifyIssues(stats),
      recommendations: this.getRecommendations(stats)
    };
  }

  /**
   * Get overall deliverability report
   */
  getOverallReport() {
    const totals = this.createEmptyStats(new Date().toISOString().split('T')[0]);
    
    for (const stats of this.inboxStats.values()) {
      totals.sent += stats.sent;
      totals.bounced += stats.bounced;
      totals.opened += stats.opened;
      totals.replied += stats.replied;
      totals.spamComplaints += stats.spamComplaints;
    }
    
    if (totals.sent > 0) {
      totals.bounceRate = totals.bounced / totals.sent;
      totals.openRate = totals.opened / totals.sent;
      totals.replyRate = totals.replied / totals.sent;
      totals.complaintRate = totals.spamComplaints / totals.sent;
    }

    // Per-inbox breakdown
    const inboxBreakdown = [];
    for (const [email, stats] of this.inboxStats) {
      inboxBreakdown.push({
        email,
        sent: stats.sent,
        bounceRate: stats.bounceRate,
        openRate: stats.openRate,
        health: this.calculateHealthScore(stats)
      });
    }

    // Problem domains
    const problemDomains = [];
    for (const [domain, stats] of this.domainStats) {
      if (stats.bounceRate > THRESHOLDS.BOUNCE_RATE_WARNING && stats.sent >= 5) {
        problemDomains.push({
          domain,
          sent: stats.sent,
          bounceRate: stats.bounceRate
        });
      }
    }

    return {
      date: totals.date,
      summary: {
        totalSent: totals.sent,
        totalBounced: totals.bounced,
        bounceRate: totals.bounceRate,
        openRate: totals.openRate,
        replyRate: totals.replyRate,
        complaintRate: totals.complaintRate
      },
      health: this.calculateHealthScore(totals),
      inboxCount: this.inboxStats.size,
      inboxBreakdown: inboxBreakdown.sort((a, b) => a.health - b.health),
      problemDomains: problemDomains.sort((a, b) => b.bounceRate - a.bounceRate),
      activeAlerts: this.alerts.filter(a => !a.resolved)
    };
  }

  /**
   * Get domain-specific report
   */
  getDomainReport(domain) {
    domain = domain.toLowerCase();
    const stats = this.domainStats.get(domain);
    
    if (!stats) {
      return { domain, noData: true };
    }

    return {
      domain,
      date: stats.date,
      sent: stats.sent,
      bounced: stats.bounced,
      bounceRate: stats.bounceRate,
      status: stats.bounceRate > THRESHOLDS.BOUNCE_RATE_CRITICAL ? 'problematic' 
            : stats.bounceRate > THRESHOLDS.BOUNCE_RATE_WARNING ? 'warning' 
            : 'healthy'
    };
  }

  /**
   * Get recent events for an inbox
   */
  getRecentEvents(email, limit = 50) {
    email = email?.toLowerCase();
    
    return this.recentEvents
      .filter(e => !email || e.fromEmail === email)
      .slice(0, limit);
  }

  // ============================================================================
  // HEALTH SCORING
  // ============================================================================

  /**
   * Calculate health score (0-100)
   */
  calculateHealthScore(stats) {
    if (!stats || stats.sent === 0) return 100;

    let score = 100;

    // Bounce rate impact (up to -40 points)
    if (stats.bounceRate > THRESHOLDS.BOUNCE_RATE_CRITICAL) {
      score -= 40;
    } else if (stats.bounceRate > THRESHOLDS.BOUNCE_RATE_WARNING) {
      score -= 20;
    } else if (stats.bounceRate > 0.01) {
      score -= 10;
    }

    // Spam complaints (up to -40 points)
    if (stats.complaintRate > THRESHOLDS.COMPLAINT_RATE_CRITICAL) {
      score -= 40;
    } else if (stats.complaintRate > THRESHOLDS.COMPLAINT_RATE_WARNING) {
      score -= 25;
    } else if (stats.spamComplaints > 0) {
      score -= 10;
    }

    // Open rate bonus/penalty (up to ±10 points)
    if (stats.sent >= 20) { // Need enough data
      if (stats.openRate < THRESHOLDS.OPEN_RATE_CRITICAL) {
        score -= 10;
      } else if (stats.openRate < THRESHOLDS.OPEN_RATE_WARNING) {
        score -= 5;
      } else if (stats.openRate > 0.30) {
        score += 5;
      }
    }

    // Reply rate bonus (up to +10 points)
    if (stats.replyRate > THRESHOLDS.REPLY_RATE_HEALTHY) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Identify issues with stats
   */
  identifyIssues(stats) {
    const issues = [];

    if (stats.bounceRate > THRESHOLDS.BOUNCE_RATE_CRITICAL) {
      issues.push({
        type: 'HIGH_BOUNCE_RATE',
        severity: 'critical',
        value: stats.bounceRate,
        message: `Bounce rate ${(stats.bounceRate * 100).toFixed(1)}% exceeds critical threshold`
      });
    } else if (stats.bounceRate > THRESHOLDS.BOUNCE_RATE_WARNING) {
      issues.push({
        type: 'ELEVATED_BOUNCE_RATE',
        severity: 'warning',
        value: stats.bounceRate,
        message: `Bounce rate ${(stats.bounceRate * 100).toFixed(1)}% is elevated`
      });
    }

    if (stats.spamComplaints > 0) {
      issues.push({
        type: 'SPAM_COMPLAINTS',
        severity: stats.complaintRate > THRESHOLDS.COMPLAINT_RATE_CRITICAL ? 'critical' : 'warning',
        value: stats.spamComplaints,
        message: `${stats.spamComplaints} spam complaint(s) received`
      });
    }

    if (stats.sent >= 20 && stats.openRate < THRESHOLDS.OPEN_RATE_CRITICAL) {
      issues.push({
        type: 'VERY_LOW_OPEN_RATE',
        severity: 'warning',
        value: stats.openRate,
        message: `Open rate ${(stats.openRate * 100).toFixed(1)}% suggests spam folder placement`
      });
    }

    return issues;
  }

  /**
   * Get recommendations based on stats
   */
  getRecommendations(stats) {
    const recommendations = [];

    if (stats.bounceRate > THRESHOLDS.BOUNCE_RATE_WARNING) {
      recommendations.push({
        priority: 'high',
        action: 'Clean your email list - remove invalid addresses',
        reason: 'High bounce rate damages sender reputation'
      });
      recommendations.push({
        priority: 'medium',
        action: 'Verify emails before sending using email validation API',
        reason: 'Prevents bounces before they happen'
      });
    }

    if (stats.spamComplaints > 0) {
      recommendations.push({
        priority: 'high',
        action: 'Review email content for spam triggers',
        reason: 'Spam complaints severely impact deliverability'
      });
      recommendations.push({
        priority: 'high',
        action: 'Add clear unsubscribe option',
        reason: 'Reduces spam complaints'
      });
    }

    if (stats.sent >= 20 && stats.openRate < THRESHOLDS.OPEN_RATE_WARNING) {
      recommendations.push({
        priority: 'medium',
        action: 'Test subject lines - current ones may trigger spam filters',
        reason: 'Low open rates often indicate spam folder placement'
      });
      recommendations.push({
        priority: 'medium',
        action: 'Warm up inbox more gradually',
        reason: 'Sudden volume increases hurt reputation'
      });
    }

    if (stats.sent < 20 && !stats.bounced) {
      recommendations.push({
        priority: 'low',
        action: 'Continue warming up - good progress so far',
        reason: 'Consistent sending builds reputation'
      });
    }

    return recommendations;
  }

  // ============================================================================
  // ALERTS
  // ============================================================================

  /**
   * Check for bounce-related alerts
   */
  async checkBounceAlerts(email) {
    const stats = this.inboxStats.get(email?.toLowerCase());
    if (!stats || stats.sent < 5) return;

    if (stats.bounceRate > THRESHOLDS.BOUNCE_RATE_CRITICAL) {
      await this.createAlert({
        type: 'HIGH_BOUNCE_RATE',
        severity: ALERT_SEVERITY.CRITICAL,
        inbox: email,
        message: `Critical bounce rate ${(stats.bounceRate * 100).toFixed(1)}% for ${email}`,
        data: {
          bounceRate: stats.bounceRate,
          sent: stats.sent,
          bounced: stats.bounced
        }
      });
    } else if (stats.bounceRate > THRESHOLDS.BOUNCE_RATE_WARNING) {
      await this.createAlert({
        type: 'ELEVATED_BOUNCE_RATE',
        severity: ALERT_SEVERITY.WARNING,
        inbox: email,
        message: `Elevated bounce rate ${(stats.bounceRate * 100).toFixed(1)}% for ${email}`,
        data: {
          bounceRate: stats.bounceRate,
          sent: stats.sent,
          bounced: stats.bounced
        }
      });
    }
  }

  /**
   * Create an alert
   */
  async createAlert(alert) {
    const fullAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...alert,
      createdAt: new Date().toISOString(),
      resolved: false
    };

    // Check for duplicate active alerts
    const existing = this.alerts.find(a => 
      !a.resolved && 
      a.type === alert.type && 
      a.inbox === alert.inbox
    );

    if (existing) {
      existing.lastOccurrence = fullAlert.createdAt;
      existing.occurrenceCount = (existing.occurrenceCount || 1) + 1;
      return existing;
    }

    this.alerts.push(fullAlert);
    
    // Trigger callback
    if (this.onAlert) {
      this.onAlert(fullAlert);
    }

    return fullAlert;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId, resolution = {}) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      alert.resolution = resolution;
    }
    return alert;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(inbox = null) {
    return this.alerts.filter(a => {
      if (a.resolved) return false;
      if (inbox && a.inbox !== inbox.toLowerCase()) return false;
      return true;
    });
  }

  // ============================================================================
  // DNS CHECKS
  // ============================================================================

  /**
   * Check domain DNS records for deliverability
   */
  async checkDomainDNS(domain) {
    const results = {
      domain,
      checks: [],
      issues: [],
      score: 100
    };

    // Check MX records
    try {
      const mx = await dns.resolveMx(domain);
      results.checks.push({
        type: 'MX',
        status: 'pass',
        records: mx
      });
    } catch (e) {
      results.checks.push({
        type: 'MX',
        status: 'fail',
        error: e.code
      });
      results.issues.push('No MX records found');
      results.score -= 30;
    }

    // Check SPF record
    try {
      const txt = await dns.resolveTxt(domain);
      const spf = txt.flat().find(r => r.startsWith('v=spf1'));
      if (spf) {
        results.checks.push({
          type: 'SPF',
          status: 'pass',
          record: spf
        });
      } else {
        results.checks.push({
          type: 'SPF',
          status: 'fail',
          error: 'No SPF record'
        });
        results.issues.push('Missing SPF record');
        results.score -= 20;
      }
    } catch (e) {
      results.checks.push({
        type: 'SPF',
        status: 'fail',
        error: e.code
      });
      results.issues.push('Could not verify SPF');
      results.score -= 20;
    }

    // Check DKIM (look for common selectors)
    const dkimSelectors = ['default', 'google', 'selector1', 'selector2', 'k1'];
    let dkimFound = false;
    
    for (const selector of dkimSelectors) {
      try {
        await dns.resolveTxt(`${selector}._domainkey.${domain}`);
        dkimFound = true;
        results.checks.push({
          type: 'DKIM',
          status: 'pass',
          selector
        });
        break;
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!dkimFound) {
      results.checks.push({
        type: 'DKIM',
        status: 'unknown',
        note: 'Could not find DKIM with common selectors'
      });
      results.issues.push('DKIM not detected (may use custom selector)');
      results.score -= 10;
    }

    // Check DMARC
    try {
      const dmarc = await dns.resolveTxt(`_dmarc.${domain}`);
      const dmarcRecord = dmarc.flat().find(r => r.startsWith('v=DMARC1'));
      if (dmarcRecord) {
        results.checks.push({
          type: 'DMARC',
          status: 'pass',
          record: dmarcRecord
        });
      } else {
        results.checks.push({
          type: 'DMARC',
          status: 'fail'
        });
        results.issues.push('Missing DMARC record');
        results.score -= 15;
      }
    } catch (e) {
      results.checks.push({
        type: 'DMARC',
        status: 'fail',
        error: e.code
      });
      results.issues.push('Missing DMARC record');
      results.score -= 15;
    }

    results.score = Math.max(0, results.score);
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
      
      // Save inbox stats
      const inboxStatsObj = {};
      for (const [email, stats] of this.inboxStats) {
        inboxStatsObj[email] = stats;
      }
      
      await fs.writeFile(
        path.join(this.dataDir, 'inbox-stats.json'),
        JSON.stringify(inboxStatsObj, null, 2),
        'utf8'
      );

      // Save domain stats
      const domainStatsObj = {};
      for (const [domain, stats] of this.domainStats) {
        domainStatsObj[domain] = stats;
      }
      
      await fs.writeFile(
        path.join(this.dataDir, 'domain-stats.json'),
        JSON.stringify(domainStatsObj, null, 2),
        'utf8'
      );

      // Save alerts
      await fs.writeFile(
        path.join(this.dataDir, 'alerts.json'),
        JSON.stringify(this.alerts, null, 2),
        'utf8'
      );

    } catch (error) {
      console.error('[DeliverabilityMonitor] Failed to save state:', error);
    }
  }

  /**
   * Load state from disk
   */
  async loadState() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const today = new Date().toISOString().split('T')[0];

      // Load inbox stats
      try {
        const data = await fs.readFile(path.join(this.dataDir, 'inbox-stats.json'), 'utf8');
        const stats = JSON.parse(data);
        for (const [email, stat] of Object.entries(stats)) {
          if (stat.date === today) {
            this.inboxStats.set(email, stat);
          }
        }
      } catch (e) {}

      // Load domain stats
      try {
        const data = await fs.readFile(path.join(this.dataDir, 'domain-stats.json'), 'utf8');
        const stats = JSON.parse(data);
        for (const [domain, stat] of Object.entries(stats)) {
          if (stat.date === today) {
            this.domainStats.set(domain, stat);
          }
        }
      } catch (e) {}

      // Load alerts (keep unresolved ones)
      try {
        const data = await fs.readFile(path.join(this.dataDir, 'alerts.json'), 'utf8');
        const alerts = JSON.parse(data);
        this.alerts = alerts.filter(a => !a.resolved);
      } catch (e) {}

    } catch (error) {
      console.error('[DeliverabilityMonitor] Failed to load state:', error);
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Extract domain from email
   */
  extractDomain(email) {
    return email?.split('@')[1]?.toLowerCase() || 'unknown';
  }

  /**
   * Cleanup
   */
  async destroy() {
    await this.saveState();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance = null;

function getDeliverabilityMonitor(options) {
  if (!instance) {
    instance = new DeliverabilityMonitor(options);
  }
  return instance;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  DeliverabilityMonitor,
  getDeliverabilityMonitor,
  THRESHOLDS,
  BOUNCE_TYPES,
  ALERT_SEVERITY
};
