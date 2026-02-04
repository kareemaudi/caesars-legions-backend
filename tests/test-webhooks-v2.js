/**
 * Test Suite: Webhooks v2 Integration
 * Tests the new webhooks handler with metrics integration
 */

const path = require('path');
const fs = require('fs');

// Set up test environment
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = path.join(__dirname, '..', 'data', 'test');

// Ensure test data directory exists
const testDataDir = path.join(__dirname, '..', 'data', 'test');
if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true });
}

const { setupWebhookRoutes, getHandler, EVENT_TYPES } = require('../api/webhooks-v2');

// Simple test framework
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// ============================================================================
// TESTS
// ============================================================================

console.log('\n🧪 Testing Webhooks v2 Integration\n');

// Test 1: Handler initialization
test('Handler initializes correctly', () => {
  const handler = getHandler();
  assert(handler !== null, 'Handler should not be null');
  assert(typeof handler.handleWebhook === 'function', 'Should have handleWebhook method');
  assert(typeof handler.middleware === 'function', 'Should have middleware method');
});

// Test 2: Event types exist
test('Event types are exported', () => {
  assert(EVENT_TYPES.EMAIL_OPENED === 'email_opened', 'EMAIL_OPENED should be defined');
  assert(EVENT_TYPES.EMAIL_REPLIED === 'email_replied', 'EMAIL_REPLIED should be defined');
  assert(EVENT_TYPES.EMAIL_BOUNCED === 'email_bounced', 'EMAIL_BOUNCED should be defined');
});

// Test 3: Handle email opened event
test('Handles email_opened event', async () => {
  const handler = getHandler();
  const event = {
    event_type: 'email_opened',
    data: {
      lead_email: 'test@example.com',
      campaign_id: 'test-campaign',
      timestamp: new Date().toISOString()
    }
  };
  
  const result = await handler.handleWebhook(event, {});
  assert(result.success === true, 'Should return success');
});

// Test 4: Handle email clicked event
test('Handles email_clicked event', async () => {
  const handler = getHandler();
  const event = {
    event_type: 'link_clicked',
    data: {
      lead_email: 'click@example.com',
      campaign_id: 'test-campaign',
      url: 'https://example.com/demo',
      timestamp: new Date().toISOString()
    }
  };
  
  const result = await handler.handleWebhook(event, {});
  assert(result.success === true, 'Should return success');
});

// Test 5: Handle bounce event
test('Handles email_bounced event', async () => {
  const handler = getHandler();
  const event = {
    event_type: 'email_bounced',
    data: {
      lead_email: 'bounced@example.com',
      campaign_id: 'test-campaign',
      bounce_type: 'hard',
      timestamp: new Date().toISOString()
    }
  };
  
  const result = await handler.handleWebhook(event, {});
  assert(result.success === true, 'Should return success');
});

// Test 6: Handle reply event
test('Handles email_replied event', async () => {
  const handler = getHandler();
  const event = {
    event_type: 'email_replied',
    data: {
      lead_email: 'replied@example.com',
      campaign_id: 'test-campaign',
      reply_body: 'Thanks for reaching out! I would love to learn more about your cold email services.',
      timestamp: new Date().toISOString()
    }
  };
  
  const result = await handler.handleWebhook(event, {});
  assert(result.success === true, 'Should return success');
});

// Test 7: Handle unknown event type gracefully
test('Handles unknown event type gracefully', async () => {
  const handler = getHandler();
  const event = {
    event_type: 'unknown_event_xyz',
    data: {
      lead_email: 'unknown@example.com',
      timestamp: new Date().toISOString()
    }
  };
  
  const result = await handler.handleWebhook(event, {});
  // Should not throw, should return success (logged but not processed)
  assert(result !== null, 'Should return a result');
});

// Test 8: Stats method works
test('Stats method returns expected shape', () => {
  const handler = getHandler();
  const stats = handler.getStats();
  
  assert(typeof stats.processedEventsInMemory === 'number', 'Should have processedEventsInMemory');
  assert(typeof stats.queueLength === 'number', 'Should have queueLength');
  assert(typeof stats.isProcessing === 'boolean', 'Should have isProcessing');
});

// Test 9: Middleware returns function
test('Middleware returns a function', () => {
  const handler = getHandler();
  const middleware = handler.middleware();
  
  assert(typeof middleware === 'function', 'Middleware should be a function');
  assert(middleware.length === 2 || middleware.length === 3, 'Middleware should accept (req, res) or (req, res, next)');
});

// Test 10: Mock Express route setup
test('setupWebhookRoutes configures app', () => {
  const routes = [];
  const mockApp = {
    get: (path, handler) => routes.push({ method: 'GET', path }),
    post: (path, handler) => routes.push({ method: 'POST', path })
  };
  
  setupWebhookRoutes(mockApp);
  
  // Check expected routes
  const postRoutes = routes.filter(r => r.method === 'POST');
  const getRoutes = routes.filter(r => r.method === 'GET');
  
  assert(postRoutes.length >= 1, 'Should have at least 1 POST route');
  assert(getRoutes.length >= 1, 'Should have at least 1 GET route');
  
  const hasInstantlyRoute = routes.some(r => r.path.includes('instantly'));
  assert(hasInstantlyRoute, 'Should have instantly webhook route');
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(50));
console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log('='.repeat(50) + '\n');

// Cleanup test data
try {
  fs.rmSync(testDataDir, { recursive: true, force: true });
} catch {}

process.exit(failed > 0 ? 1 : 0);
