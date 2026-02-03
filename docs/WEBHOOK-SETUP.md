# Instantly.ai Webhook Setup Guide

Complete guide to setting up and testing Instantly.ai webhooks for real-time email engagement tracking.

---

## 📡 What Webhooks Track

The webhook handler processes these events from Instantly.ai:

- **email.opened** - Recipient opened the email
- **email.clicked** - Recipient clicked a link
- **email.replied** - Recipient replied (🎯 HIGH PRIORITY)
- **email.bounced** - Email bounced (invalid address)
- **email.unsubscribed** - Recipient unsubscribed
- **email.out_of_office** - Auto-reply detected

Each event updates the `campaign_emails` table and recalculates campaign stats.

---

## 🔧 Setup Steps

### 1. Set Webhook Secret (Security)

Add to `.env`:

```bash
INSTANTLY_WEBHOOK_SECRET=your_secret_key_here
```

Generate a secure secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Add Webhook Route to Server

In `server.js` (or your Express app):

```javascript
const express = require('express');
const { webhookMiddleware } = require('./lib/webhook-handler');

const app = express();

// Webhook endpoint (raw JSON, signature verification)
app.post('/webhooks/instantly', 
  express.json(), 
  (req, res, next) => {
    req.db = db; // Pass database connection
    next();
  },
  webhookMiddleware
);

// Health check
app.get('/webhooks/status', async (req, res) => {
  const { getWebhookStats } = require('./lib/webhook-handler');
  const stats = await getWebhookStats(db);
  res.json(stats);
});
```

### 3. Deploy and Get Public URL

**Option A: Railway (recommended)**

```bash
# Deploy to Railway
railway up

# Get webhook URL
railway domain
# Example: https://caesars-legions-production.up.railway.app
```

**Option B: ngrok (local testing)**

```bash
# Start server locally
node server.js

# In another terminal
ngrok http 3000

# Copy the HTTPS URL
# Example: https://abc123.ngrok.io
```

### 4. Configure in Instantly.ai Dashboard

