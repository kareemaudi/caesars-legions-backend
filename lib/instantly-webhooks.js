/**
 * Instantly.ai Webhook Handler - Caesar's Legions
 * Processes email events from Instantly.ai (opens, clicks, replies, bounces)
 * 
 * Created: 2026-02-04
 * Purpose: Real-time event processing for campaign optimization
 * 
 * Instantly Webhook Events:
 * - email_opened: Recipient opened the email
 * - link_clicked: Recipient clicked a link
 * - email_replied: Recipient replied to the email
 * - email_bounced: Email bounced (hard/soft)
 * - email_unsubscribed: Recipient unsubscribed
 * - lead_interested: Lead marked as interested (via reply sentiment)
 * - lead_not_interested: Lead marked as not interested
 */

const crypto = require('crypto');
const { getMetricsTracker } = require('./metrics-tracker');
const { ABTestManager } = require('./ab-testing');

// ============================================================================
// CONSTANTS
// ============================================================================

const EVENT_TYPES = {
  EMAIL_OPENED: 'email_opened',
  LINK_CLICKED: 'link_clicked',
  EMAIL_REPLIED: 'email_replied',
  EMAIL_BOUNCED: 'email_bounced',
  EMAIL_UNSUBSCRIBED: 'email_unsubscribed',
  LEAD_INTERESTED: 'lead_interested',
  LEAD_NOT_INTERESTED: 'lead_not_interested',
  EMAIL_SENT: 'email_sent'
};

const BOUNCE_TYPES = {
  HARD: 'hard',
  SOFT: 'soft'
};

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

class InstantlyWebhookHandler {
  /**
   * @param {Object} options
   * @param {string} options.webhookSecret - Secret for validating webhook signatures
   * @param {string} options.dataDir - Directory for storing event data
   * @param {Function} options.onReply - Callback when reply is received
   * @param {Function} options.onBounce - Callback when email bounces
   * @param {Function} options.onInterested - Callback when lead is interested
   */
  constructor(options = {}) {
    this.webhookSecret = options.webhookSecret || process.env.INSTANTLY_WEBHOOK_SECRET;
    this.dataDir = options.dataDir || './data/webhooks';
    this.callbacks = {
      onReply: options.onReply || null,
      onBounce: options.onBounce || null,
      onInterested: options.onInterested || null,
      onUnsubscribe: options.onUnsubscribe || null
    };
    
    // Get shared instances
    this.metrics = options.metrics || getMetricsTracker();
    this.abTester = options.abTester || null;
    
    // Event queue for batch processing
    this.eventQueue = [];
    this.processing = false;
    
    // Rate limiting
    this.processedEvents = new Map(); // eventId -> timestamp (deduplication)
    this.eventTTL = 60 * 60 * 1000; // 1 hour deduplication window
  }

  // ==========================================================================
  // SIGNATURE VERIFICATION
  // ==========================================================================

