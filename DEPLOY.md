# 🚀 Caesar's Legions - Deployment Guide

**Goal:** Get from localhost → production in <30 minutes  
**Platform:** Railway (recommended) or any Node.js host

---

## 📋 Pre-Flight Checklist

Before deploying, you need:

- [ ] OpenAI API key ($20 credit to start)
- [ ] Apollo.io free tier account
- [ ] Instantly.ai account ($37/mo)
- [ ] Stripe account (for payments)
- [ ] Railway account (or Heroku/Render/DigitalOcean)

---

## 🔑 Getting API Keys

### 1. OpenAI ($20 credit)

1. Go to: https://platform.openai.com/api-keys
2. Sign up / log in
3. Click "Create new secret key"
4. Copy key: `sk-proj-...`
5. Add $20 credit: https://platform.openai.com/account/billing

**Cost estimate:** ~$0.002 per email = 10,000 emails for $20

---

### 2. Apollo.io (Free Tier)

1. Go to: https://app.apollo.io/
2. Sign up with email
3. Free plan: 50 credits/month (50 leads)
4. Settings → API → Generate API key
5. Copy key: `apollo_...`

**Upgrade later:** $49/mo for 500 credits if needed

---

### 3. Instantly.ai ($37/mo)

1. Go to: https://instantly.ai/
2. Sign up
3. Plans → Choose "Growth" ($37/mo)
4. Dashboard → Settings → API Keys
5. Generate key: `inst_...`

**Note:** Handles email sending, warmup, deliverability

---

### 4. Stripe (Free)

1. Go to: https://dashboard.stripe.com/register
2. Complete verification
3. Get test keys:
   - Developers → API Keys
   - Copy `pk_test_...` and `sk_test_...`
4. Switch to live mode when ready

**Revenue target:** $10K MRR = $300 Stripe fees (3%)

---

## 🚂 Deploy to Railway

### Step 1: Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize in project directory
cd caesars-legions-backend
railway init

# Follow prompts:
# - Project name: caesars-legions
# - Create new project: Yes
```

---

### Step 2: Add Environment Variables

In Railway dashboard:

```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
APOLLO_API_KEY=apollo_xxxxxxxxxxxxx
INSTANTLY_API_KEY=inst_xxxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
DATABASE_PATH=/app/data/database.db
PORT=3000
NODE_ENV=production
```

**Get Stripe webhook secret:**
1. Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-app.railway.app/webhooks/stripe`
3. Select events: `checkout.session.completed`, `customer.subscription.updated`
4. Copy webhook secret

---

### Step 3: Configure railway.json

Create `railway.json` in project root:

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

---

### Step 4: Deploy

```bash
# Deploy
railway up

# Monitor logs
railway logs

# Get deployment URL
railway domain
```

Your app will be live at: `https://caesars-legions-production.up.railway.app`

---

## 🗄️ Database Setup

Railway automatically creates persistent volumes for SQLite.

**Verify database:**

```bash
railway run node scripts/verify-db.js
```

**Backup strategy:**

```bash
# Download DB backup
railway run cat /app/data/database.db > backup-$(date +%Y%m%d).db

# Restore from backup
railway run "cat backup.db > /app/data/database.db"
```

**Production tip:** Switch to PostgreSQL after 10 clients for better reliability.

---

## 🌐 Custom Domain (Optional)

1. Railway dashboard → Settings → Domains
2. Add custom domain: `app.caesarslegions.com`
3. Update DNS (Railway provides instructions)
4. SSL automatically configured

---

## ✅ Post-Deployment Checklist

### 1. Test Signup Flow

```bash
curl -X POST https://your-app.railway.app/api/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@test.com",
    "name": "Test User",
    "company": "Test Co",
    "target_audience": "B2B SaaS founders",
    "value_prop": "We help..."
  }'
```

Expected: `{ "success": true, "checkoutUrl": "https://checkout.stripe.com/..." }`

---

### 2. Test Email Generation

```bash
railway run node test-email-send.js
```

Expected: Email sent to your inbox with personalization

---

### 3. Test Dashboard

Visit: `https://your-app.railway.app/dashboard/1`

Expected: Dashboard loads with metrics

---

### 4. Set Up Cron Jobs

**Option A: Railway Cron (recommended)**

Add to `railway.json`:

```json
{
  "cron": [
    {
      "schedule": "0 10 * * *",
      "command": "node cron/daily-follow-ups.js"
    }
  ]
}
```

**Option B: External Cron (cron-job.org)**

1. Go to: https://cron-job.org
2. Add job: `https://your-app.railway.app/cron/follow-ups`
3. Schedule: Daily at 10 AM UTC

---

## 🎯 First Client Onboarding

When you get your first paying customer:

### 1. Collect Info

Send them this form:

```
Hi [Name],

Welcome to Caesar's Legions! 🏛️

To set up your first campaign, I need:

1. Target audience (e.g., "B2B SaaS founders in US with 5-50 employees")
2. Your value proposition (2-3 sentences)
3. Your company website
4. LinkedIn profile (for personalization)
5. Email account to send from (we'll help you set up if needed)

Once I have this, I'll have your first campaign live within 24 hours.

- Kareem
```

---

### 2. Create Campaign

```bash
railway run node scripts/onboard-client.js

# Follow prompts:
# - Client ID: 1
# - Campaign name: "Outbound Launch"
# - Target count: 100
# - Schedule: Daily
```

---

### 3. Launch First Batch

```bash
# Test with 10 emails first
railway run node scripts/run-campaign.js --client=1 --count=10 --dry-run=false

# Review results
railway run node scripts/view-campaign-results.js --client=1

# If good, launch full batch
railway run node scripts/run-campaign.js --client=1 --count=100 --dry-run=false
```

---

## 📊 Monitoring

### 1. Application Logs

```bash
# Real-time logs
railway logs --follow

# Filter errors
railway logs | grep ERROR
```

---

### 2. Email Deliverability

Check Instantly.ai dashboard:
- Bounce rate (should be <5%)
- Open rate (target: 20-30%)
- Reply rate (target: 2-5%)

**Red flags:**
- Bounce rate >10% → Bad email list
- Open rate <10% → Deliverability issue
- Reply rate <1% → Copy needs work

---

### 3. Revenue Tracking

Stripe dashboard:
- MRR growth
- Churn rate
- Payment failures

**Goal:** $10K MRR = 40 clients @ $250/mo

---

## 🔒 Security Checklist

Before launch:

- [ ] API keys in environment variables (not code)
- [ ] Stripe webhook signature verification enabled
- [ ] Rate limiting on signup endpoint (prevent spam)
- [ ] HTTPS only (Railway default)
- [ ] Database backups automated (weekly minimum)
- [ ] Password hashing for client accounts (if adding auth)

---

## 🚨 Troubleshooting

### Problem: OpenAI API errors

**Solution:**
```bash
# Check API key
railway run node -e "console.log(process.env.OPENAI_API_KEY)"

# Check balance
# Visit: https://platform.openai.com/account/usage
```

---

### Problem: Emails not sending

**Solution:**
1. Check Instantly.ai account status
2. Verify API key
3. Check daily sending limit (start low, ramp up)

```bash
railway run node test-email-send.js
```

---

### Problem: Stripe checkout not working

**Solution:**
1. Check webhook secret is correct
2. Verify Stripe is in test mode (or live mode)
3. Check webhook endpoint is public

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

---

## 📈 Scaling Plan

### When you hit 10 clients ($2.5K MRR):

- [ ] Switch to PostgreSQL (more reliable)
- [ ] Add Redis for caching
- [ ] Set up monitoring (Sentry, LogRocket)
- [ ] Hire VA for customer support
- [ ] Build self-serve dashboard

---

### When you hit 50 clients ($12.5K MRR):

- [ ] Hire developer to help
- [ ] Build API for integrations
- [ ] Add team accounts
- [ ] White-label option for agencies
- [ ] Raise prices ($500-1K/mo)

---

## 🎯 Launch Day Checklist

Day 1 (Setup):
- [ ] Get all API keys
- [ ] Deploy to Railway
- [ ] Test signup flow
- [ ] Test email sending
- [ ] Set up cron jobs

Day 2 (Acquire):
- [ ] Send 10 DMs on X
- [ ] Post launch thread
- [ ] Share in communities

Day 3 (Close):
- [ ] Follow up with leads
- [ ] Jump on calls
- [ ] Close first customer
- [ ] Run first campaign

---

## 💰 Cost Breakdown

**Monthly costs (at launch):**

| Item | Cost |
|------|------|
| Railway hosting | $5-10/mo |
| Instantly.ai | $37/mo |
| OpenAI API | ~$50/mo (scales with usage) |
| Apollo.io | Free (upgrade to $49/mo later) |
| Stripe fees | 3% of revenue |
| **Total** | **~$100/mo** |

**Break-even:** 1 client ($250/mo)  
**Profit at 5 clients:** $1,150/mo  
**Profit at 10 clients:** $2,400/mo

---

## 🏛️ Final Words

You've built this. The code is solid. The product works.

Now it's just:
1. Get API keys
2. Deploy (30 min)
3. Find customers (DM 10 founders)
4. Close deals (jump on calls)

Don't overthink it. Launch today. Iterate tomorrow.

**Veni. Vidi. Vici.**

---

## 📞 Need Help?

If stuck:
1. Check Railway logs: `railway logs`
2. Review this guide
3. DM me on X: [@agenticCaesar](https://x.com/agenticCaesar)

You got this. 🚀
