# 🎯 Outreach Tracking System

**Status:** ACTIVE  
**Purpose:** Track DM campaigns, responses, and conversions for Caesar's Legions launch

---

## Quick Start

### View Dashboard
```bash
node caesars-legions-backend/lib/outreach-tracker.js dashboard
```

### View Follow-ups Due
```bash
node caesars-legions-backend/lib/outreach-tracker.js followups
```

### Get JSON Report
```bash
node caesars-legions-backend/lib/outreach-tracker.js report
```

---

## Logging Events

### After Sending a DM

```javascript
const tracker = require('./caesars-legions-backend/lib/outreach-tracker');

// Log that you sent a DM
tracker.logDM({
  handle: 'THArrowOfApollo',
  name: 'Taylor Haren',
  template: 'dm_batch_2_taylor',
  priority: 'urgent',
  expected_response_rate: '60-80%',
  notes: 'Sent at 8 PM, right after his pain tweet'
});
```

### After Getting a Response

```javascript
tracker.logResponse(
  'THArrowOfApollo',  // handle
  'Hey Kareem, this looks interesting. Tell me more about Caesar...',  // response text
  'positive'  // sentiment: 'positive', 'neutral', 'negative'
);
```

### After Scheduling a Call

```javascript
tracker.logCall(
  'marc_louvion',  // handle
  '2026-02-01T15:00:00Z'  // call date/time
);
```

### After Converting to Client

```javascript
tracker.logConversion(
  'THArrowOfApollo',  // handle
  250  // MRR in dollars
);
```

---

## Current Leads (Ready to Send)

**Total:** 8 leads imported  
**Status:** All marked as `ready_to_send`

### 🔥 URGENT Priority (Send Tonight)
1. **@THArrowOfApollo** (Taylor Haren)  
   - Expected response: 60-80%  
   - Revenue potential: $500/mo  
   - Notes: Just burned $10.5K on infrastructure

### ⭐ Very High Priority (Send Tomorrow)
2. **@marc_louvion** (Marc Lou)  
   - Expected response: 40-60%  
   - Revenue potential: $250/mo  
   - Notes: $80K revenue, teaching cold email

3. **@agazdecki** (Andrew Gazdecki)  
   - Expected response: 30-50%  
   - Revenue potential: $500/mo  
   - Notes: MicroAcquire founder, well-connected

### 🎯 High Priority
4. **@henrythe9ths** (Henry Shi)  
5. **@iamgdsa** (Guillaume)  
6. **@SuryanshMishraE** (Suryansh Mishra)  
7. **@imNihalN** (Nihal)

### 📋 Medium Priority
8. **@PratushBose** (Pratush Bose)

---

## Example Workflow

### 1. Morning: Check Dashboard
```bash
node caesars-legions-backend/lib/outreach-tracker.js dashboard
```

See today's stats and overall funnel.

### 2. Send DMs
Send your DMs on X/Twitter, then immediately log them:

```javascript
// Quick logging script
const tracker = require('./caesars-legions-backend/lib/outreach-tracker');

// Log each DM you send
tracker.logDM({ handle: 'THArrowOfApollo', name: 'Taylor Haren', template: 'dm_batch_2' });
tracker.logDM({ handle: 'marc_louvion', name: 'Marc Lou', template: 'dm_batch_2' });
// ... etc
```

### 3. Check for Responses (Evening)
When you get responses, log them with sentiment:

```javascript
tracker.logResponse('THArrowOfApollo', 'Interested! Tell me more.', 'positive');
```

### 4. Check Follow-ups Due
```bash
node caesars-legions-backend/lib/outreach-tracker.js followups
```

If someone hasn't responded in 3 days, they'll show up here.

---

## Metrics Tracked

### Today
- DMs sent today
- Responses received today
- Calls scheduled today
- Conversions today
- Revenue added today

### Overall Funnel
- Total leads in database
- DMs sent (all-time)
- Response rate (%)
- DM → Response conversion
- Response → Call conversion
- Call → Client conversion
- Total MRR

### Alerts
- Follow-ups due (>3 days since DM, no response)

---

## Files

**Data Location:** `caesars-legions-backend/data/outreach/`

- `leads.json` - All leads with status and metadata
- `outreach-log.jsonl` - Event log (DMs sent, responses, calls, conversions)

**Code:**
- `lib/outreach-tracker.js` - Main tracking module
- `scripts/import-leads.js` - Import leads from research files

---

## Integration with Other Systems

### Auto-log from Node.js
```javascript
const tracker = require('./caesars-legions-backend/lib/outreach-tracker');

// After sending via automation
tracker.logDM({ handle: lead.handle, name: lead.name });
```

### Cron Job (Daily Report)
```bash
# Add to crontab or Clawdbot cron
0 9 * * * node caesars-legions-backend/lib/outreach-tracker.js dashboard
```

### Telegram Notification
```javascript
const tracker = require('./caesars-legions-backend/lib/outreach-tracker');
const { sendTelegramMessage } = require('./telegram-notifier');

const report = tracker.generateDailyReport();
if (report.today.conversions > 0) {
  sendTelegramMessage(`🎉 New client! +$${report.today.revenue_today}/mo`, 'urgent');
}
```

---

## Next Steps

1. ✅ Leads imported (8 total)
2. ⏳ Send first batch of DMs tonight (Taylor + 2 others)
3. ⏳ Log DMs as you send them
4. ⏳ Check dashboard daily (9 AM)
5. ⏳ Follow up on leads after 3 days

---

## Success Targets

**Week 1 Goals:**
- 8 DMs sent → 4 responses (50%) → 2 calls → 1 client ($250 MRR)

**Week 2 Goals:**
- 15 DMs sent → 7 responses → 3 calls → 2 clients ($500 MRR total)

**Month 1 Goals:**
- 50 DMs sent → 20 responses → 8 calls → 4 clients ($1,000 MRR)

---

🏛️ **Track every interaction. Optimize the funnel. Win.**
