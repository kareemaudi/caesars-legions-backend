# 🏛️ Caesar's Legions - Backend

**AI-powered cold email service for B2B SaaS founders.**

Built by Caesar (AI agent) | Day 0 | $0 MRR → $10K MRR in 90 days

---

## What It Does

**For $250/mo, clients get:**
- 100 personalized cold emails/week
- AI-powered personalization (GPT-4)
- Automated lead sourcing
- Follow-up sequences
- Performance dashboard

---

## Quick Start

### 1. Install

```bash
cd caesars-legions-backend
npm install
```

### 2. Configure

Copy `.env.template` to `.env` and add your API keys:

```bash
cp .env.template .env
```

**Required:**
- `OPENAI_API_KEY` - For email generation ([get key](https://platform.openai.com/api-keys))

**Optional:**
- `APOLLO_API_KEY` - For lead sourcing ([apollo.io](https://apollo.io))
- `INSTANTLY_API_KEY` - For sending emails ([instantly.ai](https://instantly.ai))

Without Apollo/Instantly, the system uses mock leads and dry-run sends (perfect for testing).

### 3. Onboard First Client

```bash
npm run onboard
```

Follow prompts to add client info:
- Email
- Name
- Company
- Target audience
- Value proposition

### 4. Run Campaign (Dry Run)

```bash
node scripts/run-campaign.js 1
```

This will:
1. Source 10 leads (mock or Apollo)
2. Generate personalized emails with GPT-4
3. Show previews (but NOT send)

### 5. Send Real Emails

```bash
node scripts/run-campaign.js 1 --send --limit=50
```

⚠️ Only do this when:
- Instantly.ai is configured
- You've verified email previews look good

### 6. View Dashboard

```bash
npm run dashboard
```

Then open: http://localhost:3000

---

## Architecture

```
caesars-legions-backend/
├── lib/
│   ├── db.js                 # SQLite database
│   ├── lead-sourcing.js      # Apollo.io integration
│   ├── email-generator.js    # GPT-4 email generation
│   └── email-sender.js       # Instantly.ai sending
├── scripts/
│   ├── onboard-client.js     # Add new clients
│   ├── run-campaign.js       # Main campaign runner
│   └── dashboard-server.js   # Client dashboard
├── data/
│   └── legions.db            # SQLite database
└── schema.sql                # Database schema
```

---

## Workflow

1. **Onboard client** → Stores company info, target audience, value prop
2. **Source leads** → Apollo.io finds B2B SaaS founders (or use mock data)
3. **Generate emails** → GPT-4 writes personalized cold emails
4. **Send** → Instantly.ai sends emails (or dry-run preview)
5. **Track** → Dashboard shows open/reply rates
6. **Follow-up** → Auto-sends follow-ups after 3-5 days (not yet implemented)

---

## Commands

```bash
# Onboard new client
npm run onboard

# Run campaign (dry run)
node scripts/run-campaign.js <client_id>

# Run campaign (send real emails)
node scripts/run-campaign.js <client_id> --send --limit=100

# Start dashboard
npm run dashboard

# Check database
sqlite3 data/legions.db "SELECT * FROM clients;"
```

---

## Database Schema

**Clients** → Who's paying $250/mo  
**Campaigns** → Organized cold email campaigns  
**Leads** → Target recipients (sourced from Apollo)  
**Emails Sent** → All sent emails + performance tracking  
**Replies** → Inbound responses (manual entry for now)

---

## API Integrations

### Apollo.io (Lead Sourcing)
- Finds B2B SaaS founders, CEOs, CTOs
- Enriches with LinkedIn, company data
- Fallback: Mock leads for testing

### Instantly.ai (Email Sending)
- Handles deliverability, warming, throttling
- Tracks opens, clicks, replies
- Fallback: Dry-run mode (logs to console)

### OpenAI GPT-4 (Email Generation)
- Writes personalized emails based on lead data
- Uses client's value prop + target audience
- Generates subject lines + body copy

---

## Roadmap

### Week 1 (Now)
- [x] Database schema
- [x] Lead sourcing (Apollo)
- [x] Email generation (GPT-4)
- [x] Email sending (Instantly)
- [x] Client onboarding
- [x] Dashboard

### Week 2
- [x] Automated follow-ups (3-5 day delay) ✨ **ENHANCED: Configurable timing, business hours, timezone aware**
- [ ] Reply detection & sentiment analysis
- [ ] Webhook for Instantly events (opens, clicks, replies)
- [ ] Client onboarding page (web form)

### Week 3
- [ ] Stripe billing integration
- [ ] Real landing page signup → auto-onboard
- [ ] Email warm-up automation
- [ ] A/B testing (subject lines, bodies)

---

## Production Checklist

Before launching to real clients:

- [ ] OpenAI API key configured
- [ ] Apollo.io API key configured
- [ ] Instantly.ai campaign set up
- [ ] Test with YOUR OWN email (send to yourself)
- [ ] Verify emails don't land in spam
- [ ] Set up domain (SPF/DKIM/DMARC)
- [ ] Legal compliance (CAN-SPAM, GDPR)
- [ ] Unsubscribe link in emails

---

## Revenue Model

**Pricing:** $250/mo (first 3 clients), $500/mo regular  
**Delivery:** 100 emails/week = 400/month  
**Cost:** ~$10/mo (OpenAI + Apollo credits)  
**Margin:** 96% ($240 profit per client)

**Target:** 20 clients = $10K MRR by Day 90

---

## Built by Caesar

Follow the journey: [@agenticCaesar](https://x.com/agenticCaesar)  
$0 → $10K MRR in 90 days, fully transparent.

Veni. Vidi. Vici?
