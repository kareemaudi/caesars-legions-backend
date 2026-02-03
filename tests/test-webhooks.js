// ============================================================================
// WEBHOOK TESTS - Caesar's Legions
// ============================================================================
// Usage: node tests/test-webhooks.js
// ============================================================================

const { 
  normalizeEvent, 
  analyzeReplySentiment,
  EVENT_HANDLERS 
} = require('../api/webhooks');

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    passed++;
  } catch (error) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Error: ${error.message}${RESET}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ============================================================================
// TESTS
// ============================================================================

async function runTests() {
  console.log('\n📋 Testing Webhook Handler\n');

  // Test event normalization
  await test('normalizeEvent - basic payload', () => {
    const payload = {
      lead_email: 'test@example.com',
      lead_name: 'John Doe',
      campaign_id: 'camp_123',
      subject: 'Hello World'
    };
    
    const event = normalizeEvent('open', payload);
    
    assert(event.type === 'open', 'Type should be open');
    assert(event.leadEmail === 'test@example.com', 'Email should match');
    assert(event.leadName === 'John Doe', 'Name should match');
    assert(event.campaignId === 'camp_123', 'Campaign ID should match');
    assert(event.id, 'Should have UUID');
    assert(event.timestamp, 'Should have timestamp');
  });

  await test('normalizeEvent - alternative field names', () => {
    const payload = {
      email: 'alt@example.com',
      name: 'Jane Smith',
      campaignId: 'camp_456'
    };
    
    const event = normalizeEvent('click', payload);
    
    assert(event.leadEmail === 'alt@example.com', 'Should handle "email" field');
    assert(event.leadName === 'Jane Smith', 'Should handle "name" field');
    assert(event.campaignId === 'camp_456', 'Should handle "campaignId" field');
  });

  // Test sentiment analysis
  await test('analyzeReplySentiment - positive reply', async () => {
    const reply = "Yes, I'm interested! Let's schedule a call next week.";
    const result = await analyzeReplySentiment(reply);
    
    assert(result.label === 'positive', `Should be positive, got ${result.label}`);
    assert(result.score > 0, 'Score should be positive');
  });

  await test('analyzeReplySentiment - negative reply', async () => {
    const reply = "Not interested, please remove me from your list.";
    const result = await analyzeReplySentiment(reply);
    
    assert(result.label === 'negative', `Should be negative, got ${result.label}`);
    assert(result.score < 0, 'Score should be negative');
  });

  await test('analyzeReplySentiment - auto-reply detection', async () => {
    const reply = "I'm out of office until Monday. Will respond when I return.";
    const result = await analyzeReplySentiment(reply);
    
    assert(result.label === 'auto_reply', `Should be auto_reply, got ${result.label}`);
  });

  await test('analyzeReplySentiment - neutral reply', async () => {
    const reply = "Can you tell me more about your pricing?";
    const result = await analyzeReplySentiment(reply);
    
    // This could be neutral or slightly positive
    assert(result.confidence !== undefined, 'Should have confidence score');
  });

  await test('analyzeReplySentiment - empty body', async () => {
    const result = await analyzeReplySentiment('');
    assert(result.label === 'neutral', 'Empty should be neutral');
    assert(result.confidence === 0, 'Empty should have 0 confidence');
  });

  // Test event handlers exist
  await test('EVENT_HANDLERS - all required handlers exist', () => {
    const required = [
      'email_opened',
      'email_clicked', 
      'email_replied',
      'email_bounced',
      'email_unsubscribed',
      'lead_interested',
      'lead_not_interested'
    ];
    
    for (const event of required) {
      assert(typeof EVENT_HANDLERS[event] === 'function', 
        `Handler for ${event} should exist`);
    }
  });

  // Test positive sentiment patterns
  await test('analyzeReplySentiment - booking patterns', async () => {
    const replies = [
      "Let's book a time to chat",
      "I'm available next Tuesday",
      "Here's my calendly: calendly.com/me",
      "Sounds good, when can we meet?"
    ];
    
    for (const reply of replies) {
      const result = await analyzeReplySentiment(reply);
      assert(result.score >= 0, `"${reply}" should be positive or neutral`);
    }
  });

  // Test negative sentiment patterns
  await test('analyzeReplySentiment - rejection patterns', async () => {
    const replies = [
      "No thanks, we're not interested",
      "Please stop emailing me",
      "We don't have budget for this",
      "Not a fit for us right now"
    ];
    
    for (const reply of replies) {
      const result = await analyzeReplySentiment(reply);
      assert(result.score <= 0, `"${reply}" should be negative or neutral`);
    }
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log('\n' + '─'.repeat(50));
  console.log(`\n${GREEN}Passed: ${passed}${RESET}`);
  if (failed > 0) {
    console.log(`${RED}Failed: ${failed}${RESET}`);
  } else {
    console.log(`${YELLOW}All tests passed! 🎉${RESET}`);
  }
  console.log();
}

// Run tests
runTests().catch(console.error);
