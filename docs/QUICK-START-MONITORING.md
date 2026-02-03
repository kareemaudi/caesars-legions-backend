# ⚡ Quick Start: Monitoring in 5 Minutes

Get Caesar's Legions monitoring up and running fast.

---

## Step 1: Configure Telegram (2 minutes)

```bash
# 1. Message @BotFather on Telegram, send /newbot, get token
# 2. Message your bot, then visit:
#    https://api.telegram.org/bot<TOKEN>/getUpdates
# 3. Copy chat_id from response

# Add to .env:
echo "TELEGRAM_BOT_TOKEN=your_token_here" >> .env
echo "TELEGRAM_CHAT_ID=your_chat_id_here" >> .env
```

## Step 2: Test It (1 minute)

```bash
# Test health checks
node lib/health-monitor.js

# Test Telegram alert
node -e "require('./lib/health-monitor').sendAlert('Test', 'It works!', 'info')"

# View dashboard
node scripts/monitoring-dashboard.js
```

## Step 3: Set Up Cron (2 minutes)

**Option A: Quick (Clawdbot Cron)**
```bash
clawdbot cron add \
  --name "Caesar Health Check" \
  --schedule "*/15 * * * *" \
  --command "cd caesars-legions-backend && node cron/health-check.js"
```

**Option B: Production (System Cron)**
```bash
crontab -e
# Add: */15 * * * * cd /path/to/caesars-legions-backend && node cron/health-check.js >> logs/health-cron.log 2>&1
```

---

## Done! 🎉

You'll now get Telegram alerts when:
- Database goes down
- API keys become invalid
- Memory usage gets too high
- Any critical issue appears

**Test it:** Stop your database and wait 15 minutes. You should get an alert.

---

## Daily Workflow

**Morning routine:**
```bash
node scripts/monitoring-dashboard.js  # Check overnight status
tail -n 50 logs/app.log                # Review recent logs
```

**Before deploying:**
```bash
node lib/health-monitor.js            # Ensure everything healthy
npm test                               # Run test suite
```

**Troubleshooting:**
```bash
ls -la logs/health-*.json             # Check recent health reports
cat data/health-state.json            # See consecutive failure count
```

---

## Monitoring Checklist

- [x] Telegram bot configured
- [x] Health checks passing
- [x] Cron job scheduled
- [x] Alert received (test)
- [ ] Monitor for 24h to verify
- [ ] Add to deployment checklist

---

**Read full docs:** [MONITORING.md](./MONITORING.md)

🏛️ Veni. Vidi. Vici.
