# 🏥 Monitoring & Health Checks

**Caesar's Legions Monitoring System**

Automated health monitoring and alerting to keep your email campaigns running smoothly 24/7.

---

## 🎯 What Gets Monitored

| Check | What It Does | Alert Level |
|-------|--------------|-------------|
| **Database** | Verifies SQLite database is accessible and writable | 🚨 Critical |
| **OpenAI API** | Checks API key validity and quota | 🚨 Critical |
| **Apollo API** | Verifies lead data source is working | ⚠️ Warning |
| **Instantly API** | Checks email sending service is available | ⚠️ Warning |
| **Disk Space** | Ensures data directory is writable | 🚨 Critical |
| **Memory Usage** | Monitors for memory leaks (alerts >1GB RSS) | ⚠️ Warning |
| **Webhook URL** | Verifies public webhook endpoint is reachable | ℹ️ Info |

---

## 🚀 Quick Start

### 1. View Current Status

```bash
# Interactive dashboard (recommended)
node scripts/monitoring-dashboard.js

# Simple health check
node lib/health-monitor.js
```

**Example Output:**
```
🏥 Running health checks...

📊 Health Check Results:

✅ database: Database connection OK
✅ openai: OpenAI API key valid (57 models available)
⚠️ apollo: Apollo API key not configured (optional)
✅ instantly: Instantly account OK (2 email accounts connected)
✅ diskSpace: Data directory writable
✅ memory: Heap: 45MB / 128MB, RSS: 156MB
✅ webhookUrl: Webhook URL reachable (ok)

✅ All systems operational!
```

### 2. Set Up Automated Monitoring

#### Option A: Clawdbot Cron (Recommended for Development)

Add to your Clawdbot configuration:

```json
{
  "cron": [
    {
      "name": "Caesar's Legions Health Check",
      "schedule": "*/15 * * * *",
      "command": "cd caesars-legions-backend && node cron/health-check.js",
      "notify": true
    }
  ]
}
```

#### Option B: System Cron (Recommended for Production)

```bash
# Edit crontab
crontab -e

# Add this line (runs every 15 minutes)
*/15 * * * * cd /path/to/caesars-legions-backend && node cron/health-check.js >> logs/health-cron.log 2>&1
```

#### Option C: PM2 (If using PM2 for process management)

```bash
# Install PM2 if not already installed
npm install -g pm2

# Start health check as a cron job
pm2 start cron/health-check.js --cron "*/15 * * * *" --name "health-check"
pm2 save
```

---

## 📱 Alert Configuration

### Telegram Alerts (Recommended)

Get instant notifications when something breaks:

