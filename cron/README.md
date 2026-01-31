# Caesar's Legions - Cron Jobs

Automated tasks that run on schedule via Clawdbot cron system.

---

## Setup

Add these cron jobs to Clawdbot:

### 1. Daily Follow-ups (10 AM)

```bash
cron action=add \
  schedule="0 10 * * *" \
  text="Run Caesar's Legions daily follow-up automation: node caesars-legions-backend/cron/daily-follow-ups.js" \
  contextMessages=0
```

**What it does:**
- Sends 3-day and 7-day follow-ups automatically
- Respects business hours (9 AM - 5 PM, configurable)
- Logs results to `memory/followup-log.jsonl`

---

### 2. Hourly Metrics (Every hour)

```bash
cron action=add \
  schedule="0 * * * *" \
  text="Update Caesar's Legions metrics: node caesars-legions-backend/cron/update-metrics.js" \
  contextMessages=0
```

**What it does:**
- Updates dashboard metrics (MRR, clients, emails sent)
- Checks for new replies/bounces
- Alerts on anomalies (sudden drop in open rate, etc.)

---

### 3. Weekly Report (Monday 9 AM)

```bash
cron action=add \
  schedule="0 9 * * 1" \
  text="Generate Caesar's Legions weekly report: node caesars-legions-backend/cron/weekly-report.js" \
  contextMessages=0
```

**What it does:**
- Summarizes week's performance
- Top clients, best-performing campaigns
- Recommendations for next week

---

## Testing

Run manually to test:

```bash
# Dry run (doesn't send emails)
DRY_RUN=true node caesars-legions-backend/cron/daily-follow-ups.js

# Live run (actually sends)
node caesars-legions-backend/cron/daily-follow-ups.js
```

---

## Configuration

Edit `lib/follow-ups.js` to change:
- Follow-up delays (default: 3 days, 7 days)
- Business hours (default: 9 AM - 5 PM)
- Timezone (default: America/New_York)
- Max follow-ups (default: 2)

---

## Logs

- **Follow-up activity:** `memory/followup-log.jsonl`
- **Errors:** `memory/followup-errors.jsonl`
- **Metrics:** `memory/metrics-YYYY-MM.json`

---

## Monitoring

Heartbeat checks these logs every 6 hours and alerts on:
- Errors during follow-up sending
- Sudden drop in send volume
- API rate limits hit

---

🏛️ **Veni. Vidi. Vici.**
