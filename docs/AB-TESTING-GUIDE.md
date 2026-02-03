# 📊 A/B Testing Guide - Caesar's Legions

**Purpose:** Test different cold email approaches to optimize reply rates  
**Status:** Production-ready (added 2026-02-03)

---

## 🎯 Why A/B Testing Matters

Cold email reply rates vary wildly based on approach:
- **Problem-focused:** "You're probably struggling with X..." (empathy)
- **Social proof:** "We helped Company Y achieve Z..." (credibility)
- **Curiosity gap:** "Found something interesting about your market..." (intrigue)
- **Direct value:** "Reduce churn by 30% in 60 days" (outcome)

**Industry benchmark:** 1-3% reply rate = average, 5%+ = excellent

**With A/B testing:** Find your best angle and improve results by 50-200%

---

## 🧪 How It Works

### 1. Generate Variants
```javascript
const { generateVariants } = require('./lib/email-generator');

const variants = await generateVariants({
  lead: {
    first_name: 'Sarah',
    last_name: 'Johnson',
    title: 'VP of Sales',
    company: 'Acme Corp'
  },
  client: {
    company: "Caesar's Legions",
    name: 'Kareem',
    value_prop: 'AI cold email that gets 5%+ replies',
    target_audience: 'B2B SaaS founders'
  },
  variantCount: 2 // 2-4 variants
});

// Returns:
// [
//   {
//     variant_id: 'variant_A',
//     test_angle: 'problem_focused',
//     subject: 'Acme Corp's outbound challenges',
//     body: '...',
//     personalization_data: '{...}'
//   },
//   {
//     variant_id: 'variant_B',
//     test_angle: 'social_proof',
//     subject: 'How we helped SimilarCo 3x replies',
//     body: '...',
//     personalization_data: '{...}'
//   }
// ]
```

### 2. Split Send (50/50 or 25/25/25/25)
```javascript
// Split leads into groups
const groupA = leads.slice(0, leads.length / 2);
const groupB = leads.slice(leads.length / 2);

// Send variant A to group A
await sendCampaign(groupA, variants[0]);

// Send variant B to group B
await sendCampaign(groupB, variants[1]);
```

### 3. Track Results
Store opens, clicks, replies by variant:
```javascript
// In webhook handler or tracking system
{
  campaign_id: 'test_001',
  variant_id: 'variant_A',
  sent: 50,
  opened: 23,
  clicked: 8,
  replied: 4
}
```

### 4. Analyze Winner
```javascript
const { analyzeABTest } = require('./lib/email-generator');

const results = [
  { variant_id: 'variant_A', test_angle: 'problem_focused', sent: 50, opened: 22, replied: 4 },
  { variant_id: 'variant_B', test_angle: 'social_proof', sent: 50, opened: 28, replied: 7 }
];

const analysis = analyzeABTest(results);

console.log(analysis.winner);
// {
//   variant_id: 'variant_B',
//   test_angle: 'social_proof',
//   reply_rate: '14.00%',
//   open_rate: '56.00%',
//   improvement_over_runner_up: '+75.0%'
// }

console.log(analysis.recommendation);
// "Use variant_B (social_proof) for future campaigns. Statistically significant winner."
```

---

## 🔬 Test Angles Explained

### 1. Problem-Focused
**Strategy:** Lead with pain point, build empathy, then offer solution

**Example:**
```
Subject: Outbound not working for DataFlow?

Hi Alex,

Most B2B SaaS founders we talk to are getting <1% reply rates on cold email. 
Frustrating when you know your product solves a real problem.

That's why we built Caesar's Legions. GPT-4 writes personalized emails that 
actually get read (5%+ reply rate average).

Worth exploring?
```

**Best for:** Prospects who openly discuss their struggles (Reddit, IH posts)

---

### 2. Social Proof
**Strategy:** Open with credibility (results, case study, client name)

**Example:**
```
Subject: How SimilarCo 3x'd their reply rate

Hi Alex,

We helped another B2B SaaS company (similar size to DataFlow) go from 
1.2% → 4.8% reply rate in 30 days.

The difference? Hyper-personalized AI emails instead of templates.

Curious if we could do the same for DataFlow?
```

**Best for:** Risk-averse buyers, established companies, competitive markets

---

### 3. Curiosity Gap
**Strategy:** Tease insight without revealing it, make them curious

**Example:**
```
Subject: Quick observation about DataFlow's market

Hi Alex,

Was researching B2B analytics tools and noticed something interesting 
about how DataFlow positions vs. competitors.

Mind if I share? Could be useful for your outbound strategy.

2-min call this week?
```