  /**
   * Verify webhook signature from Instantly
   * @param {string} payload - Raw request body
   * @param {string} signature - Signature from headers
   * @returns {boolean}
   */
  verifySignature(payload, signature) {
    if (!this.webhookSecret) {
      console.warn('[Webhook] No webhook secret configured, skipping verification');
      return true;
    }
    
    if (!signature) {
      return false;
    }
    
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
    
    // Constant-time comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (e) {
      return false;
    }
  }

  // ==========================================================================
  // EVENT PROCESSING
  // ==========================================================================

  /**
   * Handle incoming webhook event
   * @param {Object} event - Webhook event payload
   * @param {Object} headers - Request headers
   * @returns {Object} Processing result
   */
  async handleWebhook(event, headers = {}) {
    const startTime = Date.now();
    
    try {
      // Validate event structure
      if (!event || !event.event_type) {
        return { success: false, error: 'Invalid event structure' };
      }
      
      // Generate event ID for deduplication
      const eventId = event.event_id || this._generateEventId(event);
      
      // Check for duplicate
      if (this._isDuplicate(eventId)) {
        return { success: true, skipped: true, reason: 'duplicate' };
      }
      
      // Mark as processed
      this._markProcessed(eventId);
      
      // Route to appropriate handler
      const result = await this._processEvent(event);
      
      // Track processing time
      const processingTime = Date.now() - startTime;
      this.metrics.trackEvent('webhook_processed', {
        eventType: event.event_type,
        processingTimeMs: processingTime
      });
      
      return {
        success: true,
        eventId,
        eventType: event.event_type,
        result,
        processingTimeMs: processingTime
      };
      
    } catch (error) {
      this.metrics.trackEvent('webhook_error', {
        eventType: event?.event_type,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process event based on type
   * @private
   */
  async _processEvent(event) {
    const { event_type, data } = event;
    
    switch (event_type) {
      case EVENT_TYPES.EMAIL_OPENED:
        return this._handleEmailOpened(data);
        
      case EVENT_TYPES.LINK_CLICKED:
        return this._handleLinkClicked(data);
        
      case EVENT_TYPES.EMAIL_REPLIED:
        return this._handleEmailReplied(data);
        
      case EVENT_TYPES.EMAIL_BOUNCED:
        return this._handleEmailBounced(data);
        
      case EVENT_TYPES.EMAIL_UNSUBSCRIBED:
        return this._handleUnsubscribed(data);
        
      case EVENT_TYPES.LEAD_INTERESTED:
        return this._handleLeadInterested(data);
        
      case EVENT_TYPES.LEAD_NOT_INTERESTED:
        return this._handleLeadNotInterested(data);
        
      case EVENT_TYPES.EMAIL_SENT:
        return this._handleEmailSent(data);
        
      default:
        console.log(`[Webhook] Unknown event type: ${event_type}`);
        return { handled: false, reason: 'unknown_event_type' };
    }
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  /**
   * Handle email opened event
   */
  async _handleEmailOpened(data) {
    const { lead_email, campaign_id, timestamp, email_account, sequence_step } = data;
    
    // Track metric
    this.metrics.track('email_opened', {
      campaignId: campaign_id,
      emailAccount: email_account,
      step: sequence_step
    });
    
    // Update A/B test if applicable
    if (this.abTester && data.variation_id) {
      await this.abTester.recordEvent(data.test_id, data.variation_id, 'open');
    }
    
    return {
      handled: true,
      action: 'tracked_open',
      lead: lead_email
    };
  }

  /**
   * Handle link clicked event
   */
  async _handleLinkClicked(data) {
    const { lead_email, campaign_id, link_url, timestamp } = data;
    
    // Track metric
    this.metrics.track('email_clicked', {
      campaignId: campaign_id,
      linkUrl: link_url
    });
    
    // Update A/B test if applicable
    if (this.abTester && data.variation_id) {
      await this.abTester.recordEvent(data.test_id, data.variation_id, 'click');
    }
    
    return {
      handled: true,
      action: 'tracked_click',
      lead: lead_email,
      link: link_url
    };
  }

  /**
   * Handle email replied event - IMPORTANT: This is a conversion signal
   */
  async _handleEmailReplied(data) {
    const { 
      lead_email, 
      campaign_id, 
      reply_content, 
      sentiment,
      timestamp,
      sequence_step 
    } = data;
    
    // Track metric
    this.metrics.track('email_replied', {
      campaignId: campaign_id,
      sentiment: sentiment || 'unknown',
      step: sequence_step
    });
    
    // Update A/B test if applicable
    if (this.abTester && data.variation_id) {
      await this.abTester.recordEvent(data.test_id, data.variation_id, 'reply');
    }
    
    // Trigger callback for human/agent review
    if (this.callbacks.onReply) {
      await this.callbacks.onReply({
        leadEmail: lead_email,
        campaignId: campaign_id,
        replyContent: reply_content,
        sentiment,
        timestamp
      });
    }
    
    return {
      handled: true,
      action: 'tracked_reply',
      lead: lead_email,
      sentiment,
      needsReview: true
    };
  }

  /**
   * Handle email bounced event
   */
  async _handleEmailBounced(data) {
    const { lead_email, campaign_id, bounce_type, bounce_reason, email_account } = data;
    
    // Track metric
    this.metrics.track('email_bounced', {
      campaignId: campaign_id,
      bounceType: bounce_type,
      emailAccount: email_account
    });
    
    // Check if error rate is too high (use counters for real-time check)
    const counters = this.metrics.getCounters();
    const totalSent = counters.email_sent || 1;
    const totalBounced = counters.email_bounced || 0;
    const bounceRate = totalBounced / totalSent;
    
    if (bounceRate > 0.05) { // >5% bounce rate
      this.metrics.trackEvent('high_bounce_rate_alert', 'triggered', {
        rate: bounceRate,
        campaignId: campaign_id
      });
    }
    
    // Trigger callback for hard bounces (need to remove from list)
    if (bounce_type === BOUNCE_TYPES.HARD && this.callbacks.onBounce) {
      await this.callbacks.onBounce({
        leadEmail: lead_email,
        campaignId: campaign_id,
        bounceType: bounce_type,
        reason: bounce_reason
      });
    }
    
    return {
      handled: true,
      action: 'tracked_bounce',
      lead: lead_email,
      type: bounce_type,
      shouldRemove: bounce_type === BOUNCE_TYPES.HARD
    };
  }

  /**
   * Handle unsubscribe event
   */
  async _handleUnsubscribed(data) {
    const { lead_email, campaign_id, timestamp } = data;
    
    // Track metric
    this.metrics.track('email_unsubscribed', {
      campaignId: campaign_id
    });
    
    // Trigger callback to add to suppression list
    if (this.callbacks.onUnsubscribe) {
      await this.callbacks.onUnsubscribe({
        leadEmail: lead_email,
        campaignId: campaign_id,
        timestamp
      });
    }
    
    return {
      handled: true,
      action: 'tracked_unsubscribe',
      lead: lead_email,
      addToSuppression: true
    };
  }

  /**
   * Handle lead marked as interested
   */
  async _handleLeadInterested(data) {
    const { lead_email, campaign_id, confidence_score, timestamp } = data;
    
    // Track metric
    this.metrics.track('lead_qualified', {
      campaignId: campaign_id,
      confidence: confidence_score
    });
    
    // Update A/B test if applicable (count as conversion)
    if (this.abTester && data.variation_id) {
      await this.abTester.recordEvent(data.test_id, data.variation_id, 'conversion');
    }
    
    // Trigger callback for sales handoff
    if (this.callbacks.onInterested) {
      await this.callbacks.onInterested({
        leadEmail: lead_email,
        campaignId: campaign_id,
        confidence: confidence_score,
        timestamp
      });
    }
    
    return {
      handled: true,
      action: 'lead_qualified',
      lead: lead_email,
      confidence: confidence_score,
      readyForSales: true
    };
  }

  /**
   * Handle lead marked as not interested
   */
  async _handleLeadNotInterested(data) {
    const { lead_email, campaign_id, reason, timestamp } = data;
    
    // Track metric  
    this.metrics.trackEvent('lead_not_interested', {
      campaignId: campaign_id,
      reason
    });
    
    return {
      handled: true,
      action: 'lead_disqualified',
      lead: lead_email,
      reason
    };
  }

  /**
   * Handle email sent event (useful for tracking send success)
   */
  async _handleEmailSent(data) {
    const { lead_email, campaign_id, email_account, sequence_step } = data;
    
    // Track metric
    this.metrics.track('email_sent', {
      campaignId: campaign_id,
      emailAccount: email_account,
      step: sequence_step
    });
    
    return {
      handled: true,
      action: 'tracked_sent',
      lead: lead_email
    };
  }

  // ==========================================================================
  // DEDUPLICATION
  // ==========================================================================

  /**
   * Check if event was already processed
   * @private
   */
  _isDuplicate(eventId) {
    const processed = this.processedEvents.get(eventId);
    if (!processed) return false;
    
    // Check if within TTL
    if (Date.now() - processed < this.eventTTL) {
      return true;
    }
    
    // Expired, remove and allow reprocessing
    this.processedEvents.delete(eventId);
    return false;
  }

  /**
   * Mark event as processed
   * @private
   */
  _markProcessed(eventId) {
    this.processedEvents.set(eventId, Date.now());
    
    // Cleanup old entries periodically
    if (this.processedEvents.size > 10000) {
      this._cleanupProcessedEvents();
    }
  }

  /**
   * Remove expired entries from deduplication cache
   * @private
   */
  _cleanupProcessedEvents() {
    const now = Date.now();
    for (const [eventId, timestamp] of this.processedEvents) {
      if (now - timestamp > this.eventTTL) {
        this.processedEvents.delete(eventId);
      }
    }
  }

  /**
   * Generate event ID from event data
   * @private
   */
  _generateEventId(event) {
    const key = `${event.event_type}-${event.data?.lead_email}-${event.data?.timestamp || Date.now()}`;
    return crypto.createHash('md5').update(key).digest('hex');
  }

  // ==========================================================================
  // EXPRESS MIDDLEWARE
  // ==========================================================================

  /**
   * Express middleware for handling webhooks
   * @returns {Function} Express middleware
   */
  middleware() {
    return async (req, res) => {
      try {
        // Verify signature
        const signature = req.headers['x-instantly-signature'] || 
                         req.headers['x-webhook-signature'];
        
        if (this.webhookSecret && !this.verifySignature(JSON.stringify(req.body), signature)) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
        
        // Process event
        const result = await this.handleWebhook(req.body, req.headers);
        
        if (result.success) {
          res.status(200).json(result);
        } else {
          res.status(400).json(result);
        }
        
      } catch (error) {
        console.error('[Webhook] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    };
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get webhook processing statistics
   */
  getStats() {
    return {
      processedEventsInMemory: this.processedEvents.size,
      queueLength: this.eventQueue.length,
      isProcessing: this.processing
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance = null;

function getInstance(options = {}) {
  if (!instance) {
    instance = new InstantlyWebhookHandler(options);
  }
  return instance;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  InstantlyWebhookHandler,
  getInstance,
  EVENT_TYPES,
  BOUNCE_TYPES
};
