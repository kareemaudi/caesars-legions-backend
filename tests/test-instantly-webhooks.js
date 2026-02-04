/**
 * Tests for Instantly Webhook Handler
 * Run: node tests/test-instantly-webhooks.js
 */

const path = require('path');
const { InstantlyWebhookHandler, EVENT_TYPES, BOUNCE_TYPES } = require('../lib/instantly-webhooks');
const { MetricsTracker } = require('../lib/metrics-tracker');

// ============================================================================
// TEST SETUP
// ============================================================================

const testDataDir = path.join(__dirname, '../data/test-webhooks');
let webhookHandler;
let metricsTracker;
let testResults = { passed: 0, failed: 0, tests: [] };

async function setup() {
  // Create fresh metrics tracker for testing
  metricsTracker = new MetricsTracker({ dataDir: testDataDir });
  
  webhookHandler = new InstantlyWebhookHandler({
    webhookSecret: 'test-secret-123',
    dataDir: testDataDir,
    metrics: metricsTracker
  });
}

function test(name, fn) {
  testResults.tests.push({ name, fn });
}

async function runTests() {
  console.log('\n🧪 Testing Instantly Webhook Handler\n');
  console.log('='.repeat(60));
  
  await setup();
  
  for (const { name, fn } of testResults.tests) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      testResults.passed++;
    } catch (error) {
      console.log(`❌ ${name}`);
      console.log(`   Error: ${error.message}`);
      testResults.failed++;
    }
  }
  
  console.log('='.repeat(60));
  console.log(`\n📊 Results: ${testResults.passed}/${testResults.passed + testResults.failed} passed\n`);
  
  return testResults.failed === 0;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// ============================================================================
// TESTS
// ============================================================================

// --- Basic Event Processing ---

test('should handle email_opened event', async () => {
  const event = {
    event_type: EVENT_TYPES.EMAIL_OPENED,
    event_id: 'open-001',
    data: {
      lead_email: 'test@example.com',
      campaign_id: 'camp-123',
      timestamp: Date.now(),
      email_account: 'sender@company.com',
      sequence_step: 1
    }
  };
  
  const result = await webhookHandler.handleWebhook(event);
  
  assert(result.success, 'Should return success');
  assert(result.eventType === EVENT_TYPES.EMAIL_OPENED, 'Should identify event type');
  assert(result.result.handled === true, 'Should mark as handled');
  assert(result.result.action === 'tracked_open', 'Should track open');
});

test('should handle link_clicked event', async () => {
  const event = {
    event_type: EVENT_TYPES.LINK_CLICKED,
    event_id: 'click-001',
    data: {
      lead_email: 'test@example.com',
      campaign_id: 'camp-123',
      link_url: 'https://example.com/demo',
      timestamp: Date.now()
    }
  };
  
  const result = await webhookHandler.handleWebhook(event);
  
  assert(result.success, 'Should return success');
  assert(result.result.action === 'tracked_click', 'Should track click');
  assert(result.result.link === 'https://example.com/demo', 'Should capture link');
});

test('should handle email_replied event', async () => {
  let callbackCalled = false;
  
  webhookHandler.callbacks.onReply = async (data) => {
    callbackCalled = true;
    assert(data.leadEmail === 'prospect@company.com', 'Should pass lead email');
    assert(data.sentiment === 'positive', 'Should pass sentiment');
  };
  
  const event = {
    event_type: EVENT_TYPES.EMAIL_REPLIED,
    event_id: 'reply-001',
    data: {
      lead_email: 'prospect@company.com',
      campaign_id: 'camp-123',
      reply_content: 'Yes, I would love to learn more!',
      sentiment: 'positive',
      timestamp: Date.now(),
      sequence_step: 2
    }
  };
  
  const result = await webhookHandler.handleWebhook(event);
  
  assert(result.success, 'Should return success');
  assert(result.result.action === 'tracked_reply', 'Should track reply');
  assert(result.result.needsReview === true, 'Should flag for review');
  assert(callbackCalled, 'Should call onReply callback');
});

