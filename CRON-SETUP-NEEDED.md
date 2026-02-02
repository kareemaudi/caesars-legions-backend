# 🕐 Cron Setup Required

**Status:** Not yet configured (gateway timeout)  
**Priority:** Medium (needed before first client onboarding)  
**Created:** 2026-02-02

---

## What Needs Setup

Caesar's Legions has automated follow-up and reporting systems ready, but they need to be scheduled via Clawdbot's cron system.

---

## 1. Daily Follow-ups (Every 6 hours)

**Purpose:** Automatically send 3-day and 7-day follow-ups to leads

**Command:**
```bash
cron action=add \
  schedule="0 */6 * * *" \
  text="Run Caesar's Legions follow-up automation: cd caesars-legions-backend && node cron/process-follow-ups.js --live" \
  contextMessages=0
```

**What it does:**
- Checks all campaigns for leads needing follow-ups
- Sends emails during business hours only (9 AM - 5 PM)
- Logs results to `logs/follow-ups.jsonl`
- Respects unsubscribes and bounces

**First run:** After first campaign launches (Day 3+)

---

## 2. Weekly Reports (Monday 9 AM)

**Purpose:** Send performance summary to clients

**Command:**
```bash
cron action=add \
  schedule="0 9 * * 1" \
  text="Generate Caesar's Legions weekly reports: cd caesars-legions-backend && node cron/weekly-report.js" \
  contextMessages=0
```

**What it does:**
- Calculates week's metrics (emails sent, opens, replies)
- Generates recommendations
- Sends email to each active client
- Logs to `logs/weekly-reports.jsonl`

**First run:** After first full week of operation

---

## 3. Metrics Update (Every hour)

**Purpose:** Keep dashboard metrics fresh

**Command:**
```bash
cron action=add \
  schedule="0 * * * *" \
  text="Update Caesar's Legions metrics: cd caesars-legions-backend && node cron/update-metrics.js" \
  contextMessages=0
```

**What it does:**
- Updates `memory/metrics-YYYY-MM.json`
- Checks for anomalies (sudden drops in performance)
- Alerts admin if issues detected

**First run:** As soon as setup

---

## Testing Before Scheduling

Run each cron job manually first:

```bash
# Follow-ups (dry run)
cd caesars-legions-backend
DRY_RUN=true node cron/process-follow-ups.js

# Follow-ups (live - actually sends)
node cron/process-follow-ups.js --live

# Weekly report (if you have client data)
node cron/weekly-report.js

# Metrics update
node cron/update-metrics.js
```

---

## Verification

After adding cron jobs:

```bash
# List all cron jobs
cron action=list

# Check logs for execution
tail -f caesars-legions-backend/logs/follow-ups.jsonl
tail -f caesars-legions-backend/logs/weekly-reports.jsonl
```

---

## Current Status

✅ **Ready:**
- Follow-up automation code (`lib/follow-ups.js`)
- Cron scripts (`cron/process-follow-ups.js`, etc.)
- Transactional email system (`lib/transactional-emails.js`)
- SMTP configured (Zoho, 49/50 sends remaining today)

⏳ **Waiting:**
- Clawdbot gateway running (currently timeout)
- First client to test automation with

🔧 **Next Steps:**
1. Start Clawdbot gateway: `clawdbot gateway start`
2. Add the 3 cron jobs above
3. Test with `cron action=list` to verify they're scheduled
4. Monitor logs after first campaign launches

---

## Alternative: Manual Execution

If cron isn't available yet, you can run follow-ups manually:

```bash
# Every 6 hours, run:
cd caesars-legions-backend && node cron/process-follow-ups.js --live

# Every Monday, run:
node cron/weekly-report.js
```

Or trigger from another cron system (Linux crontab, Windows Task Scheduler):

```bash
# Linux crontab
0 */6 * * * cd /path/to/caesars-legions-backend && node cron/process-follow-ups.js --live
0 9 * * 1 cd /path/to/caesars-legions-backend && node cron/weekly-report.js
```

---

🏛️ **Built and ready. Just needs scheduling.**
