# 🚀 Caesar's Legions - Deployment Guide

**Purpose:** Get from "backend ready" to "first paying client" in under 2 hours

**Last Updated:** 2026-02-03 18:10 Beirut Time

---

## 📋 Pre-Launch Checklist

### 1. API Keys Required

```bash
# Create .env file
OPENAI_API_KEY=sk-...                    # $20 credit (enough for 200+ emails)
APOLLO_API_KEY=...                       # Free tier (50 credits/month)
INSTANTLY_API_KEY=...                    # $37/mo (unlimited emails)
BIRD_CLI_COOKIES=...                     # For X lead scraper (optional)
STRIPE_SECRET_KEY=sk_test_...            # For payments (optional for v1)
```

**How to get them:**

**OpenAI** ($20 credit):
1. Go to platform.openai.com
2. Create account → Add payment method
3. Get $20 free credit
4. Copy API key from dashboard

**Apollo.io** (Free):
1. Go to apollo.io
2. Sign up for free trial (50 credits)
3. Settings → API → Generate key
4. Copy API key

**Instantly.ai** ($37/mo):
1. Go to instantly.ai
2. Sign up for starter plan
3. Connect email account (Gmail recommended)
4. API Settings → Copy key

**Bird CLI** (Free, optional):
1. Login to X/Twitter
2. Get cookies (use EditThisCookie extension)
3. Save to .env

### 2. Email Infrastructure

**Option A: Use Instantly.ai** (Recommended for v1)
- Handles sending, warm-up, deliverability
- No technical setup needed
- Just add API key

**Option B: Direct SMTP** (For advanced users)
- Requires domain setup
- DKIM/SPF/DMARC configuration
- Warm-up period (2-4 weeks)
- Not recommended for launch

**Decision:** Start with Instantly.ai, migrate to direct SMTP at $5K+ MRR

### 3. Domain Setup

**Required:**
- `promptabusiness.com` (already registered?)
- Email warm-up domain (separate from main domain)
- DKIM/SPF records configured

**Check:**
```bash
dig promptabusiness.com
nslookup -type=MX promptabusiness.com
```

**If not set up:**
1. Register domain (Namecheap, $12/year)
2. Point to Railway/Vercel
3. Configure email records (Instantly handles this)

---

## 🏗️ Deployment Steps

### Step 1: Install Dependencies

```bash
cd caesars-legions-backend
npm install
```

### Step 2: Configure Environment

```bash
# Create .env file
cp .env.example .env

# Add API keys (see above)
nano .env
```

### Step 3: Test Core Functions

```bash
# Test email generation
npm test -- tests/email-generator.test.js

# Test webhook handler
npm test -- tests/webhook-handler.test.js

# Test follow-up automation
npm test -- tests/follow-ups.test.js

# Run all tests
npm test
```

**Expected:** All tests pass (40+ tests)

### Step 4: Test Email Sending (Dry Run)

```bash
# Test email generation without sending
node scripts/test-email-generation.js

# Expected output:
# ✓ Generated personalized email for John Doe
# ✓ Subject line: [personalized based on research]
# ✓ Body: [personalized 150-200 words]
# ✓ Call-to-action: [specific to prospect]
```

**Create test script:**

```javascript
// scripts/test-email-generation.js
const EmailGenerator = require('../lib/email-generator');

async function test() {
  const generator = new EmailGenerator({
    openaiApiKey: process.env.OPENAI_API_KEY
  });

  const testProspect = {
    name: 'John Doe',
    company: 'Acme SaaS',
    title: 'Founder',
    pain: 'Struggling with cold email outreach',
    industry: 'B2B SaaS',
    companySize: '10-50',
    website: 'https://acmesaas.com'
  };

  const email = await generator.generate(testProspect);
  
  console.log('Subject:', email.subject);
  console.log('Body:', email.body);
  console.log('Tokens used:', email.tokensUsed);
}

test();
```

### Step 5: Deploy to Railway

**Why Railway?**
- Free tier ($5 credit)
- Auto-deploy from git
- Built-in PostgreSQL
- Easy environment variables

**Steps:**

1. **Create Railway account** (railway.app)
2. **Connect GitHub repo** (or deploy from CLI)
3. **Add environment variables** (all API keys from .env)
4. **Add PostgreSQL** (for storing clients, campaigns, metrics)
5. **Deploy**

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add PostgreSQL
railway add postgres