test('should handle email_bounced event (hard bounce)', async () => {
  let bounceCallbackCalled = false;
  
  webhookHandler.callbacks.onBounce = async (data) => {
    bounceCallbackCalled = true;
    assert(data.bounceType === BOUNCE_TYPES.HARD, 'Should pass bounce type');
  };
  
  const event = {
    event_type: EVENT_TYPES.EMAIL_BOUNCED,
    event_id: 'bounce-001-hard',
    data: {
      lead_email: 'invalid@example.com',
      campaign_id: 'camp-123',
      bounce_type: BOUNCE_TYPES.HARD,
      bounce_reason: 'Mailbox does not exist',
      email_account: 'sender@company.com'
    }
  };
  
  const result = await webhookHandler.handleWebhook(event);
  
  assert(result.success === true, `Should return success, got: ${JSON.stringify(result)}`);
  assert(result.result.action === 'tracked_bounce', 'Should track bounce');
  assert(result.result.shouldRemove === true, 'Should flag for removal');
  assert(bounceCallbackCalled, 'Should call onBounce callback for hard bounce');
});

test('should handle email_bounced event (soft bounce)', async () => {
  let bounceCallbackCalled = false;
  webhookHandler.callbacks.onBounce = async () => { bounceCallbackCalled = true; };
  
  const event = {
    event_type: EVENT_TYPES.EMAIL_BOUNCED,
    event_id: 'bounce-002-soft',
    data: {
      lead_email: 'full@example.com',
      campaign_id: 'camp-123',
      bounce_type: BOUNCE_TYPES.SOFT,
      bounce_reason: 'Mailbox full',
      email_account: 'sender@company.com'
    }
  };
  
  const result = await webhookHandler.handleWebhook(event);
  
  assert(result.success === true, `Should return success, got: ${JSON.stringify(result)}`);
  assert(result.result.shouldRemove === false, 'Should not flag soft bounce for removal');
  assert(!bounceCallbackCalled, 'Should NOT call onBounce callback for soft bounce');
});

test('should handle email_unsubscribed event', async () => {
  let unsubCallbackCalled = false;
  
  webhookHandler.callbacks.onUnsubscribe = async (data) => {
    unsubCallbackCalled = true;
    assert(data.leadEmail === 'unsub@example.com', 'Should pass email');
  };
  
  const event = {
    event_type: EVENT_TYPES.EMAIL_UNSUBSCRIBED,
    event_id: 'unsub-001',
    data: {
      lead_email: 'unsub@example.com',
      campaign_id: 'camp-123',
      timestamp: Date.now()
    }
  };
  
  const result = await webhookHandler.handleWebhook(event);
  
  assert(result.success, 'Should return success');
  assert(result.result.action === 'tracked_unsubscribe', 'Should track unsubscribe');
  assert(result.result.addToSuppression === true, 'Should flag for suppression');
  assert(unsubCallbackCalled, 'Should call onUnsubscribe callback');
});

test('should handle lead_interested event', async () => {
  let interestedCallbackCalled = false;
  
  webhookHandler.callbacks.onInterested = async (data) => {
    interestedCallbackCalled = true;
    assert(data.confidence === 0.95, 'Should pass confidence score');
  };
  
  const event = {
    event_type: EVENT_TYPES.LEAD_INTERESTED,
    event_id: 'interested-001',
    data: {
      lead_email: 'hot-lead@bigcorp.com',
      campaign_id: 'camp-123',
      confidence_score: 0.95,
      timestamp: Date.now()
    }
  };
  
  const result = await webhookHandler.handleWebhook(event);
  
  assert(result.success, 'Should return success');
  assert(result.result.action === 'lead_qualified', 'Should qualify lead');
  assert(result.result.readyForSales === true, 'Should flag for sales');
  assert(interestedCallbackCalled, 'Should call onInterested callback');
});

// --- Deduplication ---

test('should deduplicate events with same event_id', async () => {
  const event = {
    event_type: EVENT_TYPES.EMAIL_OPENED,
    event_id: 'dedup-test-001',
    data: {
      lead_email: 'test@example.com',
      campaign_id: 'camp-123',
      timestamp: Date.now()
    }
  };
  
  // First call - should process
  const result1 = await webhookHandler.handleWebhook(event);
  assert(result1.success, 'First call should succeed');
  assert(!result1.skipped, 'First call should not be skipped');
  
  // Second call - should be deduplicated
  const result2 = await webhookHandler.handleWebhook(event);
  assert(result2.success, 'Second call should succeed');
  assert(result2.skipped === true, 'Second call should be skipped');
  assert(result2.reason === 'duplicate', 'Should indicate duplicate');
});

