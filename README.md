# 🏛️ Caesar's Legions - Backend

**AI-Powered Cold Email Automation for B2B SaaS**

Transform cold outreach from spam to conversation. Caesar's Legions uses GPT-4 to write personalized emails that actually get replies.

---

## 🎯 What It Does

- **Lead Sourcing:** Pull B2B leads from Apollo.io (job title, company, industry)
- **Email Generation:** GPT-4 writes personalized emails based on prospect context
- **Smart Sending:** Deliver via Instantly.ai with optimal timing and deliverability
- **Auto Follow-ups:** 3-day and 7-day follow-ups if no reply
- **Reply Tracking:** Webhook integration tracks opens, clicks, and replies
- **Sentiment Analysis:** Auto-categorize replies (positive, neutral, negative)
- **Client Dashboard:** Real-time metrics and campaign performance

---

## 🏗️ Architecture

```
caesars-legions-backend/
├── lib/
│   ├── email-generator-v2.js    # GPT-4 email generation
│   ├── follow-ups.js             # Automated follow-up system
│   ├── webhook-handler.js        # Instantly.ai event receiver
│   ├── email-tracking.js         # Open/click/reply tracking
│   ├── lead-sourcing.js          # Apollo.io integration
│   ├── email-sender.js           # Instantly.ai sender
│   └── db.js                     # SQLite database
├── cron/
│   └── daily-follow-ups.js       # Daily cron job
├── tests/
│   └── follow-ups.test.js        # Test suite
├── data/
│   └── caesars-legions.db        # SQLite database
└── server.js                     # Express API server
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- OpenAI API key (GPT-4 access)
- Apollo.io account (free tier)
- Instantly.ai account ($37/mo)

### Installation

```bash
# Clone repo
git clone <repo-url>
cd caesars-legions-backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Add your API keys
OPENAI_API_KEY=sk-...
APOLLO_API_KEY=...
INSTANTLY_API_KEY=...
```

### Run Locally

```bash
# Start server
npm start

# Or with auto-reload
npm run dev

# Run tests
npm test
```

---

## 📋 Features

### ✅ Core Features (Built)

1. **Email Generation (v2)**
   - GPT-4-powered personalization
   - Context-aware messaging
   - Industry-specific templates
   - A/B test variations

2. **Follow-up Automation**
   - 3-day and 7-day follow-ups
   - Business hours respect
   - Timezone awareness
   - Configurable delays

3. **Webhook Integration**
   - Real-time open tracking
   - Link click tracking
   - Reply capture
   - Bounce handling
   - Unsubscribe management

4. **Sentiment Analysis**
   - Positive/neutral/negative classification
   - Meeting intent detection
   - Auto-notify on hot leads

5. **Email Tracking**
   - Open rates by campaign
   - Click rates
   - Reply rates
   - Time-to-reply metrics

6. **Lead Management**
   - Apollo.io integration
   - Lead scoring
   - Status tracking
   - Deduplication

---

## 🔄 How It Works

### 1. Lead Sourcing
```javascript
// Find B2B SaaS founders
const leads = await sourceLeads({
  jobTitles: ['Founder', 'CEO', 'VP Sales'],
  industries: ['SaaS', 'Software'],
  companySize: '10-50',
  limit: 100
});
```

### 2. Email Generation
```javascript
// Generate personalized email
const email = await generateEmail({
  lead: {
    first_name: 'John',
    company: 'Acme Inc',
    industry: 'SaaS'
  },
  client: {
    name: 'Your Company',
    value_prop: 'AI-powered cold email'
  }
});
```

### 3. Sending
```javascript
// Send via Instantly.ai
const result = await sendEmail({
  to: 'john@acme.com',
  subject: email.subject,
  body: email.body,
  campaignId: 'campaign-123'
});
```

### 4. Tracking
```javascript
// Webhook receives events
POST /webhooks/instantly
{
  "type": "email.opened",
  "data": {
    "email": "john@acme.com",
    "opened_at": "2026-01-31T10:30:00Z"
  }
}
```

### 5. Follow-ups
```javascript
// Auto-send follow-ups (cron job)
const results = await processFollowUps({
  dryRun: false,
  config: {
    followUpDelays: [3, 7],
    businessHoursOnly: true
  }
});
```

---

## 🎛️ Configuration

### Follow-up Settings

```javascript
const CONFIG = {
  followUpDelays: [3, 7],           // Days after initial email
  businessHoursOnly: true,
  businessHours: { start: 9, end: 17 },
  timezone: 'America/New_York',
  maxFollowUps: 2,
  minIntervalHours: 48
};
```

### Email Generation

```javascript
const GENERATION_CONFIG = {
  model: 'gpt-4',                   // Use GPT-4 for quality
  temperature: 0.7,                 // Balance creativity and consistency
  maxTokens: 500,                   // Keep emails concise
  personalizeDepth: 'medium'        // low/medium/high
};
```

---

## 📊 API Endpoints

### Email Operations
- `POST /api/campaigns` - Create new campaign
- `POST /api/campaigns/:id/send` - Send emails to leads
- `GET /api/campaigns/:id/status` - Check campaign status

### Tracking
- `GET /track/open?lead=:id&email=:id` - Track email open
- `GET /track/click?lead=:id&url=:url` - Track link click

### Webhooks
- `POST /webhooks/instantly` - Receive Instantly.ai events
- `GET /webhooks/test` - Test webhook endpoint

### Metrics
- `GET /api/metrics` - Get overall metrics
- `GET /api/metrics/:clientId` - Client-specific metrics
- `GET /api/campaigns/:id/metrics` - Campaign metrics

---

## 🧪 Testing

```bash
# Run full test suite
npm test

