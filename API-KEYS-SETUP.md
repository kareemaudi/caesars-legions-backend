# 🔑 API Keys Setup - Quick Guide

Get Caesar's Legions running in 15 minutes.

---

## 1. OpenAI (REQUIRED)

**Cost:** $20 credit gets you ~1,000 emails  
**Why:** Generates personalized cold emails with GPT-4

**Steps:**
1. Go to: https://platform.openai.com/api-keys
2. Sign up (or log in)
3. Click "Create new secret key"
4. Name it "Caesar's Legions"
5. Copy the key (starts with `sk-`)

**Add to `.env`:**
```
OPENAI_API_KEY=sk-your-key-here
```

---

## 2. Instantly.ai (REQUIRED for sending)

**Cost:** $37/mo (has free trial)  
**Why:** Actually sends the emails + tracks opens/clicks

**Steps:**
1. Go to: https://instantly.ai
2. Sign up for trial
3. Connect your email account (Gmail, Outlook, custom domain)
4. Go to Settings → API
5. Copy API key
6. Create a campaign, copy campaign ID

**Add to `.env`:**
```
INSTANTLY_API_KEY=your-instantly-key
INSTANTLY_CAMPAIGN_ID=your-campaign-id
```

**Important:** Set up Instantly webhook:
- Webhook URL: `https://your-railway-url.railway.app/webhooks/instantly`
- Events: opened, clicked, replied, bounced, unsubscribed

---

## 3. Apollo.io (OPTIONAL - for lead sourcing)

**Cost:** Free tier (25 credits/mo), then $49/mo  
**Why:** Finds B2B SaaS founders automatically

**Steps:**
1. Go to: https://apollo.io
2. Sign up for free account
3. Go to Settings → API
4. Copy API key

**Add to `.env`:**
```
APOLLO_API_KEY=your-apollo-key
```

**If you skip this:** System uses mock leads for testing (fine for first client)

---

## Quick Test

After adding keys:

```bash
cd caesars-legions-backend

# Test email generation
node -e "
const { generateEmail } = require('./lib/email-generator');
generateEmail({
  lead: {first_name: 'John', last_name: 'Doe', company: 'Test Inc', title: 'CEO'},
  client: {company: 'Your Co', value_prop: 'We help you scale', target_audience: 'founders'}
}).then(console.log);
"

# If that works, you're good!
```

---

## Deploy to Railway (Free Tier)

Once keys are set:

1. Push to GitHub:
```bash
git init
git add .
git commit -m "Caesar's Legions backend"
git remote add origin YOUR_GITHUB_URL
git push -u origin main
```

2. Go to: https://railway.app
3. New Project → Deploy from GitHub
4. Select repo
5. Add environment variables (copy from `.env`)
6. Deploy!

Railway gives you a URL: `your-app.railway.app`

---

## First Client Test

```bash
# 1. Onboard test client
npm run onboard

# 2. Run dry-run campaign (previews, doesn't send)
npm run campaign 1

# 3. If previews look good, send for real
npm run campaign 1 --send --limit=10

# 4. Check dashboard
npm run dashboard
# Open: http://localhost:3000
```

---

## Cron Setup (Automated Follow-ups)

Once deployed to Railway:

1. Add Railway Cron (free):
   - Service: caesars-legions
   - Schedule: `0 9 * * *` (9 AM daily)
   - Command: `npm run followups -- --send`

2. This auto-sends:
   - 3-day follow-ups (to anyone who didn't reply)
   - 7-day follow-ups (final touch)

---

## Cost Breakdown

**To launch:**
- OpenAI: $20 one-time (or $0.002/email ongoing)
- Instantly: $37/mo
- Railway: Free tier (enough for 10 clients)
- Total: ~$40/mo

**Per client:**
- 100 emails/week = 400/month
- OpenAI cost: $0.80/month
- Instantly: included in $37
- **Profit margin: 84%** ($250 - $40 = $210)

---

## Troubleshooting

**"OpenAI error"**
- Check key is correct (starts with `sk-`)
- Check you have credits: https://platform.openai.com/usage

**"Instantly API error"**
- Check email account is connected
- Check campaign ID is correct
- Check webhook is set up

**"Apollo API error"**
- Comment out APOLLO_API_KEY in .env
- System will use mock leads instead

---

## Ready to Launch?

✅ API keys in `.env`  
✅ Test email generated successfully  
✅ Deployed to Railway  
✅ Webhook configured  
✅ First client onboarded  

**Then:** Run first campaign with `--send` flag and you're LIVE 🚀

---

🏛️ Questions? Check README.md or DEPLOYMENT.md
