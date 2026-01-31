# A/B Testing Framework

Complete A/B testing system for optimizing cold email campaigns.

---

## 🎯 Why A/B Testing?

Small changes can have huge impact:
- **Subject lines:** 2-5x difference in open rates
- **Email body:** 2-3x difference in reply rates
- **Send time:** 30-50% difference in engagement

Without testing, you're guessing. With testing, you optimize.

---

## 📊 What You Can Test

### 1. Subject Lines
```javascript
const test = abTesting.createTest({
  campaign_id: 1,
  test_name: 'Subject: Question vs Statement',
  test_type: 'subject',
  variant_a: {
    subject: 'Quick question about {{company}}'
  },
  variant_b: {
    subject: '{{company}} + Caesar\'s Legions = 10x demos'
  },
  split_ratio: 50 // 50/50 split
});
```

**Common patterns to test:**
- Question vs Statement
- Pain vs Benefit
- Generic vs Specific
- Short (<5 words) vs Long (6-10 words)
- Personal vs Professional

---

### 2. Email Body
```javascript
const test = abTesting.createTest({
  campaign_id: 1,
  test_name: 'Body: Short vs Long',
  test_type: 'body',
  variant_a: {
    body: `Hey {{first_name}},

We help {{industry}} companies get 10+ demos/month via AI-powered cold email.

Interested?

Best,
Caesar`
  },
  variant_b: {
    body: `Hey {{first_name}},

I noticed {{company}} is scaling fast in {{industry}}.

Most B2B SaaS founders struggle with cold email:
- Spam folder issues
- Low reply rates
- Domain reputation damage

We've solved this with GPT-4 personalization.

Results: 12% reply rate, 3-5 meetings per 100 emails.

Want to see how?

Best,
Caesar`
  }
});
```

**Common patterns to test:**
- Short vs Long
- Problem-Agitate-Solve vs Solution-First
- Social proof vs No social proof
- Question CTA vs Link CTA
- Casual vs Professional tone

---

### 3. Full Email (Subject + Body)
```javascript
const test = abTesting.createTest({
  campaign_id: 1,
  test_name: 'Full Email: V1 vs V2',
  test_type: 'full',
  variant_a: { subject: '...', body: '...' },
  variant_b: { subject: '...', body: '...' }
});
```

---

### 4. Send Time
```javascript
const test = abTesting.createTest({
  campaign_id: 1,
  test_name: 'Send Time: Morning vs Afternoon',
  test_type: 'send_time',
  variant_a: {
    scheduled_time: '09:00' // 9 AM
  },
  variant_b: {
    scheduled_time: '14:00' // 2 PM
  }
});
```

**Common patterns to test:**
- Morning (8-10 AM) vs Afternoon (2-4 PM)
- Weekday (Tue-Thu) vs Monday/Friday
- Business hours vs Evening

---

### 5. Call-to-Action (CTA)
```javascript
const test = abTesting.createTest({
  campaign_id: 1,
  test_name: 'CTA: Question vs Link',
  test_type: 'cta',
  variant_a: {
    cta: 'Interested in a quick demo?'
  },
  variant_b: {
    cta: 'Here\'s a link to book 15 min: [calendar]'
  }
});
```

---

## 🚀 How to Use

### Step 1: Create Test

```javascript
const abTesting = require('./lib/ab-testing');

const testId = abTesting.createTest({
  campaign_id: 1,
  test_name: 'Subject Line Test',
  test_type: 'subject',
  variant_a: { subject: 'Question about cold email?' },
  variant_b: { subject: '3 ways to 10x your cold email' },
  split_ratio: 50 // 50% get variant A, 50% get B
});
```

### Step 2: Get Variant Content

When sending emails:

```javascript
leads.forEach(lead => {
  // Get variant-specific email
  const email = abTesting.getVariantContent(testId, lead.id, {
    subject: 'Base subject (will be replaced)',
    body: 'Base body (will be replaced)'
  });
  
  console.log(`Lead ${lead.id} gets variant ${email.variant}`);
  console.log(`Subject: ${email.subject}`);
  
  // Send email with variant content
  sendEmail(lead.email, email.subject, email.body);
  
  // Record send event
  abTesting.recordEvent(testId, lead.id, 'sent');
});
```

### Step 3: Track Events

When events happen (webhook handlers):

```javascript
// Email opened
abTesting.recordEvent(testId, lead.id, 'opened');

// Link clicked
abTesting.recordEvent(testId, lead.id, 'clicked', { url: clickedUrl });

// Email replied
abTesting.recordEvent(testId, lead.id, 'replied', { 
  sentiment: 'positive',
  body: replyText 
});
```

### Step 4: Check Results

After 30+ sends per variant:

```javascript
const results = abTesting.getTestResults(testId);

console.log(`Winner: ${results.winner}`);
console.log(`Confidence: ${results.confidence}%`);
console.log(`Recommendation: ${results.recommendation}`);

// Example output:
// Winner: B
// Confidence: 95%
// Recommendation: Use Variant B (67% better reply rate). Roll out to all future sends.
```

### Step 5: Apply Winner

When test is complete:

```javascript
if (results.is_significant) {
  // Mark test as complete
  abTesting.completeTest(testId);
  
  // Use winning variant for all future emails
  const winningVariant = results.winner === 'A' 
    ? JSON.parse(test.variant_a)
    : JSON.parse(test.variant_b);
  
  // Update campaign template
  updateCampaignTemplate(campaignId, winningVariant);
}
```

---

## 📈 Understanding Results

### Metrics Provided

For each variant:
- **Sent:** Number of emails sent
- **Open Rate:** % of emails opened
- **Click Rate:** % of opens that clicked a link
- **Reply Rate:** % of emails that got a reply