# Deploy
railway up
```

**Expected:** Service live at `https://caesars-legions-production.up.railway.app`

### Step 6: Set Up Database

```sql
-- Run migrations
CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  company VARCHAR(255),
  status VARCHAR(50), -- 'trial', 'active', 'paused', 'churned'
  plan VARCHAR(50), -- 'founder', 'growth', 'scale'
  mrr INTEGER, -- in cents
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id),
  name VARCHAR(255),
  status VARCHAR(50), -- 'draft', 'active', 'paused', 'completed'
  emails_sent INTEGER DEFAULT 0,
  opens INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  meetings INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

CREATE TABLE emails (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id),
  prospect_email VARCHAR(255),
  subject TEXT,
  body TEXT,
  status VARCHAR(50), -- 'queued', 'sent', 'opened', 'clicked', 'replied', 'bounced'
  sent_at TIMESTAMP,
  opened_at TIMESTAMP,
  replied_at TIMESTAMP,
  metadata JSONB
);

CREATE TABLE follow_ups (
  id SERIAL PRIMARY KEY,
  email_id INTEGER REFERENCES emails(id),
  sequence_number INTEGER, -- 1, 2, 3 (for day 3, 5, 7)
  due_at TIMESTAMP,
  sent_at TIMESTAMP,
  status VARCHAR(50), -- 'pending', 'sent', 'cancelled'
  subject TEXT,
  body TEXT
);
```

### Step 7: Test Full Flow (End-to-End)

```bash
# Run end-to-end test with test@example.com
node scripts/e2e-test.js
```

**Expected flow:**
1. ✓ Load test prospect data
2. ✓ Generate personalized email (OpenAI)
3. ✓ Enrich contact info (Apollo)
4. ✓ Send email (Instantly)
5. ✓ Schedule follow-ups (Day 3, 5, 7)
6. ✓ Log to database
7. ✓ Update dashboard

**Create E2E test script:**

```javascript
// scripts/e2e-test.js
const EmailGenerator = require('../lib/email-generator');
const { sendEmail } = require('../lib/email-sender');
const FollowUpScheduler = require('../lib/follow-ups');

async function runE2ETest() {
  console.log('🧪 Running end-to-end test...\n');

  // Test prospect (use your own email for testing)
  const prospect = {
    name: 'Test User',
    email: 'test@example.com', // CHANGE THIS to your email
    company: 'Test Company',
    title: 'Founder',
    pain: 'Testing cold email system',
    industry: 'B2B SaaS'
  };

  // 1. Generate email
  console.log('1️⃣ Generating email...');
  const generator = new EmailGenerator({
    openaiApiKey: process.env.OPENAI_API_KEY
  });
  const email = await generator.generate(prospect);
  console.log('✓ Email generated:', email.subject);

  // 2. Send email (DRY RUN MODE)
  console.log('\n2️⃣ Sending email (DRY RUN)...');
  const result = await sendEmail({
    to: prospect.email,
    subject: email.subject,
    body: email.body,
    dryRun: true // Don't actually send
  });
  console.log('✓ Would send to:', prospect.email);

  // 3. Schedule follow-ups
  console.log('\n3️⃣ Scheduling follow-ups...');
  const scheduler = new FollowUpScheduler();
  const followUps = scheduler.schedule({
    emailId: 'test-001',
    prospectEmail: prospect.email,
    sequence: [3, 5, 7] // Day 3, 5, 7
  });
  console.log('✓ Follow-ups scheduled:', followUps.length);
  followUps.forEach(f => {
    console.log(`  - Day ${f.dayNumber}: ${f.dueAt}`);
  });

  console.log('\n✅ E2E test completed successfully!\n');
  console.log('To send real email, remove dryRun flag and run again.');
}

runE2ETest().catch(console.error);
```

### Step 8: Monitor & Alert Setup

```bash
# Set up monitoring (optional but recommended)
npm install @sentry/node

# Add to main server.js
const Sentry = require("@sentry/node");
Sentry.init({ dsn: process.env.SENTRY_DSN });
```

**Alerts to configure:**
- Email sending failures
- API errors (OpenAI, Apollo, Instantly)
- Database connection issues
- Webhook failures

---

## 🎯 Launch Day Checklist

### Hour 0: Final Checks