**1. Create Telegram Bot:**
- Message [@BotFather](https://t.me/BotFather) on Telegram
- Send `/newbot` and follow prompts
- Copy your bot token

**2. Get Your Chat ID:**
- Message your new bot (say "Hello")
- Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
- Copy the `chat.id` from the response

**3. Add to Environment:**

```bash
# .env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

**4. Test:**

```bash
node -e "require('./lib/health-monitor').sendAlert('Test Alert', 'If you see this, Telegram is configured correctly!', 'info')"
```

### Alert Examples

**Critical Alert (🚨):**
```
🚨 Database Connection Failed

Cannot connect to database.

Error: ENOENT: no such file or directory

_Caesar's Legions Health Monitor_
```

**Warning Alert (⚠️):**
```
⚠️ High Memory Usage

Memory usage is elevated:
- Heap: 256MB / 512MB
- RSS: 1.2GB

Consider restarting the service.

_Caesar's Legions Health Monitor_
```

**Recovery Alert (✅):**
```
✅ System Recovered

All health checks passing after 3 consecutive failures.

System is back online.

_Caesar's Legions Health Monitor_
```

---

## 📊 Monitoring Dashboard

**Launch the interactive dashboard:**

```bash
node scripts/monitoring-dashboard.js
```

**Shows:**
- Real-time health status (color-coded)
- System info (Node version, uptime, memory)
- Last 24h metrics (emails sent, campaigns, replies)
- Recent errors (last 5)
- API key status (configured/missing)

**Example:**
```
┌──────────────────────────────────────────────────────────┐
│ 📊 System Info                                           │
├──────────────────────────────────────────────────────────┤
│ Node.js: v18.17.0 | Platform: linux                      │
│ Environment: production | Uptime: 3h 24m                 │
│ Memory: 156MB | PID: 12345                               │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 📈 Last 24 Hours                                         │
├──────────────────────────────────────────────────────────┤
│ Emails Sent: 342                                         │
│ Campaigns Active: 5                                      │
│ Leads Added: 127                                         │
│ Replies Received: 18                                     │
│ Open Rate: 28.4%                                         │
│ Reply Rate: 5.3%                                         │
└──────────────────────────────────────────────────────────┘
```

---

## 🔍 Health Check Details

### Database Check
- **What:** Attempts to query SQLite database
- **Fails if:** File permissions issue, disk full, corrupted database
- **Fix:** Check file permissions, free up disk space, restore from backup

### OpenAI API Check
- **What:** Validates API key by listing available models
- **Fails if:** Invalid key, quota exceeded, API outage
- **Fix:** Check key in `.env`, verify billing status on OpenAI dashboard

### Apollo API Check
- **What:** Calls Apollo health endpoint
- **Fails if:** Invalid key, quota exceeded, API outage
- **Fix:** Check key in `.env`, verify credits on Apollo dashboard

### Instantly API Check
- **What:** Fetches account info and connected email accounts
- **Fails if:** Invalid key, account suspended, API outage
- **Fix:** Check key in `.env`, verify account status on Instantly dashboard

### Disk Space Check
- **What:** Writes test file to data directory
- **Fails if:** No write permissions, disk full
- **Fix:** Check file permissions, free up disk space

### Memory Check
- **What:** Monitors Node.js heap and RSS memory usage
- **Fails if:** Memory usage >1GB RSS (possible memory leak)
- **Fix:** Restart service, investigate memory leaks in code

### Webhook URL Check
- **What:** Verifies public webhook endpoint is reachable
- **Fails if:** Server down, firewall blocking, wrong URL
- **Fix:** Check deployment status, verify URL in `.env`

---

## 🛠️ Troubleshooting

### Issue: Health checks fail immediately

**Symptoms:** All checks show "critical" or script crashes

**Possible Causes:**
- Missing dependencies (run `npm install`)
- Wrong working directory
- Missing `.env` file

**Fix:**
```bash
cd caesars-legions-backend
npm install
cp .env.template .env
# Edit .env and add your API keys
node lib/health-monitor.js
```

### Issue: Telegram alerts not sending

**Symptoms:** Health checks run but no Telegram messages

**Possible Causes:**
- Missing `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID`
- Bot not started (need to message it first)
- Wrong chat ID

**Fix:**
```bash
# Verify environment variables are set
node -e "console.log('Token:', process.env.TELEGRAM_BOT_TOKEN); console.log('Chat ID:', process.env.TELEGRAM_CHAT_ID)"

# Test alert manually
node -e "require('./lib/health-monitor').sendAlert('Test', 'This is a test', 'info')"
```

### Issue: False positives (alerts when everything is fine)

**Symptoms:** Getting alerts but system works fine

**Possible Causes:**
- Network blips (temporary)
- API rate limits
- Overly sensitive thresholds

**Fix:**
- Check `health-state.json` for consecutive failure count
- Adjust alert frequency in `cron/health-check.js`
- Increase thresholds in `lib/health-monitor.js` if needed

---

## 📈 Performance Benchmarks

**Health Check Performance:**
- Full check suite: ~2-3 seconds
- Database check: <100ms
- API checks: ~500ms each (depends on network)
- Disk/memory checks: <50ms

**Resource Usage:**
- Memory overhead: ~10MB
- CPU usage: <1% (only during checks)
- Disk I/O: Minimal (one small file write)

---

## 🔮 Future Enhancements

Planned improvements:

- [ ] **Uptime Dashboard:** Web UI showing 7-day uptime history
- [ ] **Advanced Metrics:** Track API latency, error rates, throughput
- [ ] **Predictive Alerts:** Detect trends before they become critical
- [ ] **Integration with Datadog/New Relic:** Enterprise monitoring
- [ ] **Custom Alert Rules:** User-configurable thresholds
- [ ] **SMS Alerts:** For critical issues (via Twilio)
- [ ] **Slack Integration:** Post alerts to Slack channel

---

## 📞 Need Help?

**Health checks failing and can't figure out why?**
1. Run `node scripts/monitoring-dashboard.js` to see full status
2. Check logs: `tail -f logs/errors.log`
3. Review recent health reports: `ls -la logs/health-*.json`
4. Contact support: kareem@caesarslegions.com

---

**Remember:** Good monitoring = fewer 3 AM emergencies 🌙

🏛️ Veni. Vidi. Vici.
