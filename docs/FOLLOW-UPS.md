# 📧 Automated Follow-up System

**Status:** ✅ Production Ready  
**Last Updated:** 2026-01-31

---

## Overview

Caesar's Legions automatically sends follow-up emails to prospects who haven't replied.

**Default Behavior:**
- **Day 3:** Value-add follow-up (share insight, case study, or data point)
- **Day 7:** Permission-based close ("Should I close this loop?")

**Smart Features:**
- ✅ Business hours only (9 AM - 5 PM in prospect's timezone)
- ✅ Skips if already replied or bounced
- ✅ AI-generated with different angle than original email
- ✅ Rate-limited to avoid spam triggers
- ✅ Tracks follow-up count per lead

---

## Quick Start

### 1. Test the System

```bash
# Dry run (no emails sent)
node caesars-legions-backend/test/follow-ups-test.js
```

### 2. Manual Run (Dry Run)

```bash
# See what would be sent
node caesars-legions-backend/cron/process-follow-ups.js
```

### 3. Manual Run (Live)

```bash
# Actually send emails
node caesars-legions-backend/cron/process-follow-ups.js --live
```

### 4. Schedule Daily (Recommended)

**Option A: Railway Cron (Recommended for production)**

Add to `railway.toml`:

```toml
[cron.followups]
schedule = "0 9 * * *"  # 9 AM daily
command = "node cron/process-follow-ups.js --live"
```

**Option B: Linux Crontab**

```bash
# Add to crontab (run at 9 AM daily)
0 9 * * * cd /path/to/caesars-legions-backend && node cron/process-follow-ups.js --live
```

**Option C: Windows Task Scheduler**

Create task to run daily at 9 AM:
```powershell
cd C:\path\to\caesars-legions-backend
node cron\process-follow-ups.js --live
```

---

## Configuration

### Default Config

```javascript
{
  followUpDelays: [3, 7],              // Days after initial email
  businessHoursOnly: true,             // Only send during business hours
  businessHours: { start: 9, end: 17 }, // 9 AM - 5 PM
  timezone: 'America/New_York',        // Default timezone
  maxFollowUps: 2,                     // Max follow-ups per lead
  minIntervalHours: 48                 // Min hours between follow-ups
}
```

### Custom Config

Create `custom-config.json`:

```json
{
  "followUpDelays": [2, 5, 10],
  "businessHoursOnly": false,
  "maxFollowUps": 3,
  "timezone": "America/Los_Angeles"
}
```

Then run:

```bash
node cron/process-follow-ups.js --live --config custom-config.json
```

### Per-Client Timezone

To set different timezones per client, update client config:

```javascript
db.updateClient(clientId, {
  timezone: 'Europe/London' // Will send during London business hours
});
```

---

## How It Works

### Day 3 Follow-up (Value-Add Strategy)

❌ **Bad (Generic):**
> "Just checking in on my last email. Any thoughts?"

✅ **Good (Add Value):**
> "Quick follow-up: We helped [similar company] increase reply rates 3x by switching from demographic targeting to signal-based outreach. Saw you're hiring SDRs — might be worth exploring?"

**AI Prompt Strategy:**
- Share new insight not in original email
- Reference specific context (hiring, funding, product launch)
- Different angle than Day 1
- Easy yes/no question

### Day 7 Follow-up (Permission Close)

❌ **Bad (Pushy):**
> "Haven't heard back. When can we chat?"

✅ **Good (Easy Out):**
> "I know you're busy. Should I close this loop, or is there a better time to revisit? No worries either way."

**AI Prompt Strategy:**
- Acknowledge they're busy
- Give permission to decline
- Final nudge without pressure
- Leave door open for later

---

## Monitoring

### View Logs

```bash
tail -f caesars-legions-backend/logs/follow-ups.jsonl
```

### Check Performance

```javascript
const { getStats } = require('./lib/email-generator');
console.log(getStats());
// {
//   totalCalls: 47,
//   totalCost: 0.23,
//   avgLatencyMs: 1834,
//   errorRate: 0.02
// }
```

### Telegram Alerts (Coming Soon)

Get notified when:
- Follow-ups sent successfully
- Errors occurred
- Reply received after follow-up

---

## Best Practices

### ✅ Do This:

1. **Test first:** Always dry run before going live
2. **Monitor metrics:** Check open rates on Day 3 vs Day 7
3. **Respect time zones:** Use business hours only
4. **Cap follow-ups:** 2 max (don't be annoying)
5. **Add value:** Each follow-up should give something new

### ❌ Don't Do This:

1. **Don't "just check in"** — add value or give them an out
2. **Don't repeat original email** — different angle every time
3. **Don't send >2 follow-ups** — after 2, they're not interested
4. **Don't ignore replies** — system auto-skips, but check manually too
5. **Don't send during off-hours** — respect their inbox

---

## Troubleshooting

### No Follow-ups Being Sent

**Check:**
1. Are there emails in database >3 days old?
2. Have they already replied? (check `replied` field)
3. Is it within business hours? (or disable `businessHoursOnly`)
4. Are you running in `--live` mode?

**Debug:**
```bash
node -e "
const db = require('./caesars-legions-backend/lib/db');
const emails = db.getRecentEmails(1, 100);
console.log(\`Total emails: \${emails.length}\`);
console.log(\`Unreplied: \${emails.filter(e => !e.replied).length}\`);
console.log(\`>3 days old: \${emails.filter(e => {
  const days = Math.floor((Date.now() - e.sent_at * 1000) / (24*60*60*1000));
  return days >= 3;
}).length}\`);
"
```

### Timezone Issues

**Test timezone detection:**
```bash
node -e "
const { isBusinessHours } = require('./caesars-legions-backend/lib/follow-ups');
console.log('America/New_York:', isBusinessHours('America/New_York'));
console.log('Europe/London:', isBusinessHours('Europe/London'));
console.log('Asia/Tokyo:', isBusinessHours('Asia/Tokyo'));
"
```

### Rate Limits

**Current rate:** 1 email per second (3,600/hour max)

If hitting limits:
- Increase delay in `sendFollowUpEmail` (currently 1000ms)
- Process in smaller batches
- Use Instantly.ai for higher volume

---

## Integration with Instantly.ai

For higher volume (>100 emails/day), integrate with Instantly.ai:

```javascript
// lib/follow-ups.js
const { sendViaInstantly } = require('./instantly-integration');

// In sendFollowUpEmail():
if (client.use_instantly) {
  await sendViaInstantly({
    campaignId: client.instantly_campaign_id,
    lead,
    email: followUp
  });
}
```

---

## Roadmap

**Week 3:**
- [ ] A/B test follow-up timing (Day 3 vs Day 4)
- [ ] Sentiment analysis on replies
- [ ] Auto-categorize replies (interested/not-interested/question)

**Week 4:**
- [ ] Telegram notifications
- [ ] Slack integration
- [ ] Reply auto-responder (simple ACK)

**Month 2:**
- [ ] Multi-touch sequences (3-5-7-10 days)
- [ ] Vertical-specific templates (SaaS vs Agency vs E-commerce)
- [ ] Smart timing (send when they're most likely to check email)

---

## Metrics to Track

**Key KPIs:**
- Day 3 open rate (target: >25%)
- Day 7 open rate (target: >15%)
- Reply rate after follow-up (target: >2%)
- Unsubscribe rate (target: <0.5%)

**Log format:**
```json
{
  "timestamp": "2026-01-31T21:00:00Z",
  "day3_sent": 12,
  "day7_sent": 8,
  "errors": 0,
  "total_cost_usd": 0.08
}
```

---

## Questions?

- **How many follow-ups is too many?** → 2 max. After that, move on.
- **What if they reply to Day 3?** → System auto-skips Day 7 (checks `replied` field)
- **Can I customize per client?** → Yes, pass custom config or update client record
- **Does it work with Instantly.ai?** → Integration ready, needs API key

---

🏛️ **Caesar's Legions — Persistent, not pushy.**
