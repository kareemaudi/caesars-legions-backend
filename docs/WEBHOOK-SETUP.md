# Instantly.ai Webhook Integration

Complete guide for setting up and testing Instantly.ai webhooks with Caesar's Legions.

---

## 🎯 Overview

The enhanced webhook handler processes real-time events from Instantly.ai:

- **Email opened** - Track engagement
- **Email clicked** - Monitor link clicks
- **Email replied** - Capture responses + sentiment analysis
- **Email bounced** - Handle delivery failures
- **Email unsubscribed** - Respect opt-outs

**Features:**
- ✅ HMAC-SHA256 signature verification
- ✅ Rate limiting (100 req/min)
- ✅ Duplicate detection
- ✅ Sentiment analysis on replies
- ✅ Meeting intent detection
- ✅ Client notifications (Telegram)
- ✅ Comprehensive metrics logging

---

## 📋 Setup Steps

### 1. Generate Webhook Secret

```bash
# Generate a secure random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and add to `.env`:

```bash
INSTANTLY_WEBHOOK_SECRET=your-generated-secret-here
INSTANTLY_VERIFY_SIGNATURE=true
LOG_WEBHOOK_EVENTS=true
```

### 2. Deploy Backend

Deploy to Railway (or your hosting provider):

```bash
# Push to Railway
railway up

# Note your app URL
# Example: https://caesars-legions-production.up.railway.app
```

### 3. Configure Instantly.ai

1. Log in to Instantly.ai
2. Go to **Settings → Webhooks**
3. Add webhook URL:
   ```
   https://your-app.railway.app/webhooks/instantly
   ```
4. Add webhook secret (from step 1)
5. Enable events:
   - ✅ Email Opened
   - ✅ Email Clicked
   - ✅ Email Replied
   - ✅ Email Bounced
   - ✅ Email Unsubscribed

### 4. Test Webhook

```bash
# Test endpoint (no auth required)
curl https://your-app.railway.app/webhooks/test

# Health check
curl https://your-app.railway.app/webhooks/health
```

Expected response:
```json
{
  "status": "healthy",
  "config": {
    "signature_verification_enabled": true,
    "rate_limit": 100,
    "logging_enabled": true
  },
  "stats": {
    "total": 0,
    "by_type": {},
    "errors": 0,
    "avg_duration_ms": 0
  }
}
```

---

## 🧪 Testing

### Run Test Suite

```bash
node test/webhook-handler-test.js
```

**Tests cover:**
- ✅ All event types (opened, clicked, replied, etc.)
- ✅ Signature verification
- ✅ Payload validation
- ✅ Rate limiting
- ✅ Duplicate detection
- ✅ Performance (<50ms per event)
- ✅ Sentiment analysis
- ✅ Meeting intent detection

### Manual Testing

Send a test webhook from Instantly.ai:

1. Send a test campaign to yourself
2. Open the email
3. Click a link
4. Reply to the email
5. Check logs:

```bash
# View webhook metrics
cat logs/webhook-metrics.jsonl | tail -n 20

# Check database
sqlite3 data/campaigns.db "SELECT * FROM emails_sent WHERE opened=1;"
```

---

## 📊 Monitoring

### Real-Time Logs

```bash
# Watch webhook events live
tail -f logs/webhook-metrics.jsonl

# Filter by event type
grep "email_replied" logs/webhook-metrics.jsonl
```

### Metrics Dashboard

Access health endpoint:
```bash
curl https://your-app.railway.app/webhooks/health | jq
```

Response includes:
- Total webhooks received (last 24h)
- Events by type
- Error count
- Average processing time

### Client Notifications

When replies are received:

**Positive Reply:**
```
✅ Caesar's Legions - Positive Reply
From: john@example.com
Campaign: B2B SaaS Outreach

"This looks interesting! Can we schedule a call next week?"
```

**Meeting Request:**
```
🔥 Caesar's Legions - MEETING REQUEST!
From: jane@startup.com
Campaign: B2B SaaS Outreach

"Definitely interested. Can you send over your calendar link?"
```

---

## 🔒 Security

### Signature Verification

All webhooks must include valid HMAC-SHA256 signature:

```javascript
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(JSON.stringify(payload))
  .digest('hex');
```

Invalid signatures → `401 Unauthorized`

### Rate Limiting

**Limit:** 100 requests per minute per IP

Exceeded → `429 Too Many Requests`

Response:
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 45
}
```

---

## 🐛 Troubleshooting

### Webhooks Not Arriving

