/**
 * Metrics Tracker - Caesar's Legions
 * Real-time tracking of system performance and campaign metrics
 * 
 * Created: 2026-02-04
 * Purpose: Central metrics collection for dashboard + alerting
 */

const fs = require('fs').promises;
const path = require('path');

// ============================================================================
// METRIC TYPES
// ============================================================================

const METRIC_TYPES = {
  // Campaign metrics
  EMAIL_SENT: 'email_sent',
  EMAIL_OPENED: 'email_opened',
  EMAIL_CLICKED: 'email_clicked',
  EMAIL_REPLIED: 'email_replied',
  EMAIL_BOUNCED: 'email_bounced',
  EMAIL_UNSUBSCRIBED: 'email_unsubscribed',
  
  // Lead metrics
  LEAD_ADDED: 'lead_added',
  LEAD_QUALIFIED: 'lead_qualified',
  LEAD_CONVERTED: 'lead_converted',
  
  // Client metrics
  CLIENT_ONBOARDED: 'client_onboarded',
  CLIENT_CHURNED: 'client_churned',
  PAYMENT_RECEIVED: 'payment_received',
  
  // System metrics
  API_REQUEST: 'api_request',
  API_ERROR: 'api_error',
  FOLLOW_UP_SENT: 'follow_up_sent',
  AB_TEST_CREATED: 'ab_test_created',
  AB_TEST_CONCLUDED: 'ab_test_concluded'
};

// ============================================================================
// METRICS TRACKER
// ============================================================================