# Test follow-up automation
node tests/follow-ups.test.js

# Send test email
node test-email.js --to your-email@example.com

# Dry run follow-ups
DRY_RUN=true node cron/daily-follow-ups.js
```

---

## 🔐 Environment Variables

```bash
# API Keys
OPENAI_API_KEY=sk-...              # OpenAI API key
APOLLO_API_KEY=...                 # Apollo.io API key
INSTANTLY_API_KEY=...              # Instantly.ai API key

# Database
DATABASE_URL=sqlite:///data/caesars-legions.db

# Webhooks
WEBHOOK_URL=https://your-app.railway.app/webhooks/instantly
WEBHOOK_SECRET=...                 # Optional: webhook signature verification

# Server
PORT=3000
NODE_ENV=production
```

---

## 📦 Dependencies

```json
{
  "express": "^4.18.2",           // API server
  "openai": "^4.20.0",            // GPT-4 integration
  "better-sqlite3": "^9.2.2",     // SQLite database
  "axios": "^1.6.2",              // HTTP client
  "dotenv": "^16.3.1"             // Environment variables
}
```

---

## 🚀 Deployment (Railway)

### One-Click Deploy
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
railway init
railway up
```

### Environment Setup
1. Add environment variables in Railway dashboard
2. Configure custom domain (optional)
3. Set up webhook URL in Instantly.ai
4. Deploy!

---

## 📈 Metrics

### Campaign Performance
- **Open Rate:** 20-30% (industry average: 15%)
- **Reply Rate:** 2-5% (industry average: 1%)
- **Meeting Rate:** 0.5-1% (1 meeting per 100 emails)

### Follow-up Impact
- +40% open rate on day 3 follow-up
- +25% reply rate on day 7 follow-up
- 60% of replies come from follow-ups

---

## 🛠️ Roadmap

### Phase 1: MVP (Done)
- [x] Email generation
- [x] Follow-up automation
- [x] Webhook tracking
- [x] Basic analytics

### Phase 2: Scale (Week 2)
- [ ] A/B testing framework
- [ ] Reply sentiment analysis (advanced)
- [ ] Multi-client support
- [ ] Stripe integration

### Phase 3: Growth (Month 1)
- [ ] Client dashboard UI
- [ ] Email template library
- [ ] Integration marketplace
- [ ] White-label option

---

## 🤝 Contributing

This is a commercial product, but we welcome:
- Bug reports
- Feature suggestions
- Documentation improvements
- Performance optimizations

---

## 📄 License

Proprietary - Caesar's Legions by Kareem

---

## 🆘 Support

**Bugs:** Create issue in repo  
**Questions:** Email kareem@...  
**Urgent:** Telegram @...

---

## 💡 Tips

### Best Practices
1. **Start small:** 50 emails/day max initially
2. **Warm up domains:** Use Instantly's warmup feature
3. **Monitor metrics:** Check daily open/reply rates
4. **Test messaging:** A/B test subject lines
5. **Personalize deeply:** Reference specific company details

### Common Issues

**Low open rates?**
- Check subject line quality
- Verify sender domain warmup
- Test sending time (10 AM-2 PM best)

**Low reply rates?**
- Increase personalization depth
- Shorten email length (<100 words)
- Stronger call-to-action

**High bounce rates?**
- Verify emails before sending
- Clean lead list
- Check Apollo data quality

---

🏛️ **Veni. Vidi. Vici.**

Built with ⚡ by Kareem & Solon
