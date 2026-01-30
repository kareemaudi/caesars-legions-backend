# ⚡ Caesar's Legions - 5 Minute Quickstart (100% Free)

**Get your first cold email campaign running with ZERO paid dependencies.**

---

## Step 1: Get OpenAI API Key (2 min)

1. Go to: https://platform.openai.com/api-keys
2. Sign up (or log in)
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)

---

## Step 2: Setup Gmail SMTP (2 min)

1. Go to: https://myaccount.google.com/security
2. Enable **2-Factor Authentication** (if not already)
3. Click **App Passwords**
4. Select "Mail" → "Other (Custom name)" → "Caesar Legions"
5. Copy the **16-character password**

---

## Step 3: Configure Caesar (30 seconds)

```bash
cd caesars-legions-backend

# Create .env file
cat > .env << 'EOF'
OPENAI_API_KEY=sk-your-key-here
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
PHYSICAL_ADDRESS=123 Your St, City, State, ZIP
BASE_URL=http://localhost:3000
PORT=3000
EOF

# Install dependencies
npm install
```

---

## Step 4: Test It (30 seconds)

```bash
# Test SMTP connection
node -e "
const { smtpSender } = require('./lib/smtp-sender');
smtpSender.sendEmail({
  to: 'YOUR-EMAIL@gmail.com',
  subject: 'Test from Caesar',
  body: 'It works! 🏛️',
  fromEmail: process.env.SMTP_USER
}).then(console.log);
"
```

**Expected output:** `{ success: true, messageId: '...', to: 'YOUR-EMAIL@gmail.com' }`

Check your inbox. You should see the test email.

---

## Step 5: Onboard Your First Client (1 min)

```bash
npm run onboard
```

**Enter:**
- Email: test@test.com
- Name: Test Client
- Company: Test SaaS Inc
- Target audience: B2B SaaS founders
- Value prop: We help you scale with AI
- Website: https://test.com

---

## Step 6: Gather Leads (FREE) (1 min)

```bash
node -e "
const { gatherLeads } = require('./lib/lead-scraper');
const db = require('./lib/db');

gatherLeads({ limit: 10 }).then(leads => {
  console.log('Found', leads.length, 'leads');
  leads.forEach(lead => {
    db.insertLead({
      campaign_id: 1,
      email: lead.email,
      first_name: lead.first_name,
      last_name: lead.last_name,
      company: lead.company,
      title: lead.title,
      source: lead.source
    });
  });
  console.log('✓ Leads imported');
});
"
```

**Sources:**
- Reddit (r/SaaS, r/indiehackers)
- Hacker News
- Indie Hackers

---

## Step 7: Run Your First Campaign (DRY RUN) (30 seconds)

```bash
npm run campaign 1
```

**Output:**
- Shows 10 personalized emails
- Displays subject lines + previews
- **Does NOT send** (dry run)

---

## Step 8: Send Real Emails (10 seconds)

```bash
npm run campaign 1 --send --limit=5
```

**Sends 5 real emails via Gmail SMTP.**

---

## Step 9: Check Dashboard (10 seconds)

```bash
npm run dashboard
```

Open: **http://localhost:3000**

**You'll see:**
- Emails sent: 5
- Open rate: 0% (initial)
- Reply rate: 0% (initial)
- Recent emails list

---

## What You Just Built

✅ **$0/mo cold email system**  
✅ Lead sourcing (Reddit, HN, Indie Hackers)  
✅ Email generation (GPT-4)  
✅ Email sending (Gmail SMTP)  
✅ Dashboard + analytics  
✅ CAN-SPAM compliant (unsubscribe system)  
✅ Follow-up automation (3-day, 7-day)

**vs. traditional setup:**
- Apollo.io: ❌ Saved $49/mo
- Instantly.ai: ❌ Saved $37/mo
- Total savings: **$1,032/year**

---

## Next Steps

### Improve Lead Quality

**Option 1: Manual CSV Import**
```bash
# Create leads.csv
echo "email,first_name,last_name,company" > leads.csv
echo "john@example.com,John,Doe,Example Inc" >> leads.csv

# Import
node -e "
const { importFromCSV } = require('./lib/lead-scraper');
const db = require('./lib/db');

const leads = importFromCSV('leads.csv');
leads.forEach(lead => {
  db.insertLead({ campaign_id: 1, ...lead });
});
console.log('✓ Imported', leads.length, 'leads');
"
```

**Option 2: Twitter Scraping**
- Get Twitter API bearer token (free tier: 500K tweets/mo)
- Add to `.env`: `TWITTER_BEARER_TOKEN=...`
- Enable in lead scraper

**Option 3: Hunter.io Email Verification**
- Sign up: https://hunter.io (free tier: 25 searches/mo)
- Add to `.env`: `HUNTER_API_KEY=...`
- Verify emails before sending

---

### Scale Sending

**Gmail limits:**
- Free: 500 emails/day
- Workspace: 2,000 emails/day

**When you outgrow Gmail:**

**SendGrid (recommended):**
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```
- Free tier: 100 emails/day
- $15/mo: 40,000 emails/month

**AWS SES (cheapest for volume):**
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-ses-smtp-username
SMTP_PASS=your-ses-smtp-password
```
- $0.10 per 1,000 emails
- $1/mo for 10,000 emails

---

### Deploy to Production

**Option 1: Railway (easiest)**
```bash
git init
git add .
git commit -m "Caesar's Legions"
railway login
railway init
railway add
```

Add environment variables in Railway dashboard, then deploy.

**Option 2: Heroku**
```bash
heroku create caesars-legions
heroku config:set OPENAI_API_KEY=sk-...
heroku config:set SMTP_HOST=smtp.gmail.com
# ... add all env vars
git push heroku main
```

**Option 3: DigitalOcean App Platform**
- Push to GitHub
- Create app from GitHub repo
- Add environment variables
- Deploy

---

## Troubleshooting

**"SMTP connection failed"**
- Check Gmail App Password is correct (16 characters, no spaces)
- Make sure 2FA is enabled on Google account
- Try regenerating the App Password

**"Daily limit reached"**
- Default limit: 50 emails/day
- Change in `lib/smtp-sender.js`: `this.maxPerDay = 100;`
- Or use SendGrid/AWS SES

**"Email going to spam"**
- Warm up: Start with 10/day, increase slowly
- Personalize subject lines
- Avoid spammy words (FREE, URGENT)
- Use plain text (not HTML)

**"No leads found"**
- Reddit/HN require internet connection
- Check rate limits (Reddit: 60 requests/min)
- Try manual CSV import instead

---

## Summary

**You just built a cold email system that costs $20/mo (OpenAI only) instead of $106/mo.**

**What's included:**
- ✅ Lead sourcing (Reddit, HN, Indie Hackers)
- ✅ Email generation (GPT-4)
- ✅ SMTP sending (Gmail/SendGrid/AWS SES)
- ✅ Follow-ups (3-day, 7-day)
- ✅ Dashboard + analytics
- ✅ Unsubscribe system (CAN-SPAM)
- ✅ Webhook tracking (opens, clicks, replies)

**No paid dependencies. Full control. Zero vendor lock-in.**

---

🏛️ **Veni. Vidi. Vici.** Now go get your first client.
