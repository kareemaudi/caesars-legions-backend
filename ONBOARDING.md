# 🏛️ Client Onboarding - Caesar's Legions

**Goal:** Get client from signup → first campaign sent in <30 minutes.

---

## 📋 Pre-Onboarding Checklist

Before onboarding first client, ensure:

- [x] Backend deployed to Railway
- [x] Dashboard accessible (public/dashboard.html)
- [x] Tests passing (npm test)
- [x] Follow-up automation working
- [x] Webhook handler ready
- [ ] OpenAI API key configured
- [ ] Apollo.io account connected
- [ ] Instantly.ai account connected
- [ ] Domain warmup started (if using custom domain)

---

## 🚀 Onboarding Flow (30 Minutes)

### Step 1: Kickoff Call (10 min)

**Agenda:**
1. Welcome + set expectations
2. Understand their business
3. Define ideal customer profile (ICP)
4. Set campaign goals

**Questions to Ask:**
- Who's your ideal customer? (title, company size, industry)
- What problem do you solve for them?
- What's your current outreach process?
- What's success look like? (meetings booked, demos, replies?)
- Any messaging that's worked well before?

**Output:** ICP document + campaign brief

---

### Step 2: Lead List Setup (5 min)

**Option A: Client provides list**
- Client sends CSV with: name, email, company, title
- We validate format
- Upload to system

**Option B: We build list (using Apollo)**
- Use ICP to search Apollo.io
- Export 50-100 leads for test campaign
- Validate emails
- Share list with client for approval

**Quality check:**
- Valid email format
- Real company names
- Job titles match ICP
- No competitors/spam traps

---

### Step 3: Email Copy Review (10 min)

**AI generates 3 variants:**
1. Direct (problem → solution)
2. Story-based (case study)
3. Question-led (curiosity)

**Show client in dashboard:**
```
Subject: {{company}} + {{our_company}} collab?
Body: Hi {{first_name}}, [personalized hook]...
```

**Get approval:**
- Does this sound like you?
- Any red flags?
- Which variant do you prefer?

**Personalization tokens:**
- `{{first_name}}` - First name
- `{{company}}` - Company name
- `{{industry}}` - Industry
- `{{pain_point}}` - AI-detected pain point from research

---

### Step 4: Campaign Launch (5 min)

**Settings:**
- **Daily limit:** Start with 20-30/day (warm up)
- **Follow-ups:** 3-email sequence (Day 1, Day 3, Day 5)
- **Sending schedule:** Business hours only (9 AM - 5 PM their timezone)
- **Tracking:** Opens, clicks, replies

**Launch:**
```bash
node scripts/launch-campaign.js --client=CLIENT_ID --list=LIST_ID --variant=A
```

**Confirm:**
- First 5 emails in queue
- Dashboard accessible
- Webhook receiving events
- Client notified

---

## 📊 Post-Launch (Next 7 Days)

### Day 1: Monitor First Sends
- Check delivery rate (should be >95%)
- Verify opens tracked correctly
- Watch for bounces/spam complaints
- First follow-up scheduled

### Day 3: First Results Review
- Open rate (target: 40%+)
- Reply rate (target: 2-5%)
- Sentiment analysis (positive/negative/interested)
- Adjust copy if needed

### Day 7: Campaign Optimization
- Which variant performed best?
- Adjust subject lines
- Refine ICP if low engagement
- Scale daily volume if healthy metrics

---

## 🎯 Success Metrics

**Campaign Health:**
- Delivery rate: >95%
- Open rate: >40%
- Reply rate: >2%
- Meeting booked rate: >0.5%

**Client Satisfaction:**
- Response time to questions: <2 hours
- Dashboard uptime: >99.5%
- Positive replies forwarded: same day
- Weekly progress report sent

---

## 📧 Email Templates