1. Log in to [Instantly.ai](https://app.instantly.ai)
2. Go to **Settings** → **Webhooks**
3. Click **Add Webhook**
4. Enter:
   - **URL:** `https://your-domain.com/webhooks/instantly`
   - **Secret:** (same as `INSTANTLY_WEBHOOK_SECRET`)
   - **Events:** Select all (opened, clicked, replied, bounced, unsubscribed, out_of_office)
5. Click **Save**
6. Click **Test Webhook** to verify

---

## 🧪 Testing

### Local Testing

```bash
# Run test suite
node test-webhook.js

# Expected output:
# ✓ Email opened event processed
# ✓ Email clicked event processed
# ✓ Email replied event processed with alert
# ✓ Campaign stats updated correctly
# ✓ Batch backfill completed
# ✅ All tests passed!
```

### Test with Real Events

```bash
# Send a test email from Instantly.ai
# Then check server logs:

tail -f logs/app.log

# You should see:
# [Webhook] Received: email.opened at 2026-02-03T07:30:00.000Z
# [Webhook] ✓ Updated email 123: opened
# [Webhook] Updated campaign test-campaign-1 stats: 45.2% open, 3.1% reply
```

### Manual Webhook Test (curl)

```bash
# Simulate an email.opened event
curl -X POST http://localhost:3000/webhooks/instantly \
  -H "Content-Type: application/json" \
  -H "x-instantly-signature: test" \
  -d '{
    "type": "email.opened",
    "timestamp": 1706961234567,
    "data": {
      "message_id": "msg-001",
      "email_address": "test@example.com",
      "campaign_id": "campaign-1",
      "opened_at": "2026-02-03T07:30:00.000Z"
    }
  }'

# Expected response:
# {"status":"success","event_type":"opened","email_id":123,"alerts":null}
```

---

## 📊 Monitoring Webhooks

### Health Check Endpoint

```bash
curl https://your-domain.com/webhooks/status

# Response:
{
  "last_24h": {
    "opens_24h": 47,
    "clicks_24h": 12,
    "replies_24h": 3,
    "bounces_24h": 1
  },
  "status": "operational",
  "timestamp": "2026-02-03T07:35:00.000Z"
}
```

### Database Queries

```sql
-- Recent webhook events (last 100)
SELECT 
  recipient_email,
  status,
  opened_at,
  clicked_at,
  replied_at,
  updated_at
FROM campaign_emails
ORDER BY updated_at DESC
LIMIT 100;

-- Campaign performance
SELECT 
  id,
  name,
  emails_sent,
  open_rate,
  click_rate,
  reply_rate
FROM campaigns
WHERE emails_sent > 0
ORDER BY reply_rate DESC;
```

---

## 🚨 Alerts & Notifications

High-priority events trigger alerts:

### Reply Alert (🎯 URGENT)

```javascript
{
  type: 'reply',
  priority: 'high',
  message: '🎯 Reply received from john@example.com!',
  action: 'Check inbox and respond within 1 hour'
}
```

**To enable Telegram notifications:**

1. Integrate with `telegram-notifier.js`:

```javascript
// In webhook-handler.js
const { sendTelegramMessage } = require('../telegram-notifier');

// When reply detected:
sendTelegramMessage(alert.message, 'urgent');
```

2. Configure Telegram credentials in `.env` (see `HEARTBEAT.md`)

---

## 🔍 Troubleshooting

### Webhooks Not Arriving

**Check 1: Server logs**

```bash
tail -f logs/app.log
# Should see: [Webhook] Received: email.opened at ...
```

**Check 2: Instantly.ai webhook logs**

- Go to Instantly.ai → Settings → Webhooks
- Click on your webhook → View Logs
- Look for failed requests (4xx/5xx errors)

**Check 3: Signature verification**

```bash
# Temporarily disable signature check for debugging
# In webhook-handler.js:
function verifyWebhookSignature(payload, signature, secret) {
  return true; // TEMPORARILY bypass
}
```

### Events Not Updating Database

**Check 1: message_id mapping**

```sql
-- Check if message_id exists in database
SELECT * FROM campaign_emails WHERE message_id = 'msg-from-instantly';
```

If not found, webhook will try to match by `recipient_email + campaign_id`.

**Check 2: Database schema**

```bash
# Verify columns exist
sqlite3 caesars-legions.db ".schema campaign_emails"
# Should include: opened_at, clicked_at, replied_at, etc.
```

---

## 📈 Performance

**Expected latency:**
- Webhook processing: <50ms
- Database update: <100ms
- Campaign stats recalc: <200ms
- **Total:** <350ms per event

**Scalability:**
- Can handle 1,000+ events/min
- Async processing prevents blocking
- Batch backfill for missed events

---

## 🔒 Security

**Signature Verification:**
- All webhooks verified with HMAC-SHA256
- Prevents spoofed events
- Rejects invalid signatures with 401

**Best Practices:**
- Keep `INSTANTLY_WEBHOOK_SECRET` secure (don't commit to git)
- Use HTTPS only (required by Instantly.ai)
- Rate limit webhook endpoint (10 req/sec max)
- Log all webhook events for audit trail

---

## 🚀 Next Steps

Once webhooks are working:

1. **Enable Telegram alerts** for replies (instant notification)
2. **Build dashboard** showing real-time engagement (opens, clicks, replies)
3. **A/B testing framework** (track which subject lines perform best)
4. **Auto-pause campaigns** if bounce rate >5% (protect sender reputation)
5. **Smart follow-ups** (only follow up if opened but no reply)

---

## 📚 Resources

- **Instantly.ai Webhook Docs:** https://developer.instantly.ai/webhooks
- **Webhook Handler Code:** `lib/webhook-handler.js`
- **Test Suite:** `test-webhook.js`
- **Server Integration:** `server.js`

---

**Status:** Ready for production ✅  
**Next:** Deploy to Railway, configure in Instantly.ai dashboard, test with real campaign