class MetricsTracker {
  /**
   * @param {Object} options
   * @param {string} options.dataDir - Directory to store metrics files
   * @param {number} options.flushIntervalMs - How often to flush to disk
   */
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, '../data/metrics');
    this.flushIntervalMs = options.flushIntervalMs || 60000; // 1 minute
    this.buffer = [];
    this.counters = {};
    this.startTime = new Date();
    
    // Periodic flush to disk
    this.flushInterval = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  /**
   * Track a metric event
   * @param {string} type - Metric type from METRIC_TYPES
   * @param {Object} data - Additional data
   * @param {Object} tags - Tags for filtering/grouping
   */
  track(type, data = {}, tags = {}) {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      data,
      tags,
      sessionId: this.getSessionId()
    };

    this.buffer.push(event);
    this.incrementCounter(type, tags);

    // Real-time logging for important events
    if (this.isHighPriorityEvent(type)) {
      console.log(`[METRIC] ${type}:`, JSON.stringify(data));
    }

    return event;
  }

  /**
   * Track email sent
   * @param {Object} email - Email data
   */
  trackEmailSent(email) {
    return this.track(METRIC_TYPES.EMAIL_SENT, {
      campaignId: email.campaignId,
      recipientDomain: this.extractDomain(email.to),
      subjectLength: email.subject?.length || 0,
      bodyLength: email.body?.length || 0
    }, {
      clientId: email.clientId,
      templateId: email.templateId
    });
  }

  /**
   * Track email opened
   * @param {Object} event - Webhook event data
   */
  trackEmailOpened(event) {
    return this.track(METRIC_TYPES.EMAIL_OPENED, {
      campaignId: event.campaignId,
      recipientEmail: event.email,
      openedAt: event.timestamp,
      deviceType: event.device || 'unknown'
    }, {
      clientId: event.clientId
    });
  }

  /**
   * Track email reply
   * @param {Object} event - Reply event data
   */
  trackEmailReplied(event) {
    return this.track(METRIC_TYPES.EMAIL_REPLIED, {
      campaignId: event.campaignId,
      recipientEmail: event.email,
      sentiment: event.sentiment || 'neutral',
      replyLength: event.replyLength || 0
    }, {
      clientId: event.clientId,
      isPositive: event.sentiment === 'positive'
    });
  }

  /**
   * Track new client onboarding
   * @param {Object} client - Client data
   */
  trackClientOnboarded(client) {
    return this.track(METRIC_TYPES.CLIENT_ONBOARDED, {
      clientId: client.id,
      plan: client.plan,
      mrr: client.mrr || 0,
      industry: client.industry
    }, {
      source: client.source,
      referrer: client.referrer
    });
  }

  /**
   * Track payment received
   * @param {Object} payment - Payment data
   */
  trackPaymentReceived(payment) {
    return this.track(METRIC_TYPES.PAYMENT_RECEIVED, {
      clientId: payment.clientId,
      amount: payment.amount,
      currency: payment.currency || 'USD',
      type: payment.type // 'subscription' or 'one_time'
    }, {
      plan: payment.plan
    });
  }

  /**
   * Track API request (for rate limiting awareness)
   * @param {Object} request - Request data
   */
  trackApiRequest(request) {
    return this.track(METRIC_TYPES.API_REQUEST, {
      endpoint: request.endpoint,
      method: request.method,
      statusCode: request.statusCode,
      latencyMs: request.latencyMs
    }, {
      service: request.service // 'openai', 'instantly', 'apollo'
    });
  }

  /**
   * Track API error
   * @param {Object} error - Error data
   */
  trackApiError(error) {
    return this.track(METRIC_TYPES.API_ERROR, {
      service: error.service,
      endpoint: error.endpoint,
      errorCode: error.code,
      errorMessage: error.message?.substring(0, 200)
    }, {
      severity: error.severity || 'error'
    });
  }

  /**
   * Generic event tracking for extensibility
   * @param {string} category - Event category (e.g., 'ab_test', 'webhook')
   * @param {string} action - Event action (e.g., 'test_created', 'received')
   * @param {Object} data - Event data
   * @param {Object} meta - Optional metadata
   */
  trackEvent(category, action, data = {}, meta = {}) {
    const eventType = `${category}_${action}`;
    return this.track(eventType, data, meta);
  }

  // ============================================================================
  // AGGREGATION
  // ============================================================================

  /**
   * Get current counters
   * @returns {Object} Counter values
   */
  getCounters() {
    return { ...this.counters };
  }

  /**
   * Get metrics summary for a time period
   * @param {string} period - 'hour', 'day', 'week', 'month'
   * @returns {Object} Aggregated metrics
   */
  async getSummary(period = 'day') {
    const now = new Date();
    const periodMs = this.getPeriodMs(period);
    const cutoff = new Date(now.getTime() - periodMs);

    const events = await this.loadEvents(cutoff);
    
    return {
      period,
      from: cutoff.toISOString(),
      to: now.toISOString(),
      totals: this.aggregateTotals(events),
      byType: this.aggregateByType(events),
      byClient: this.aggregateByClient(events),
      rates: this.calculateRates(events)
    };
  }

  /**
   * Get real-time dashboard data
   * @returns {Object} Dashboard metrics
   */
  async getDashboardMetrics() {
    const hourSummary = await this.getSummary('hour');
    const daySummary = await this.getSummary('day');
    
    return {
      realtime: {
        uptime_seconds: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
        buffer_size: this.buffer.length,
        counters: this.getCounters()
      },
      last_hour: {
        emails_sent: this.countByType(hourSummary.byType, METRIC_TYPES.EMAIL_SENT),
        emails_opened: this.countByType(hourSummary.byType, METRIC_TYPES.EMAIL_OPENED),
        emails_replied: this.countByType(hourSummary.byType, METRIC_TYPES.EMAIL_REPLIED),
        errors: this.countByType(hourSummary.byType, METRIC_TYPES.API_ERROR)
      },
      last_24h: {
        emails_sent: this.countByType(daySummary.byType, METRIC_TYPES.EMAIL_SENT),
        open_rate: daySummary.rates.open_rate,
        reply_rate: daySummary.rates.reply_rate,
        bounce_rate: daySummary.rates.bounce_rate
      }
    };
  }

  // ============================================================================
  // ALERTING
  // ============================================================================

  /**
   * Check for alertable conditions
   * @returns {Array} Active alerts
   */
  async checkAlerts() {
    const alerts = [];
    const summary = await this.getSummary('hour');

    // High error rate
    const errorRate = this.calculateErrorRate(summary);
    if (errorRate > 0.1) { // More than 10% errors
      alerts.push({
        type: 'HIGH_ERROR_RATE',
        severity: 'warning',
        message: `Error rate is ${(errorRate * 100).toFixed(1)}% in the last hour`,
        value: errorRate
      });
    }

    // High bounce rate
    if (summary.rates.bounce_rate > 0.05) { // More than 5% bounces
      alerts.push({
        type: 'HIGH_BOUNCE_RATE',
        severity: 'warning',
        message: `Bounce rate is ${(summary.rates.bounce_rate * 100).toFixed(1)}%`,
        value: summary.rates.bounce_rate
      });
    }

    // Low open rate
    if (summary.rates.open_rate < 0.1 && summary.totals.emails_sent > 100) {
      alerts.push({
        type: 'LOW_OPEN_RATE',
        severity: 'info',
        message: `Open rate is only ${(summary.rates.open_rate * 100).toFixed(1)}%`,
        value: summary.rates.open_rate
      });
    }

    return alerts;
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  /**
   * Flush buffered events to disk
   */
  async flush() {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      await this.ensureDataDir();
      
      const filename = this.getMetricsFilename();
      const filepath = path.join(this.dataDir, filename);
      
      const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.appendFile(filepath, lines, 'utf8');
      
    } catch (error) {
      console.error('Failed to flush metrics:', error);
      // Re-add events to buffer for retry
      this.buffer.unshift(...events);
    }
  }

  /**
   * Load events from disk for a time period
   * @param {Date} since - Load events after this time
   * @returns {Array} Events
   */
  async loadEvents(since) {
    const events = [];
    
    try {
      await this.ensureDataDir();
      const files = await fs.readdir(this.dataDir);
      
      for (const file of files) {
        if (!file.startsWith('metrics-') || !file.endsWith('.jsonl')) continue;
        
        const filepath = path.join(this.dataDir, file);
        const content = await fs.readFile(filepath, 'utf8');
        
        content.split('\n').filter(Boolean).forEach(line => {
          try {
            const event = JSON.parse(line);
            if (new Date(event.timestamp) >= since) {
              events.push(event);
            }
          } catch (e) {
            // Skip malformed lines
          }
        });
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }

    return events;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  getSessionId() {
    if (!this._sessionId) {
      this._sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return this._sessionId;
  }

  extractDomain(email) {
    return email?.split('@')[1] || 'unknown';
  }

  isHighPriorityEvent(type) {
    return [
      METRIC_TYPES.API_ERROR,
      METRIC_TYPES.EMAIL_BOUNCED,
      METRIC_TYPES.CLIENT_ONBOARDED,
      METRIC_TYPES.PAYMENT_RECEIVED
    ].includes(type);
  }

  incrementCounter(type, tags = {}) {
    // Always increment the base type counter
    this.counters[type] = (this.counters[type] || 0) + 1;
    
    // If there's a clientId, also increment a client-specific counter
    if (tags.clientId) {
      const clientKey = `${type}:${tags.clientId}`;
      this.counters[clientKey] = (this.counters[clientKey] || 0) + 1;
    }
  }

  getPeriodMs(period) {
    const periods = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000
    };
    return periods[period] || periods.day;
  }

  getMetricsFilename() {
    const date = new Date().toISOString().split('T')[0];
    return `metrics-${date}.jsonl`;
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  aggregateTotals(events) {
    return {
      total_events: events.length,
      emails_sent: events.filter(e => e.type === METRIC_TYPES.EMAIL_SENT).length,
      emails_opened: events.filter(e => e.type === METRIC_TYPES.EMAIL_OPENED).length,
      emails_replied: events.filter(e => e.type === METRIC_TYPES.EMAIL_REPLIED).length,
      emails_bounced: events.filter(e => e.type === METRIC_TYPES.EMAIL_BOUNCED).length
    };
  }

  aggregateByType(events) {
    const byType = {};
    events.forEach(e => {
      byType[e.type] = (byType[e.type] || 0) + 1;
    });
    return byType;
  }

  aggregateByClient(events) {
    const byClient = {};
    events.forEach(e => {
      const clientId = e.tags?.clientId || 'unknown';
      if (!byClient[clientId]) {
        byClient[clientId] = { total: 0, types: {} };
      }
      byClient[clientId].total++;
      byClient[clientId].types[e.type] = (byClient[clientId].types[e.type] || 0) + 1;
    });
    return byClient;
  }

  calculateRates(events) {
    const sent = events.filter(e => e.type === METRIC_TYPES.EMAIL_SENT).length;
    const opened = events.filter(e => e.type === METRIC_TYPES.EMAIL_OPENED).length;
    const replied = events.filter(e => e.type === METRIC_TYPES.EMAIL_REPLIED).length;
    const bounced = events.filter(e => e.type === METRIC_TYPES.EMAIL_BOUNCED).length;

    return {
      open_rate: sent > 0 ? opened / sent : 0,
      reply_rate: sent > 0 ? replied / sent : 0,
      bounce_rate: sent > 0 ? bounced / sent : 0
    };
  }

  countByType(byType, type) {
    return byType[type] || 0;
  }

  calculateErrorRate(summary) {
    const total = summary.totals.total_events;
    const errors = summary.byType[METRIC_TYPES.API_ERROR] || 0;
    return total > 0 ? errors / total : 0;
  }

  /**
   * Cleanup - stop flush interval
   */
  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    return this.flush(); // Final flush
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance = null;

function getMetricsTracker(options) {
  if (!instance) {
    instance = new MetricsTracker(options);
  }
  return instance;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  MetricsTracker,
  getMetricsTracker,
  METRIC_TYPES
};

// ============================================================================
// USAGE EXAMPLE
// ============================================================================
/*

const { getMetricsTracker, METRIC_TYPES } = require('./metrics-tracker');

// Get singleton instance
const metrics = getMetricsTracker();

// Track email sent
metrics.trackEmailSent({
  campaignId: 'camp_123',
  clientId: 'client_456',
  to: 'founder@startup.com',
  subject: 'Quick question about scaling',
  body: 'Hi...'
});

// Track API request
metrics.trackApiRequest({
  endpoint: '/v1/chat/completions',
  method: 'POST',
  service: 'openai',
  statusCode: 200,
  latencyMs: 1234
});

// Get dashboard data
const dashboard = await metrics.getDashboardMetrics();
console.log(dashboard);

// Check for alerts
const alerts = await metrics.checkAlerts();
if (alerts.length > 0) {
  // Send to Telegram
  alerts.forEach(alert => console.log(`⚠️ ${alert.message}`));
}

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  await metrics.destroy();
  process.exit(0);
});

*/