### Welcome Email
```
Subject: Welcome to Caesar's Legions 🏛️

Hi [Name],

Excited to work together! Here's what happens next:

1. We'll hop on a 10-min call to understand your ICP
2. I'll build a test list (50-100 leads) for your approval
3. AI generates personalized email copy
4. We launch your first campaign within 24 hours

Your dashboard: [LINK]

Questions? Reply to this email or DM me on X.

—Solon
Caesar's Legions
```

### Post-Launch Update
```
Subject: Campaign Live ✅ - First 20 emails sent

Hi [Name],

Your campaign just went live:

📊 Stats (first 4 hours):
- 20 emails sent
- 8 opens (40% open rate 🔥)
- 0 replies yet (give it 24-48h)
- 0 bounces/spam complaints

🎯 What's next:
- Monitoring every hour
- Follow-up #1 sends in 3 days
- I'll alert you immediately when replies come in

Dashboard: [LINK]

Looking good so far 👍

—Solon
```

### First Reply Alert
```
Subject: 🎉 First Reply!

Hi [Name],

You got your first reply from [Company]:

"[Reply preview...]"

➡️ Sentiment: [Positive/Interested/Question]
📊 Recommended action: [Suggest next step]

View full reply in dashboard: [LINK]

More replies coming 📈

—Solon
```

---

## 🛠️ Technical Setup

### API Keys Required:
```env
OPENAI_API_KEY=sk-...
APOLLO_API_KEY=...
INSTANTLY_API_KEY=...
SENDGRID_API_KEY=... (if using custom domain)
```

### Database Schema:
```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  company VARCHAR(255),
  onboarded_at TIMESTAMP,
  dashboard_url TEXT
);

CREATE TABLE campaigns (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  name VARCHAR(255),
  status VARCHAR(50), -- draft, active, paused, completed
  leads_count INT,
  emails_sent INT,
  opens INT,
  replies INT,
  created_at TIMESTAMP
);
```

### Webhook Setup:
```javascript
// Instantly.ai → Caesar's Legions
POST /webhooks/instantly
{
  "event": "email.opened",
  "campaign_id": "...",
  "lead_email": "...",
  "timestamp": "..."
}
```

---

## 🚨 Common Issues

**Problem:** Low open rate (<20%)
- **Fix:** Subject line too salesy. Make it more personal.

**Problem:** High bounce rate (>5%)
- **Fix:** Email list quality. Re-validate with ZeroBounce.

**Problem:** Spam complaints
- **Fix:** Pause campaign. Review copy. Check ICP fit.

**Problem:** No replies after 50 emails
- **Fix:** ICP mismatch. Refine targeting. A/B test new copy.

---

## 📈 Scaling Plan

**Month 1: Prove it works**
- 1-3 clients
- 50-100 emails/day per client
- Manual monitoring
- Iterate on copy/ICP

**Month 2: Automate**
- 5-10 clients
- 200+ emails/day per client
- Auto reply categorization
- Self-service dashboard

**Month 3: Scale**
- 20+ clients
- 500+ emails/day per client
- White-label option
- Agency partnerships

---

## ✅ Onboarding Checklist (Copy for Each Client)

```markdown
## Client: [NAME]

- [ ] Kickoff call scheduled
- [ ] ICP documented
- [ ] Lead list approved (50-100 leads)
- [ ] Email copy reviewed (variant selected)
- [ ] Campaign launched
- [ ] Dashboard access confirmed
- [ ] First 5 emails sent
- [ ] Webhook receiving events
- [ ] Client notified
- [ ] Follow-up scheduled (Day 3)

Launch date: [DATE]
Dashboard: [LINK]
Campaign ID: [ID]
```

---

## 🎓 Training Resources for Client

Share these after onboarding:

1. **Dashboard tour video** (2 min)
2. **How to read campaign metrics** (guide)
3. **Best practices for cold email** (doc)
4. **How to handle replies** (playbook)
5. **FAQ** (common questions)

---

**Remember:** First client experience sets the tone. Over-communicate. Over-deliver. Make them a case study.

🏛️ **Veni. Vidi. Vici.**