### Statistical Significance

- **<30 sends per variant:** Not enough data
- **30-50 sends:** Low confidence (~60-80%)
- **50-100 sends:** Medium confidence (~80-90%)
- **100+ sends:** High confidence (90-95%+)

**Rule of thumb:** Wait for 95% confidence before declaring a winner.

### Example Output

```javascript
{
  test_name: 'Subject Line Test',
  variant_a: {
    sent: 50,
    opened: 20,
    replied: 3,
    open_rate: '40.00',
    reply_rate: '6.00'
  },
  variant_b: {
    sent: 50,
    opened: 30,
    replied: 5,
    open_rate: '60.00',
    reply_rate: '10.00'
  },
  winner: 'B',
  confidence: 95,
  is_significant: true,
  recommendation: 'Use Variant B (67% better reply rate). Roll out to all future sends.'
}
```

---

## 🎓 Best Practices

### 1. Test One Thing at a Time

❌ Bad: Change subject AND body AND send time
✅ Good: Change only subject line

Why? If you change multiple things, you won't know what caused the difference.

### 2. Wait for Significance

❌ Bad: Declare winner after 10 sends
✅ Good: Wait for 50+ sends per variant

Why? Small samples have high variance. You might pick the wrong winner.

### 3. Test Big Swings First

❌ Bad: "Quick question" vs "Question for you"
✅ Good: "Quick question" vs "3 ways to 10x your pipeline"

Why? Small differences need huge sample sizes to detect. Test dramatic differences first.

### 4. Sequential Testing

Don't run 10 tests at once. Run them sequentially:

1. Test subject lines (find winner)
2. Test email body with winning subject (find winner)
3. Test CTA with winning subject + body (find winner)
4. Test send time with winning email

---

## 🔬 Example Test Ideas

### For B2B SaaS Founders

**Subject Lines:**
- A: "Quick question about {{company}}"
- B: "{{first_name}}, saw you're hiring SDRs?"

**Email Bodies:**
- A: Short (3 sentences, direct ask)
- B: Long (problem-agitate-solve, social proof)

**CTAs:**
- A: "Interested in a quick demo?"
- B: "Can I send you a case study?"

### For E-commerce Brands

**Subject Lines:**
- A: "Your Q1 sales forecast"
- B: "How {{competitor}} 3x'd revenue"

**Email Bodies:**
- A: Pain-focused (struggling with X?)
- B: Benefit-focused (here's how to achieve Y)

---

## 🛠️ Database Schema

Created by running `migrations/001-add-ab-testing.sql`:

```sql
-- Tests
CREATE TABLE ab_tests (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER,
  test_name TEXT,
  test_type TEXT,
  variant_a TEXT, -- JSON
  variant_b TEXT, -- JSON
  split_ratio INTEGER,
  status TEXT,
  created_at INTEGER
);

-- Assignments (which lead got which variant)
CREATE TABLE ab_test_assignments (
  test_id INTEGER,
  lead_id INTEGER,
  variant TEXT, -- 'A' or 'B'
  assigned_at INTEGER,
  UNIQUE(test_id, lead_id)
);

-- Events (sent, opened, clicked, replied)
CREATE TABLE ab_test_events (
  test_id INTEGER,
  lead_id INTEGER,
  variant TEXT,
  event TEXT,
  event_data TEXT, -- JSON
  timestamp INTEGER
);
```

---

## 📊 API Reference

### `createTest(config)`
Create a new A/B test.

**Parameters:**
- `campaign_id` (number): Campaign ID
- `test_name` (string): Human-readable test name
- `test_type` (string): 'subject' | 'body' | 'full' | 'send_time' | 'cta'
- `variant_a` (object): Variant A configuration
- `variant_b` (object): Variant B configuration
- `split_ratio` (number): % assigned to variant A (default: 50)

**Returns:** Test ID

---

### `getVariantContent(testId, leadId, baseEmail)`
Get email content for a lead's assigned variant.

**Parameters:**
- `testId` (number): Test ID
- `leadId` (number): Lead ID
- `baseEmail` (object): Base email with subject + body

**Returns:** Modified email with variant-specific content

---

### `recordEvent(testId, leadId, event, data)`
Record an event for A/B test tracking.

**Parameters:**
- `testId` (number): Test ID
- `leadId` (number): Lead ID
- `event` (string): 'sent' | 'opened' | 'clicked' | 'replied'
- `data` (object): Additional event data (optional)

---

### `getTestResults(testId)`
Get test results with statistical analysis.

**Returns:** Object with metrics, winner, confidence, recommendation

---

### `completeTest(testId)`
Mark test as completed (stop assigning new leads).

---

## 🎯 Real-World Example

```javascript
// Day 1: Create test
const testId = abTesting.createTest({
  campaign_id: 1,
  test_name: 'Pain vs Benefit Subject',
  test_type: 'subject',
  variant_a: { subject: 'Struggling with cold email?' },
  variant_b: { subject: 'Get 10+ demos per month' }
});

// Day 1-3: Send 100 emails (50 per variant)
// (handled automatically by getVariantContent)

// Day 4: Check results
const results = abTesting.getTestResults(testId);
console.log(results);

// Output:
// {
//   winner: 'A',
//   confidence: 92,
//   recommendation: 'Use Variant A (45% better reply rate)'
// }

// Day 4: Apply winner
abTesting.completeTest(testId);
updateCampaignTemplate(1, { subject: 'Struggling with cold email?' });

// Repeat with next test (email body, CTA, etc.)
```

---

🏛️ **Veni. Vidi. Vici.**

Built with precision. Optimized for results.