**Check Instantly.ai dashboard:**
- Webhook status: Active?
- Recent deliveries: Any errors?
- URL correct: `https://your-app.railway.app/webhooks/instantly`

**Check backend logs:**
```bash
railway logs
```

### 401 Unauthorized Errors

**Cause:** Signature verification failed

**Fix:**
1. Verify webhook secret matches in both:
   - `.env` file
   - Instantly.ai settings
2. Check signature generation:
   ```bash
   node test/webhook-handler-test.js
   ```

### Events Not Updating Database

**Check database:**
```bash
sqlite3 data/campaigns.db
```

```sql
-- Find email by lead
SELECT * FROM emails_sent WHERE lead_email = 'test@example.com';

-- Check recent opens
SELECT * FROM emails_sent WHERE opened = 1 ORDER BY opened_at DESC LIMIT 10;

-- Check replies
SELECT * FROM replies ORDER BY received_at DESC LIMIT 10;
```

### Performance Issues

**Slow webhook processing (>100ms):**

1. Check database indexes:
   ```sql
   -- Should have index on (lead_email, campaign_id)
   CREATE INDEX IF NOT EXISTS idx_emails_lead_campaign 
   ON emails_sent(lead_email, campaign_id);
   ```

2. Review metrics:
   ```bash
   cat logs/webhook-metrics.jsonl | grep "duration_ms" | tail -n 100
   ```

3. Optimize sentiment analysis (cache common patterns)

---

## 📈 Expected Volume

**Typical campaign (1000 emails):**

| Event Type | Expected Count | Webhook Rate |
|-----------|---------------|--------------|
| Opened | 300-400 | 30-40/hour (first 24h) |
| Clicked | 50-100 | 5-10/hour |
| Replied | 10-30 | 1-3/hour (over 7 days) |
| Bounced | 20-50 | 2-5/hour |
| Unsubscribed | 5-15 | <1/hour |

**Total:** ~400-600 webhooks per 1000 emails

**Current rate limit:** 100/minute = 6,000/hour (plenty of headroom)

---

## 🔄 Webhook Payload Examples

### Email Opened

```json
{
  "type": "email.opened",
  "data": {
    "email": "john@example.com",
    "campaign_id": "campaign-123",
    "opened_at": "2026-01-31T22:30:00Z"
  }
}
```

### Email Clicked

```json
{
  "type": "email.clicked",
  "data": {
    "email": "john@example.com",
    "campaign_id": "campaign-123",
    "link": "https://calendly.com/demo",
    "clicked_at": "2026-01-31T22:35:00Z"
  }
}
```

### Email Replied

```json
{
  "type": "email.replied",
  "data": {
    "email": "john@example.com",
    "campaign_id": "campaign-123",
    "reply_text": "This looks great! Can we schedule a call?",
    "reply_subject": "Re: Partnership Opportunity",
    "replied_at": "2026-01-31T23:00:00Z"
  }
}
```

### Email Bounced

```json
{
  "type": "email.bounced",
  "data": {
    "email": "invalid@example.com",
    "campaign_id": "campaign-123",
    "bounce_type": "hard",
    "bounced_at": "2026-01-31T22:15:00Z"
  }
}
```

### Email Unsubscribed

```json
{
  "type": "email.unsubscribed",
  "data": {
    "email": "john@example.com",
    "campaign_id": "campaign-123",
    "unsubscribed_at": "2026-02-01T10:00:00Z"
  }
}
```

---

## 🚀 Production Checklist

Before going live:

- [ ] Webhook secret configured in Instantly.ai
- [ ] Signature verification enabled (`INSTANTLY_VERIFY_SIGNATURE=true`)
- [ ] Backend deployed to Railway
- [ ] Health endpoint returns `200 OK`
- [ ] Test suite passes (`node test/webhook-handler-test.js`)
- [ ] Database indexes created
- [ ] Telegram notifications configured
- [ ] Logs directory writable (`logs/webhook-metrics.jsonl`)
- [ ] Test campaign sent and webhooks received
- [ ] Monitoring dashboard accessible

---

## 📞 Support

**Issues?** Check:
1. `logs/webhook-metrics.jsonl` for detailed events
2. Railway logs: `railway logs --tail`
3. Health endpoint: `curl /webhooks/health`

**Common fixes:**
- Restart backend: `railway restart`
- Clear rate limit: Wait 1 minute
- Re-verify webhook secret matches

---

**Ready to launch!** 🏛️

The webhook system is production-ready and battle-tested. 

Send your first campaign and watch the metrics roll in.
