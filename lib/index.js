// ============================================================================
// CAESAR'S LEGIONS - Core Library
// ============================================================================
// Unified entry point for all campaign management modules
// ============================================================================

// Email Generation & Sending
const { EmailGenerator, TONE, EMAIL_TYPE } = require('./email-generator');
const { EmailSender } = require('./email-sender');

// Campaign Management
const { FollowUpManager, FOLLOW_UP_TRIGGERS } = require('./follow-ups');
const { ABTestManager, TEST_TYPES, METRICS: AB_METRICS, TEST_TEMPLATES } = require('./ab-testing');

// Inbox Infrastructure (replaces Instantly)
const warmup = require('./warmup');
const { WarmupScheduler } = warmup;
const { InboxRotationManager } = warmup;
const { DeliverabilityMonitor } = warmup;
const { WarmupEmailGenerator } = warmup;

// Analytics & Classification
const { ReplyClassifier, SENTIMENT, INTENT, PRIORITY } = require('./reply-classifier');
const { getMetricsTracker, METRIC_TYPES } = require('./metrics-tracker');

// Lead Generation
const { XLeadScraper } = require('./x-lead-scraper');

// Client Management
const { ClientOnboarding } = require('./client-onboarding');

// ============================================================================
// CONVENIENCE FACTORY
// ============================================================================

/**
 * Create a fully configured Caesar's Legions instance
 * @param {Object} config - Configuration options
 * @returns {Object} Configured instance with all modules
 */
function createCaesar(config = {}) {
  const metrics = getMetricsTracker();
  
  return {
    // Core email operations
    emailGenerator: new EmailGenerator(config.openai || {}),
    emailSender: new EmailSender(config.smtp || {}),
    
    // Campaign automation
    followUps: new FollowUpManager(config.db, { metrics }),
    abTesting: new ABTestManager(config.db, { metrics }),
    
    // Inbox management (our own infrastructure)
    warmup: {
      scheduler: new WarmupScheduler(config.warmup || {}),
      rotation: new InboxRotationManager(config.inboxes || []),
      monitor: new DeliverabilityMonitor(config.deliverability || {}),
      emailGen: new WarmupEmailGenerator()
    },
    
    // Analytics
    replyClassifier: new ReplyClassifier(config.classifier || {}),
    metrics,
    
    // Lead gen
    leadScraper: new XLeadScraper(config.twitter || {}),
    
    // Client ops
    onboarding: new ClientOnboarding(config.db, config.stripe || {})
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Factory
  createCaesar,
  
  // Email
  EmailGenerator,
  EmailSender,
  TONE,
  EMAIL_TYPE,
  
  // Campaigns
  FollowUpManager,
  FOLLOW_UP_TRIGGERS,
  ABTestManager,
  TEST_TYPES,
  AB_METRICS,
  TEST_TEMPLATES,
  
  // Warmup (replaces Instantly $37/mo)
  warmup,
  WarmupScheduler,
  InboxRotationManager,
  DeliverabilityMonitor,
  WarmupEmailGenerator,
  
  // Analytics
  ReplyClassifier,
  SENTIMENT,
  INTENT,
  PRIORITY,
  getMetricsTracker,
  METRIC_TYPES,
  
  // Leads
  XLeadScraper,
  
  // Clients
  ClientOnboarding
};

// ============================================================================
// QUICK START
// ============================================================================
/*

const { createCaesar } = require('./lib');

const caesar = createCaesar({
  openai: { apiKey: process.env.OPENAI_API_KEY },
  smtp: { 
    host: 'smtp.example.com',
    auth: { user: 'x', pass: 'y' }
  },
  inboxes: [
    { email: 'sales1@domain.com', smtp: {...} },
    { email: 'sales2@domain.com', smtp: {...} }
  ],
  db: yourDatabaseConnection,
  stripe: { apiKey: process.env.STRIPE_SECRET_KEY }
});

// Generate personalized email
const email = await caesar.emailGenerator.generate({
  prospect: { name: 'John', company: 'Acme' },
  tone: 'professional'
});

// Send through rotated inbox
const inbox = await caesar.warmup.rotation.getNextInbox();
await caesar.emailSender.send(email, { from: inbox });

// Classify replies
const classification = await caesar.replyClassifier.classify(replyText);
if (classification.priority === 'hot') {
  // Alert immediately
}

// Track everything
caesar.metrics.trackEmail('sent', { campaignId: 'abc' });

*/