test('should generate consistent event_id when not provided', async () => {
  // Create new handler to reset dedup cache
  const freshHandler = new InstantlyWebhookHandler({
    dataDir: testDataDir,
    metrics: metricsTracker
  });
  
  const eventData = {
    event_type: EVENT_TYPES.EMAIL_OPENED,
    data: {
      lead_email: 'unique@example.com',
      campaign_id: 'camp-456',
      timestamp: 1234567890
    }
  };
  
  // First call
  const result1 = await freshHandler.handleWebhook(eventData);
  assert(result1.success, 'Should process');
  assert(result1.eventId, 'Should generate eventId');
  
  // Same event should be deduplicated
  const result2 = await freshHandler.handleWebhook(eventData);
  assert(result2.skipped === true, 'Should deduplicate generated ID');
});

// --- Signature Verification ---

test('should verify valid signature', () => {
  const crypto = require('crypto');
  const payload = JSON.stringify({ test: 'data' });
  const signature = crypto
    .createHmac('sha256', 'test-secret-123')
    .update(payload)
    .digest('hex');
  
  const valid = webhookHandler.verifySignature(payload, signature);
  assert(valid, 'Should verify valid signature');
});

test('should reject invalid signature', () => {
  const payload = JSON.stringify({ test: 'data' });
  const invalid = webhookHandler.verifySignature(payload, 'bad-signature');
  assert(!invalid, 'Should reject invalid signature');
});

test('should reject missing signature when secret is set', () => {
  const payload = JSON.stringify({ test: 'data' });
  const result = webhookHandler.verifySignature(payload, null);
  assert(!result, 'Should reject missing signature');
});

// --- Error Handling ---

test('should handle invalid event structure', async () => {
  const result = await webhookHandler.handleWebhook(null);
  assert(!result.success, 'Should fail for null');
  assert(result.error === 'Invalid event structure', 'Should indicate structure error');
});

test('should handle missing event_type', async () => {
  const result = await webhookHandler.handleWebhook({ data: {} });
  assert(!result.success, 'Should fail for missing event_type');
});

test('should handle unknown event_type gracefully', async () => {
  const event = {
    event_type: 'unknown_event_type',
    event_id: 'unknown-001',
    data: { some: 'data' }
  };
  
  const result = await webhookHandler.handleWebhook(event);
  assert(result.success, 'Should succeed but indicate not handled');
  assert(result.result.handled === false, 'Should not mark as handled');
});

// --- Metrics Integration ---

test('should track metrics for processed events', async () => {
  // Reset metrics
  const freshMetrics = new MetricsTracker({ dataDir: testDataDir });
  const freshHandler = new InstantlyWebhookHandler({
    dataDir: testDataDir,
    metrics: freshMetrics
  });
  
  // Process several events
  await freshHandler.handleWebhook({
    event_type: EVENT_TYPES.EMAIL_SENT,
    event_id: 'metrics-sent-001',
    data: { lead_email: 'a@test.com', campaign_id: 'camp' }
  });
  
  await freshHandler.handleWebhook({
    event_type: EVENT_TYPES.EMAIL_OPENED,
    event_id: 'metrics-open-001',
    data: { lead_email: 'a@test.com', campaign_id: 'camp' }
  });
  
  await freshHandler.handleWebhook({
    event_type: EVENT_TYPES.EMAIL_REPLIED,
    event_id: 'metrics-reply-001',
    data: { lead_email: 'a@test.com', campaign_id: 'camp', sentiment: 'positive' }
  });
  
  // Check metrics (use getCounters instead of getRealTimeStats)
  const counters = freshMetrics.getCounters();
  assert(counters.email_sent >= 1, 'Should track sends');
  assert(counters.email_opened >= 1, 'Should track opens');
  assert(counters.email_replied >= 1, 'Should track replies');
});

// --- Statistics ---

test('should return processing stats', () => {
  const stats = webhookHandler.getStats();
  assert(typeof stats.processedEventsInMemory === 'number', 'Should have event count');
  assert(typeof stats.queueLength === 'number', 'Should have queue length');
  assert(typeof stats.isProcessing === 'boolean', 'Should have processing status');
});

// ============================================================================
// RUN TESTS
// ============================================================================

runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
