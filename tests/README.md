# 🧪 Caesar's Legions - Test Suite

Comprehensive test coverage for critical components.

---

## Quick Start

```bash
# Run all tests
npm test

# Run specific test
node tests/email-generator.test.js
node tests/webhook-handler.test.js
node tests/ab-testing.test.js
node tests/follow-ups.test.js
```

---

## Test Coverage

| Component | Test File | Coverage | Critical |
|-----------|-----------|----------|----------|
| **Email Generator** | `email-generator.test.js` | 8 tests | ✅ Yes |
| **Webhook Handler** | `webhook-handler.test.js` | 8 tests | ✅ Yes |
| **A/B Testing** | `ab-testing.test.js` | Demo | ✅ Yes |
| **Follow-ups** | `follow-ups.test.js` | Demo | ✅ Yes |

---

## Test Suites

### 1. Email Generator Tests (`email-generator.test.js`)

Tests AI-powered email generation functionality.

**Tests:**
1. ✅ Basic Email Generation
2. ✅ Batch Generation (5 emails)
3. ✅ Error Handling (invalid input)
4. ✅ Different Tones (professional vs casual)
5. ✅ Performance Tracking
6. ✅ Cost Estimation
7. ✅ Subject Line Quality Check
8. ✅ Spam Filter Check

**Key Features Tested:**
- GPT-4 API integration
- Retry logic with exponential backoff
- Performance metrics tracking
- Cost calculation
- Subject line quality (length, spam words, personalization)
- Spam trigger detection (ALL CAPS, excessive punctuation, etc.)

**Usage:**
```bash
node tests/email-generator.test.js
```

**Requirements:**
- `OPENAI_API_KEY` in `.env`
- Active internet connection
- ~$0.10 API credit for full test suite

---

### 2. Webhook Handler Tests (`webhook-handler.test.js`)

Tests webhook processing and event tracking.

**Tests:**
1. ✅ Basic Webhook Processing
2. ✅ Different Event Types (sent, opened, clicked, replied, bounced, unsubscribed)
3. ✅ Invalid Webhook Handling
4. ✅ Batch Webhook Processing (100 webhooks)
5. ✅ Duplicate Webhook Detection
6. ✅ Reply Sentiment Integration
7. ✅ Rate Limiting (1000/min threshold)
8. ✅ Webhook Retry Logic

**Key Features Tested:**
- Event type handling (6 event types)
- Input validation
- Batch processing performance
- Duplicate detection
- Sentiment analysis integration
- Rate limiting protection
- Retry logic for failed webhooks

**Usage:**
```bash
node tests/webhook-handler.test.js
```

**Requirements:**
- Database initialized
- No external API calls (all local)

---

### 3. A/B Testing Tests (`ab-testing.test.js`)

Demonstrates A/B testing framework usage.

**Coverage:**
- Creating tests (subject, body, full, send time, CTA)
- Variant assignment (deterministic)
- Getting variant content
- Recording events (sent, opened, replied)
- Calculating results with statistical significance
- Winner determination

**Usage:**
```bash
node tests/ab-testing.test.js
```

---

### 4. Follow-ups Tests (`follow-ups.test.js`)

Demonstrates follow-up automation.

**Coverage:**
- 3-day follow-up sequences
- 7-day follow-up sequences
- Business hours awareness
- Template customization
- Scheduling logic

**Usage:**
```bash
node tests/follow-ups.test.js
```

---

## Running Tests

### All Tests

```bash
# Option 1: npm test (recommended)
npm test

# Option 2: Run each test manually
node tests/email-generator.test.js
node tests/webhook-handler.test.js
node tests/ab-testing.test.js
node tests/follow-ups.test.js
```

### Individual Tests

```bash
# Email generation only
node tests/email-generator.test.js

# Webhook handling only
node tests/webhook-handler.test.js
```

---

## Test Environment

### Requirements

1. **Node.js 16+**
2. **Environment variables** (`.env`):
   ```
   OPENAI_API_KEY=sk-...
   DATABASE_PATH=./data/caesars-legions.db
   ```
3. **Database initialized**:
   ```bash
   npm run db:init
   ```

### Optional

- **Instantly.ai webhook URL** (for webhook integration tests)
- **Apollo.io API key** (for lead enrichment tests)

---

## Exit Codes

Tests use standard exit codes:
- `0` = All tests passed ✅
- `1` = One or more tests failed ❌

This enables CI/CD integration.

---

## Performance Benchmarks

**Expected performance** (on average laptop):

| Test Suite | Duration | API Calls | Cost |
|------------|----------|-----------|------|
| Email Generator | 20-30s | 8-12 | $0.10 |
| Webhook Handler | <1s | 0 | $0 |
| A/B Testing | <1s | 0 | $0 |
| Follow-ups | <1s | 0 | $0 |

**Total:** ~30 seconds, ~$0.10 per full test run

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

---

## Coverage Goals

### Current Coverage (Feb 2026)

- ✅ Email Generator (8 tests)
- ✅ Webhook Handler (8 tests)
- ✅ A/B Testing (demo)
- ✅ Follow-ups (demo)
- ⏳ Reply Sentiment (TODO)
- ⏳ Lead Scraper (TODO)
- ⏳ Database (TODO)
- ⏳ SMTP Sender (TODO)

### Target Coverage (Q1 2026)

- **Goal:** 80% code coverage
- **Priority:** Critical path components (email gen, webhooks, follow-ups)
- **Nice-to-have:** Integration tests, end-to-end tests

---

## Writing New Tests

### Template

```javascript
#!/usr/bin/env node

const myModule = require('../lib/my-module');

async function testFeature() {
  console.log('Test: Feature Name');
  console.log('─'.repeat(60));
  
  try {
    // Test logic here
    const result = await myModule.doSomething();
    
    // Assertions
    if (!result) {
      throw new Error('Expected result');
    }
    
    console.log('✓ Test PASSED\n');
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

if (require.main === module) {
  testFeature().then(passed => {
    process.exit(passed ? 0 : 1);
  });
}

module.exports = { testFeature };
```

### Best Practices

1. **Use descriptive test names** ("Test 1: Basic Email Generation")
2. **Add visual separators** (`console.log('─'.repeat(60))`)
3. **Show progress** (log intermediate steps)
4. **Validate thoroughly** (check edge cases)
5. **Return boolean** (true = passed, false = failed)
6. **Exit with correct code** (0 = success, 1 = failure)

---

## Troubleshooting

### "OPENAI_API_KEY not found"

Add to `.env`:
```
OPENAI_API_KEY=sk-your-key-here
```

### "Database not found"

Initialize database:
```bash
npm run db:init
```

### "Test timeout"

Increase timeout in test file:
```javascript
const TEST_TIMEOUT_MS = 60000; // 60 seconds
```

---

## Contact

For test issues or questions:
- Check logs in `logs/`
- Review test output carefully
- Create issue on GitHub

---

🏛️ **Veni. Vidi. Vici.**