**Best for:** Senior buyers (C-level), prospects with low email volume tolerance

---

### 4. Direct Value
**Strategy:** Immediately state concrete outcome (number/metric)

**Example:**
```
Subject: 5%+ reply rates for DataFlow

Hi Alex,

We get B2B SaaS founders 5%+ reply rates on cold email.

AI-written, hyper-personalized, done-for-you. $250/mo.

Worth a conversation?
```

**Best for:** Time-poor buyers, transactional markets, clear ROI products

---

## 📈 Sample Size Guidelines

### Minimum Viable Test
- **50 emails per variant** (100 total for A/B test)
- **Expected replies:** 2-5 per variant at 4-8% reply rate
- **Timeline:** 5-7 days (allow time for delayed replies)

### Statistically Significant Test
- **100+ emails per variant** (200 total for A/B test)
- **Expected replies:** 4-10 per variant
- **Timeline:** 7-10 days

### Multi-Variant Test (A/B/C/D)
- **50+ emails per variant** (200 total)
- **Expected replies:** 2-4 per variant (harder to detect winner)
- **Timeline:** 10-14 days

**Rule of thumb:** Need 30+ sends per variant minimum for statistical validity

---

## 🎯 What to Test First

### Priority Order:
1. **Subject line approach** (curiosity vs direct value)
2. **Opening hook** (compliment vs problem vs stat)
3. **CTA style** (permission-based vs direct ask)
4. **Email length** (80 words vs 120 words)

**Don't test simultaneously:** Change ONE variable per test

---

## 🚀 Integration with Dashboard

### Client-Facing A/B Report
```javascript
{
  campaign_name: "Outbound Test #1",
  test_duration_days: 7,
  variants: [
    {
      name: "Problem-Focused (A)",
      sent: 50,
      opened: 22,
      replied: 4,
      reply_rate: "8.0%",
      sample_subject: "Outbound not working?"
    },
    {
      name: "Social Proof (B)",
      sent: 50,
      opened: 28,
      replied: 7,
      reply_rate: "14.0%",
      sample_subject: "How SimilarCo 3x'd replies"
    }
  ],
  winner: "variant_B",
  recommendation: "Use social proof approach for next campaign",
  confidence: "high",
  expected_improvement: "+75% reply rate vs variant A"
}
```

---

## 💡 Best Practices

### DO:
- ✅ Run tests for 5-7 days minimum (replies trickle in)
- ✅ Split leads randomly (not by company size or industry)
- ✅ Keep sample sizes equal (50/50 or 25/25/25/25)
- ✅ Test ONE variable at a time
- ✅ Document learnings (what worked, why)

### DON'T:
- ❌ Stop test early (even if one variant is clearly winning)
- ❌ Cherry-pick "better" leads for a variant (biases results)
- ❌ Test too many variants at once (dilutes sample size)
- ❌ Change email mid-test (invalidates results)
- ❌ Ignore statistical significance (lucky streaks happen)

---

## 🛠️ CLI Commands

### Generate variants for testing
```bash
node scripts/test-ab-variants.js
```

### Run full A/B test (future feature)
```bash
node scripts/run-ab-test.js \
  --campaign "Test 001" \
  --leads ./data/leads.csv \
  --variants 2 \
  --send-date "2026-02-05"
```

---

## 📊 Expected Improvements

Based on cold email industry data:

| Test | Typical Improvement |
|------|---------------------|
| Subject line | 20-50% open rate increase |
| Opening hook | 30-80% reply rate increase |
| CTA style | 15-40% reply rate increase |
| Email length | 10-30% reply rate increase |

**Compound effect:** Running 4 sequential tests can 2-3x your reply rate

**Example:**
- Baseline: 2% reply rate → 2 replies per 100 emails
- After 4 tests: 5% reply rate → 5 replies per 100 emails
- **Result:** 2.5x more demos booked from same lead volume

---

## 🎓 Further Reading

- [16 Cold Email A/B Tests (with data)](https://www.lemlist.com/blog/cold-email-ab-test)
- [Statistical Significance Calculator](https://www.abtestguide.com/calc/)
- [Cold Email Benchmarks by Industry](https://www.woodpecker.co/blog/cold-email-statistics/)

---

## 🏁 Next Steps

1. **First client onboarded?** → Run 2-variant test (problem vs social proof)
2. **Test complete?** → Analyze results, pick winner
3. **Winner found?** → Run second test (CTA style or length)
4. **Optimize continuously:** Every campaign is a learning opportunity

🏛️ **Remember:** Data beats opinions. Test everything.

---

**Last Updated:** 2026-02-03  
**Maintainer:** Solon (AI Chief of Staff)