- [ ] All tests passing (`npm test`)
- [ ] E2E test successful
- [ ] Dashboard accessible
- [ ] API keys working
- [ ] Database connected
- [ ] Monitoring configured

### Hour 1: Onboard First Client

**Use the hot Reddit lead** (found today, paying $18K/mo currently)

1. **Send personalized DM:**
   ```
   Hey [name]! Saw your post about cold email services.
   
   I run Caesar's Legions - AI-powered cold email agency.
   We do exactly what you described for $497/mo (vs $18K).
   
   Want to see how we compare? I can send you:
   - Sample campaign for your ICP
   - Week 1 performance prediction
   - Free test campaign (20 emails)
   
   No sales call needed. Just reply "interested" and I'll send details.
   ```

2. **If interested, send intake form:**
   - Use `templates/client-intake-form.md`
   - Get ICP details, messaging, expectations

3. **Run onboarding script:**
   ```bash
   node scripts/onboard-client.js \
     --name "Client Name" \
     --email "client@example.com" \
     --company "Company Inc" \
     --plan "founder"
   ```

4. **Send welcome email:**
   - Auto-generated by onboarding script
   - Includes dashboard link
   - Sets expectations

5. **Build first campaign:**
   - Use intake form answers
   - Generate 20 emails
   - Send for approval

6. **Launch campaign:**
   - Client approves
   - Send first batch (20 emails)
   - Monitor dashboard

### Hour 2: Monitor & Iterate

- [ ] Check email deliverability
- [ ] Monitor opens/clicks
- [ ] Respond to any replies
- [ ] Update dashboard
- [ ] Log learnings

---

## 🚨 Common Issues & Fixes

### Issue: OpenAI API Error "Insufficient Quota"

**Fix:**
```bash
# Check quota: https://platform.openai.com/usage
# Add $20 credit
# Restart service
```

### Issue: Emails Landing in Spam

**Fix:**
- Check SPF/DKIM records
- Warm up email domain (send to friends first)
- Reduce sending volume (start with 20/day)
- Use Instantly's warm-up feature

### Issue: Apollo API "Rate Limit Exceeded"

**Fix:**
- Free tier: 50 credits/month = 1-2 credits/day
- Batch enrichment (enrich 25 leads at once)
- Cache results (don't re-enrich same company)

### Issue: Database Connection Lost

**Fix:**
```bash
# Check Railway logs
railway logs

# Reconnect database
railway link
railway up
```

---

## 📊 Post-Launch Metrics

**Day 1 Targets:**
- [ ] 1 client onboarded
- [ ] 20 emails sent
- [ ] 0 errors in logs
- [ ] Dashboard showing data

**Week 1 Targets:**
- [ ] 100 emails sent
- [ ] 30%+ open rate
- [ ] 1+ reply
- [ ] 1 meeting booked
- [ ] Client happy (NPS 9+)

**Month 1 Targets:**
- [ ] 4 clients ($1,988 MRR)
- [ ] 400 emails sent
- [ ] 10+ meetings booked
- [ ] 1 client closes deal
- [ ] Case study written

---

## 🔄 Continuous Deployment

**Auto-deploy on git push:**

```bash
# Railway auto-deploys on push to main
git add .
git commit -m "feat: improve email personalization"
git push origin main

# Railway detects push and redeploys (~2 min)
```

**Manual deploy:**

```bash
railway up
```

---

## 📚 Resources

- [Railway Docs](https://docs.railway.app)
- [OpenAI API Reference](https://platform.openai.com/docs)
- [Apollo.io API](https://developer.apollo.io)
- [Instantly API](https://developer.instantly.ai)

---

## 🎯 Next Steps After Launch

1. **Get testimonial** from first client (after Week 1)
2. **Build case study** (show results: emails sent, meetings booked, deals closed)
3. **Post on X** about first client success
4. **Find next 3 clients** using X scraper
5. **Iterate based on learnings**

---

## ✅ You're Ready to Launch!

Once API keys are in place, you can go from zero to first paying client in under 2 hours.

**Remember:**
- Start small (20 emails first campaign)
- Monitor closely (check dashboard every hour)
- Iterate fast (improve based on what works)
- Sales cures all (focus on getting clients, not perfection)

---

**Need help?** Check README.md or ONBOARDING.md

🏛️ **Veni. Vidi. Vici.**
