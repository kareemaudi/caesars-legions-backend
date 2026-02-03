/**
 * Tests for Metrics Tracker
 */

const { MetricsTracker, METRIC_TYPES } = require('../lib/metrics-tracker');
const path = require('path');
const fs = require('fs').promises;

// Test directory
const TEST_DATA_DIR = path.join(__dirname, '../data/metrics-test');

// Test utilities
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    passCount++;
  } else {
    console.log(`✗ ${message}`);
    failCount++;
  }
}

async function cleanup() {
  try {
    const files = await fs.readdir(TEST_DATA_DIR);
    for (const file of files) {
      await fs.unlink(path.join(TEST_DATA_DIR, file));
    }
    await fs.rmdir(TEST_DATA_DIR);
  } catch (e) {
    // Directory might not exist
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('METRICS TRACKER TESTS');
  console.log('='.repeat(60));
  
  await cleanup();

  // ============================================================================
  // Test 1: Initialization
  // ============================================================================
  console.log('\n--- Test 1: Initialization ---');
  
  const metrics = new MetricsTracker({
    dataDir: TEST_DATA_DIR,
    flushIntervalMs: 100000 // Long interval, we'll flush manually
  });
  
  assert(metrics !== null, 'MetricsTracker instance created');
  assert(metrics.buffer.length === 0, 'Buffer starts empty');
  assert(Object.keys(metrics.counters).length === 0, 'Counters start empty');

  // ============================================================================
  // Test 2: Track Email Events
  // ============================================================================
  console.log('\n--- Test 2: Track Email Events ---');
  
  const emailEvent = metrics.trackEmailSent({
    campaignId: 'camp_test_123',
    clientId: 'client_test_456',
    to: 'test@example.com',
    subject: 'Test Subject',
    body: 'Test body content'
  });
  
  assert(emailEvent.type === METRIC_TYPES.EMAIL_SENT, 'Email sent event has correct type');
  assert(emailEvent.data.campaignId === 'camp_test_123', 'Campaign ID captured');
  assert(emailEvent.data.recipientDomain === 'example.com', 'Domain extracted correctly');
  assert(metrics.buffer.length === 1, 'Event added to buffer');

  // Track more events
  metrics.trackEmailOpened({
    campaignId: 'camp_test_123',
    clientId: 'client_test_456',
    email: 'test@example.com',
    timestamp: new Date().toISOString()
  });
  
  metrics.trackEmailReplied({
    campaignId: 'camp_test_123',
    clientId: 'client_test_456',
    email: 'test@example.com',
    sentiment: 'positive',
    replyLength: 150
  });
  
  assert(metrics.buffer.length === 3, 'Three events in buffer');

  // ============================================================================
  // Test 3: Counters
  // ============================================================================
  console.log('\n--- Test 3: Counters ---');
  
  const counters = metrics.getCounters();
  
  assert(counters[METRIC_TYPES.EMAIL_SENT] === 1, 'Email sent counter is 1');
  assert(counters[METRIC_TYPES.EMAIL_OPENED] === 1, 'Email opened counter is 1');
  assert(counters[METRIC_TYPES.EMAIL_REPLIED] === 1, 'Email replied counter is 1');

  // ============================================================================
  // Test 4: Client Onboarding & Payment
  // ============================================================================
  console.log('\n--- Test 4: Client & Payment Tracking ---');
  
  const clientEvent = metrics.trackClientOnboarded({
    id: 'client_new_789',
    plan: 'pro',
    mrr: 299,
    industry: 'SaaS',
    source: 'cold_email'
  });
  
  assert(clientEvent.data.mrr === 299, 'MRR captured correctly');
  assert(clientEvent.tags.source === 'cold_email', 'Source tag captured');

  const paymentEvent = metrics.trackPaymentReceived({
    clientId: 'client_new_789',
    amount: 299,
    currency: 'USD',
    type: 'subscription',
    plan: 'pro'
  });
  
  assert(paymentEvent.data.amount === 299, 'Payment amount captured');
  assert(counters[METRIC_TYPES.PAYMENT_RECEIVED] === undefined, 'Counter not updated until after track');
  
  const newCounters = metrics.getCounters();
  assert(newCounters[METRIC_TYPES.PAYMENT_RECEIVED] === 1, 'Payment counter updated');

  // ============================================================================
  // Test 5: API Tracking
  // ============================================================================
  console.log('\n--- Test 5: API Tracking ---');
  
  metrics.trackApiRequest({
    endpoint: '/v1/chat/completions',
    method: 'POST',
    service: 'openai',
    statusCode: 200,
    latencyMs: 1500
  });
  
  metrics.trackApiError({
    service: 'instantly',
    endpoint: '/api/send',
    code: 'RATE_LIMITED',
    message: 'Too many requests',
    severity: 'warning'
  });
  
  const apiCounters = metrics.getCounters();
  assert(apiCounters[METRIC_TYPES.API_REQUEST] === 1, 'API request counted');
  assert(apiCounters[METRIC_TYPES.API_ERROR] === 1, 'API error counted');

  // ============================================================================
  // Test 6: Flush to Disk
  // ============================================================================
  console.log('\n--- Test 6: Flush to Disk ---');
  
  const bufferSizeBefore = metrics.buffer.length;
  await metrics.flush();
  
  assert(metrics.buffer.length === 0, 'Buffer cleared after flush');
  
  // Check file was created
  try {
    const files = await fs.readdir(TEST_DATA_DIR);
    const metricsFiles = files.filter(f => f.startsWith('metrics-'));
    assert(metricsFiles.length === 1, 'Metrics file created');
    
    // Read file contents
    const content = await fs.readFile(path.join(TEST_DATA_DIR, metricsFiles[0]), 'utf8');
    const lines = content.trim().split('\n');
    assert(lines.length === bufferSizeBefore, `File has ${bufferSizeBefore} events`);
    
    // Verify JSON format
    const firstEvent = JSON.parse(lines[0]);
    assert(firstEvent.type === METRIC_TYPES.EMAIL_SENT, 'First event type preserved');
    assert(firstEvent.timestamp !== undefined, 'Timestamp preserved');
  } catch (e) {
    assert(false, `File verification failed: ${e.message}`);
  }

  // ============================================================================
  // Test 7: Load Events
  // ============================================================================
  console.log('\n--- Test 7: Load Events ---');
  
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const loadedEvents = await metrics.loadEvents(yesterday);
  
  assert(loadedEvents.length === bufferSizeBefore, 'Loaded all events from disk');

  // ============================================================================
  // Test 8: Dashboard Metrics
  // ============================================================================
  console.log('\n--- Test 8: Dashboard Metrics ---');
  
  // Add more events for dashboard testing
  for (let i = 0; i < 10; i++) {
    metrics.trackEmailSent({
      campaignId: `camp_batch_${i}`,
      clientId: 'client_batch',
      to: `test${i}@example.com`,
      subject: 'Batch test'
    });
  }
  await metrics.flush();
  
  const dashboard = await metrics.getDashboardMetrics();
  
  assert(dashboard.realtime !== undefined, 'Realtime metrics present');
  assert(dashboard.realtime.uptime_seconds >= 0, 'Uptime tracked');
  assert(dashboard.last_hour !== undefined, 'Last hour metrics present');
  assert(dashboard.last_24h !== undefined, 'Last 24h metrics present');

  // ============================================================================
  // Test 9: Alerts
  // ============================================================================
  console.log('\n--- Test 9: Alert Checking ---');
  
  // Simulate high error scenario
  for (let i = 0; i < 20; i++) {
    metrics.trackApiError({
      service: 'test',
      endpoint: '/test',
      code: 'ERROR',
      message: 'Test error'
    });
  }
  await metrics.flush();
  
  const alerts = await metrics.checkAlerts();
  // Note: Alert thresholds may not be met with small sample
  assert(Array.isArray(alerts), 'Alerts returned as array');

  // ============================================================================
  // Test 10: Cleanup
  // ============================================================================
  console.log('\n--- Test 10: Cleanup ---');
  
  await metrics.destroy();
  assert(metrics.buffer.length === 0, 'Buffer empty after destroy');

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${passCount} passed, ${failCount} failed`);
  console.log('='.repeat(60));

  // Cleanup test files
  await cleanup();

  return failCount === 0;
}

// Run tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });
