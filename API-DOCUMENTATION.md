# 🏛️ Caesar's Legions - API Documentation

**Version:** 1.0.0  
**Last Updated:** 2026-01-31

---

## 📡 Base URL

**Local Development:**
```
http://localhost:3000
```

**Production (Railway):**
```
https://caesars-legions.railway.app
```

---

## 🔐 Authentication

All API endpoints require authentication via API key header:

```http
Authorization: Bearer YOUR_CLIENT_API_KEY
```

Client API keys are generated during onboarding and stored in the database.

---

## 📋 Endpoints

### 1. Health Check

**GET** `/health`

Check if the API is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-31T11:30:00Z",
  "version": "1.0.0"
}
```

---

### 2. Send Campaign

**POST** `/api/campaigns/send`

Send a cold email campaign to a list of leads.

**Request Body:**
```json
{
  "client_id": "client-123",
  "campaign_name": "Q1 Outbound Campaign",
  "leads": [
    {
      "email": "founder@startup.com",
      "first_name": "Jane",
      "last_name": "Doe",
      "company": "Startup Inc",
      "job_title": "Founder & CEO",
      "linkedin_url": "https://linkedin.com/in/janedoe"
    }
  ],
  "template": {
    "type": "cold_outreach",
    "tone": "professional",
    "value_prop": "We help B2B SaaS companies book 10+ qualified demos/month"
  },
  "dry_run": false
}
```

**Response:**
```json
{
  "campaign_id": "camp-456",
  "emails_queued": 47,
  "estimated_send_time": "2026-01-31T14:00:00Z",
  "cost_estimate": {
    "openai": "$0.94",
    "sending": "$0.47",
    "total": "$1.41"
  }
}
```

**Status Codes:**
- `200` - Campaign queued successfully
- `400` - Invalid request (missing fields, bad format)
- `401` - Unauthorized (invalid API key)
- `429` - Rate limit exceeded
- `500` - Server error

---

### 3. Get Campaign Status

**GET** `/api/campaigns/:campaign_id`

Check status of a campaign.

**Response:**
```json
{
  "campaign_id": "camp-456",
  "name": "Q1 Outbound Campaign",
  "status": "sending",
  "created_at": "2026-01-31T11:30:00Z",
  "stats": {
    "total_leads": 47,
    "sent": 23,
    "pending": 24,
    "opened": 5,
    "clicked": 2,
    "replied": 1,
    "bounced": 0
  },
  "performance": {
    "open_rate": "21.7%",
    "click_rate": "8.7%",
    "reply_rate": "4.3%"
  }
}
```

---

### 4. Get Lead Activity

**GET** `/api/leads/:email/activity`

Get all activity for a specific lead.

**Response:**
```json
{
  "lead": {
    "email": "founder@startup.com",
    "first_name": "Jane",
    "last_name": "Doe",
    "company": "Startup Inc"
  },
  "campaigns": [
    {
      "campaign_id": "camp-456",
      "sent_at": "2026-01-31T11:30:00Z",
      "subject": "Quick question about your cold email strategy",
      "status": "replied",
      "events": [
        {
          "type": "sent",
          "timestamp": "2026-01-31T11:30:00Z"
        },
        {
          "type": "opened",
          "timestamp": "2026-01-31T12:45:00Z"
        },
        {
          "type": "replied",
          "timestamp": "2026-01-31T15:20:00Z",
          "sentiment": "positive"
        }
      ]
    }
  ],
  "total_emails_sent": 1,
  "total_opens": 1,
  "total_replies": 1,
  "engagement_score": 85
}
```

---

### 5. Webhook Handler

**POST** `/webhooks/instantly`

Receive events from Instantly.ai (opens, clicks, replies, bounces).

**Request Body (from Instantly.ai):**
```json
{
  "event": "email.opened",
  "email": "founder@startup.com",
  "campaign_id": "camp-456",
  "timestamp": "2026-01-31T12:45:00Z",
  "metadata": {
    "user_agent": "Mozilla/5.0...",
    "ip_address": "192.168.1.1"
  }
}
```

**Response:**
```json
{
  "received": true,
  "event_id": "evt-789"
}
```

**Events Supported:**
- `email.sent` - Email successfully sent
- `email.opened` - Lead opened the email
- `email.clicked` - Lead clicked a link
- `email.replied` - Lead replied
- `email.bounced` - Email bounced
- `email.unsubscribed` - Lead unsubscribed

---

### 6. Get Client Metrics

**GET** `/api/clients/:client_id/metrics`

Get performance metrics for a client.

**Query Parameters:**
- `period` - `day`, `week`, `month`, `all` (default: `week`)

**Response:**
```json
{
  "client_id": "client-123",
  "period": "week",
  "date_range": {
    "start": "2026-01-24",
    "end": "2026-01-31"
  },
  "campaigns": 3,
  "emails_sent": 147,
  "metrics": {
    "open_rate": "24.5%",
    "click_rate": "6.8%",
    "reply_rate": "3.4%",
    "bounce_rate": "1.2%",
    "positive_replies": 3,
    "negative_replies": 1,
    "neutral_replies": 1
  },
  "top_performing": {
    "subject": "Quick question about your outbound strategy",
    "open_rate": "32.1%",
    "reply_rate": "5.7%"
  }
}
```

---

### 7. Generate Email Preview

**POST** `/api/emails/preview`

Generate a preview of what an email would look like for a lead (dry run).

**Request Body:**
```json
{
  "client_id": "client-123",
  "lead": {
    "email": "founder@startup.com",
    "first_name": "Jane",
    "last_name": "Doe",
    "company": "Startup Inc",
    "job_title": "Founder & CEO"
  },
  "template": {
    "type": "cold_outreach",
    "tone": "professional"
  }
}
```

**Response:**
```json
{
  "subject": "Quick question about Startup Inc's lead gen",
  "body": "Hi Jane,\n\nI noticed Startup Inc is scaling fast...",
  "personalization": {
    "score": 8.5,
    "elements": [
      "Company name mentioned",
      "Job title referenced",
      "Industry-specific value prop"
    ]
  },
  "estimated_deliverability": 92
}
```

---

### 8. Schedule Follow-up

**POST** `/api/follow-ups/schedule`

Manually schedule a follow-up for a lead.

**Request Body:**
```json
{
  "lead_id": "lead-789",
  "client_id": "client-123",
  "delay_days": 3,
  "template": "follow_up_1"
}
```

**Response:**
```json
{
  "scheduled": true,
  "lead_id": "lead-789",
  "send_at": "2026-02-03T10:00:00Z"
}
```

---

### 9. Unsubscribe Lead

**POST** `/api/leads/:email/unsubscribe`

Manually unsubscribe a lead from all future campaigns.

**Response:**
```json
{
  "unsubscribed": true,
  "email": "founder@startup.com",
  "timestamp": "2026-01-31T11:30:00Z"
}
```

---

### 10. A/B Test Results

**GET** `/api/campaigns/:campaign_id/ab-test`

Get A/B test results if campaign had variants.

**Response:**
```json
{
  "campaign_id": "camp-456",
  "variants": [
    {
      "variant": "A",
      "subject": "Quick question about your outbound",
      "sent": 50,
      "opened": 12,
      "replied": 3,
      "open_rate": "24.0%",
      "reply_rate": "6.0%"
    },
    {
      "variant": "B",
      "subject": "Thoughts on your cold email strategy?",
      "sent": 50,
      "opened": 15,
      "replied": 2,
      "open_rate": "30.0%",
      "reply_rate": "4.0%"
    }
  ],
  "winner": "B",
  "confidence": "95%",
  "recommendation": "Use variant B for remaining leads"
}
```

---

## 🔄 Rate Limits

**Free Tier:**
- 50 emails/day
- 5 campaigns/week
- 1 API request/second

**Paid Tier ($250/month):**
- 500 emails/day
- Unlimited campaigns
- 10 API requests/second

**Enterprise ($1,000/month):**
- 5,000 emails/day
- Unlimited campaigns
- 100 API requests/second
- Dedicated IP

**Rate Limit Headers:**
```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1706702400
```

---

## 🚨 Error Codes

**400 Bad Request**
```json
{
  "error": "invalid_request",
  "message": "Missing required field: leads",
  "field": "leads"
}
```

**401 Unauthorized**
```json
{
  "error": "unauthorized",
  "message": "Invalid or missing API key"
}
```

**429 Too Many Requests**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. Try again in 60 seconds.",
  "retry_after": 60
}
```

**500 Internal Server Error**
```json
{
  "error": "internal_error",
  "message": "An unexpected error occurred",
  "request_id": "req-abc123"
}
```

---

## 🔗 Webhook Integration

### Setting up webhooks with Instantly.ai:

1. **Go to Instantly.ai Dashboard** → Settings → Webhooks
2. **Add webhook URL:** `https://your-app.railway.app/webhooks/instantly`
3. **Enable events:**
   - Email Sent
   - Email Opened
   - Email Clicked
   - Email Replied
   - Email Bounced
   - Unsubscribed
4. **Save configuration**

### Webhook Security:

Webhooks include a signature for verification:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return hash === signature;
}
```

---

## 📊 Event Types

### Email Lifecycle

```
SENT → OPENED → CLICKED → REPLIED
  ↓       ↓         ↓         ↓
BOUNCED BOUNCED   BOUNCED   (CLOSED)
```

**Sentiment Analysis on Replies:**
- `positive` - Interested, asking questions, booking meeting
- `neutral` - Acknowledgment, needs more info
- `negative` - Not interested, unsubscribe request

---

## 🧪 Testing

### Using cURL:

**Send test email:**
```bash
curl -X POST https://caesars-legions.railway.app/api/campaigns/send \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "test-client",
    "campaign_name": "Test Campaign",
    "leads": [{
      "email": "test@example.com",
      "first_name": "Test",
      "last_name": "User",
      "company": "Test Corp"
    }],
    "dry_run": true
  }'
```

**Get campaign status:**
```bash
curl -X GET https://caesars-legions.railway.app/api/campaigns/camp-456 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Using JavaScript:

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'https://caesars-legions.railway.app',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
});

// Send campaign
const campaign = await api.post('/api/campaigns/send', {
  client_id: 'client-123',
  campaign_name: 'Q1 Outbound',
  leads: [...],
  dry_run: false
});

console.log('Campaign ID:', campaign.data.campaign_id);

// Check status
const status = await api.get(`/api/campaigns/${campaign.data.campaign_id}`);
console.log('Open rate:', status.data.performance.open_rate);
```

---

## 📈 Best Practices

### 1. Email Sending
- **Warm up gradually:** Start with 20/day, increase by 10% weekly
- **Monitor deliverability:** Keep bounce rate <2%, spam rate <0.1%
- **Test subject lines:** A/B test 2 variants per campaign
- **Follow-up timing:** 3 days, 7 days, 14 days (max 3 follow-ups)

### 2. Personalization
- **Minimum data:** first_name, company (required)
- **Recommended:** job_title, linkedin_url, recent_post
- **Advanced:** company_tech_stack, funding_round, employee_count

### 3. Compliance
- **Include unsubscribe link:** Required by law (CAN-SPAM)
- **Honor unsubscribes:** Immediately (within 24h)
- **Physical address:** Include in email footer
- **Truthful subject lines:** No deceptive subjects

### 4. Performance
- **Cache email generations:** Don't regenerate identical emails
- **Batch API calls:** Send leads in batches of 50
- **Monitor costs:** Track OpenAI usage per campaign
- **Set timeouts:** 30s for API calls, 5s for database queries

---

## 🔧 SDK Examples

### Python

```python
import requests

class CaesarsLegions:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = "https://caesars-legions.railway.app"
    
    def send_campaign(self, client_id, leads, campaign_name):
        response = requests.post(
            f"{self.base_url}/api/campaigns/send",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "client_id": client_id,
                "campaign_name": campaign_name,
                "leads": leads,
                "dry_run": False
            }
        )
        return response.json()
    
    def get_metrics(self, client_id, period="week"):
        response = requests.get(
            f"{self.base_url}/api/clients/{client_id}/metrics",
            headers={"Authorization": f"Bearer {self.api_key}"},
            params={"period": period}
        )
        return response.json()

# Usage
api = CaesarsLegions("your-api-key")
campaign = api.send_campaign("client-123", leads, "Q1 Outbound")
print(f"Campaign ID: {campaign['campaign_id']}")
```

---

## 📞 Support

**Questions:** Kareem (Telegram: @kareem)  
**Issues:** GitHub Issues (when public)  
**Documentation:** This file + README.md

---

🏛️ **Veni. Vidi. Vici.**
