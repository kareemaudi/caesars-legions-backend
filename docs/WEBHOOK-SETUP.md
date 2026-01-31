# Webhook Setup Guide

## Overview

Caesar's Legions uses webhooks to receive real-time notifications from Instantly.ai when:
- Emails are opened
- Links are clicked
- Leads reply
- Emails bounce
- Leads unsubscribe

This enables instant client notifications and accurate tracking metrics.

---

## 🔐 Security Features

The enhanced webhook handler includes:

✅ **HMAC-SHA256 signature verification** - Verify webhooks are from Instantly
✅ **Rate limiting** - Prevent abuse (100 requests/min)
✅ **Request validation** - Reject malformed payloads
✅ **Comprehensive logging** - Track all events in `logs/webhook-metrics.jsonl`
✅ **Error handling** - Graceful failures with detailed logging
✅ **Duplicate detection** - Avoid processing same event twice

---

## 📋 Prerequisites

1. **Instantly.ai account** (Pro plan or higher)
2. **Deployed backend** on Railway, Render, or similar
3. **Public URL** for your webhook endpoint

---

## 🚀 Setup Steps

### 1. Configure Environment Variables

Add to your `.env` file:

```bash
# Instantly.ai Webhook Configuration
INSTANTLY_WEBHOOK_SECRET=your_secret_key_here
INSTANTLY_VERIFY_SIGNATURE=true
LOG_WEBHOOK_EVENTS=true
```

**Generate a webhook secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and use it as your `INSTANTLY_WEBHOOK_SECRET`.

### 2. Deploy Your Backend

Deploy to Railway, Render, or your preferred platform. Note your public URL:
```
https://your-app.railway.app
```

### 3. Configure Instantly.ai Webhooks

1. Log into Instantly.ai dashboard
2. Go to **Settings → Integrations → Webhooks**
3. Click **Add Webhook**
4. Configure:

**Webhook URL:**
```
https://your-app.railway.app/webhooks/instantly
```

**Secret Key:**
```
[Your INSTANTLY_WEBHOOK_SECRET from step 1]
```

**Events to Subscribe:**
- ✅ `email.opened`
- ✅ `email.clicked`
- ✅ `email.replied`
- ✅ `email.bounced`
- ✅ `email.unsubscribed`

5. Click **Save**

### 4. Test the Webhook

Send a test event from Instantly.ai dashboard or use curl:

```bash
curl -X POST https://your-app.railway.app/webhooks/test
```

Expected response:
```json
{
  "status": "ok",
  "message": "Enhanced webhook handler is running",
  "supported_events": [...]
}
```

### 5. Verify Integration

Check webhook health:
```bash
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
    "errors": 0
  }
}
```

---

## 📊 Monitoring

### View Webhook Logs

All events are logged to `logs/webhook-metrics.jsonl`:

```bash
tail -f logs/webhook-metrics.jsonl
```

Example log entry:
```json
{
  "timestamp": "2026-01-31T20:30:15.123Z",
  "event": "email_replied",
  "email": "john@example.com",
  "campaign_id": 1,
  "sentiment": "positive",
  "has_meeting_intent": true,
  "time_to_reply_hours": "2.3"
}
```

### Check Stats

Get webhook statistics (last 24 hours):
```bash
curl https://your-app.railway.app/webhooks/health
```

Stats include:
- Total webhooks received
- Events by type (opened, clicked, replied, etc.)
- Error count
- Average processing time

---

## 🔍 Debugging

### Enable Verbose Logging

Set in `.env`:
```bash
LOG_WEBHOOK_EVENTS=true
```

This logs every webhook received, even duplicates.

### Test Without Signature Verification

For testing only, disable signature verification:
```bash
INSTANTLY_VERIFY_SIGNATURE=false
```

**⚠️ Warning:** Always enable signature verification in production!

### Manual Webhook Testing

Send a test webhook:

```bash
curl -X POST https://your-app.railway.app/webhooks/instantly \
  -H "Content-Type: application/json" \
  -H "X-Instantly-Signature: test" \
  -d '{
    "type": "email.opened",
    "data": {
      "email": "test@example.com",
      "campaign_id": 1,
      "opened_at": "2026-01-31T20:00:00Z"
    }
  }'
```

---

## 🛠️ Troubleshooting

### Error: "Invalid signature"

**Cause:** Webhook secret mismatch

**Solution:**
1. Check `INSTANTLY_WEBHOOK_SECRET` in `.env`
2. Verify same secret is configured in Instantly.ai
3. Ensure no extra spaces/newlines in secret

### Error: "Rate limit exceeded"

**Cause:** Too many webhooks in short time

**Solution:**
1. Check if Instantly is sending duplicate events
2. Increase rate limit in `webhook-handler-enhanced.js`:
```javascript
MAX_REQUESTS_PER_MINUTE: 200
```

### Error: "Email not found"

**Cause:** Webhook received for email not in database

**Solution:**
1. Check `campaign_id` matches your database
2. Verify lead was imported before email sent
3. Check `emails_sent` table for matching record

### No Webhooks Received

**Checklist:**
- ✅ Instantly webhook URL configured correctly
- ✅ Backend is deployed and accessible
- ✅ Firewall allows incoming webhooks
- ✅ HTTPS configured (Instantly requires HTTPS)
- ✅ Check Instantly webhook logs for errors

---

## 📈 Metrics Tracked

For each webhook event, we track:

**Email Opened:**
- Time to open (hours after sending)
- Lead engagement score update

**Email Clicked:**
- Which link clicked
- Click-through rate

**Email Replied:**
- Sentiment (positive/neutral/negative)
- Meeting intent detected
- Time to reply
- Reply length

**Email Bounced:**
- Bounce type (hard/soft)
- Update lead status

**Email Unsubscribed:**
- Update lead status
- Add to global unsubscribe list

---

## 🔄 Migration from Old Handler

If you're using the old `webhook-handler.js`:

### 1. Backup Current Handler
```bash
cp lib/webhook-handler.js lib/webhook-handler-old.js
```

### 2. Update Dashboard Server

Edit `scripts/dashboard-server.js`:

**Replace:**
```javascript
const webhookHandler = require('../lib/webhook-handler');
```

**With:**
```javascript
const webhookHandler = require('../lib/webhook-handler-enhanced');
```

### 3. Add Environment Variables

Add to `.env`:
```bash
INSTANTLY_WEBHOOK_SECRET=your_secret_here
INSTANTLY_VERIFY_SIGNATURE=true
LOG_WEBHOOK_EVENTS=true
```

### 4. Restart Server

```bash
npm restart
```

### 5. Update Instantly Configuration

Update webhook secret in Instantly.ai dashboard to match your new `INSTANTLY_WEBHOOK_SECRET`.

---

## 🎯 Best Practices

1. **Always use signature verification in production**
2. **Monitor webhook logs regularly** for unusual patterns
3. **Set up alerts** for high error rates
4. **Keep webhook secret secure** (don't commit to git)
5. **Test webhooks after any deployment** to verify connectivity
6. **Review webhook stats weekly** to identify issues early

---

## 📚 Related Documentation

- [Instantly.ai Webhook Docs](https://instantly.ai/docs/webhooks)
- [DEPLOYMENT.md](DEPLOYMENT.md) - Backend deployment guide
- [API-DOCUMENTATION.md](../API-DOCUMENTATION.md) - Full API reference

---

## 🆘 Support

**Webhook not working?**
1. Check `logs/webhook-metrics.jsonl` for errors
2. Test health endpoint: `/webhooks/health`
3. Verify Instantly configuration matches backend
4. Check server logs for detailed error messages

---

**Last Updated:** 2026-01-31
**Version:** Enhanced Webhook Handler v2.0
