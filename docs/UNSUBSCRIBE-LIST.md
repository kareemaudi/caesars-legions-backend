# Global Unsubscribe List

**Status:** Production Ready  
**Compliance:** CAN-SPAM Act  
**Auto-enforcement:** Yes (all email sends are checked)

---

## 🎯 What is This?

The Global Unsubscribe List is a permanent blocklist of email addresses that have unsubscribed from **ANY** of your campaigns. Once an email is on this list, it will **NEVER** be contacted again, regardless of:

- Which client added it
- Which campaign tried to reach them
- Manual overrides (unless explicitly forced)

This is critical for:
- **Legal compliance** (CAN-SPAM Act requires honoring unsubscribes)
- **Sender reputation** (emailing unsubscribed users = spam complaints = blocked domain)
- **Professional ethics** (respecting user preferences)

---

## 🔒 Auto-Protection

The unsubscribe check is **automatically enforced** at the email sending layer:

```javascript
// This email will be blocked if user@example.com is unsubscribed
await sendEmail({
  to: 'user@example.com',
  subject: 'Test',
  body: 'Hello'
});
// Returns: { success: false, error: 'Recipient is on global unsubscribe list', blocked: true }
```

**You cannot accidentally email unsubscribed users.**

---

## 📥 How Emails Get Added

### 1. Automatic (Webhooks)

When Instantly.ai sends an unsubscribe event:

```javascript
// Webhook handler automatically adds to list
{
  type: 'email.unsubscribed',
  data: {
    email: 'user@example.com',
    campaign_id: 123
  }
}
// → Added to global unsubscribe list instantly
```

### 2. Manual Addition

For compliance imports or manual requests:

```javascript
const unsubscribeList = require('./lib/unsubscribe-list');

// Add single email
unsubscribeList.addToUnsubscribeList('user@example.com', {
  source: 'manual_request',
  reason: 'Contacted support',
  campaign_id: 456
});

// Bulk import from CSV
const emails = ['user1@example.com', 'user2@example.com', 'user3@example.com'];
const result = unsubscribeList.bulkImport(emails, {
  source: 'csv_import',
  reason: 'Previous system migration'
});
console.log(`Added: ${result.added}, Skipped: ${result.skipped}`);
```

---

## 🔍 Checking Unsubscribe Status

### Check Single Email

```javascript
const unsubscribeList = require('./lib/unsubscribe-list');

if (unsubscribeList.isUnsubscribed('user@example.com')) {
  console.log('This email is unsubscribed - DO NOT CONTACT');
} else {
  console.log('OK to email');
}
```

### Get Unsubscribe Details

```javascript
const record = unsubscribeList.getUnsubscribeRecord('user@example.com');

if (record) {
  console.log(`Unsubscribed on: ${record.unsubscribed_at}`);
  console.log(`Source: ${record.source}`);
  console.log(`Reason: ${record.reason}`);
  console.log(`From campaign: ${record.campaign_id}`);
}
```

### Filter Lead Lists

```javascript
const leads = [
  { email: 'user1@example.com', name: 'John' },
  { email: 'user2@example.com', name: 'Jane' },
  { email: 'unsubscribed@example.com', name: 'Bob' }
];

const { allowed, blocked } = unsubscribeList.filterUnsubscribed(leads);

console.log(`Can email: ${allowed.length}`);
console.log(`Blocked: ${blocked.length}`);

// Send only to allowed
allowed.forEach(lead => sendEmail(lead.email, ...));
```

---

## 📊 Statistics

Get insights into your unsubscribe list:

```javascript
const stats = unsubscribeList.getStats();

console.log(`Total unsubscribed: ${stats.total}`);
console.log(`Last 7 days: ${stats.recentUnsubscribes.last7Days}`);
console.log(`Last 30 days: ${stats.recentUnsubscribes.last30Days}`);

// By source
Object.entries(stats.bySource).forEach(([source, count]) => {
  console.log(`${source}: ${count}`);
});
// Example output:
// webhook_instantly: 45
// manual_request: 12
// csv_import: 3
```

**Track your unsubscribe rate:**
- Target: <0.5% per campaign (industry standard)
- Warning: >1% (email quality issues)
- Critical: >2% (major problems with targeting/copy)

---

## 📤 Export for Compliance

For audits or data portability:

```javascript
const fullList = unsubscribeList.exportList();

// Save to CSV
const csv = fullList.map(record => 
  `${record.email},${record.unsubscribed_at},${record.source},${record.reason}`
).join('\n');

fs.writeFileSync('unsubscribe-export.csv', csv);
console.log('Exported to unsubscribe-export.csv');
```

---

## 🔄 Re-subscribing (Use with Caution)

**Only** remove emails if the user **explicitly** requests to be re-subscribed:

```javascript
// User sends email: "Please add me back to your list"
unsubscribeList.removeFromUnsubscribeList('user@example.com');
console.log('Re-subscribed user@example.com');
```

**Warning:** Most unsubscribes are permanent. Only remove if:
1. User explicitly requests it via email
2. You have written confirmation
3. You document the reason

**Never** bulk-remove unsubscribes to "clean the list" - that's illegal and unethical.

---

## 🗄️ Data Storage

Location: `data/global-unsubscribe.json`

**Format:**
```json
{
  "emails": [
    {
      "email": "user@example.com",
      "unsubscribed_at": "2026-02-02T12:30:00.000Z",
      "source": "webhook_instantly",
      "reason": "user_request",
      "campaign_id": 123,
      "client_id": 5,
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0..."
    }
  ],
  "lastUpdated": "2026-02-02T12:30:00.000Z"
}
```

**Backup:** Automatically saved on every change. Consider backing up to S3/cloud for disaster recovery.

---

## 🧪 Testing

Run the test suite:

```bash
node scripts/test-unsubscribe.js
```

This will:
1. Add test emails to the list
2. Check unsubscribe status (case-insensitive)
3. Filter lead lists
4. Test bulk import
5. Export the list
6. Clean up test data

**Output:**
```
🧪 Testing Global Unsubscribe List
==================================================

1. Adding emails to unsubscribe list...
   ✓ test1@example.com (added)
   ✓ test2@example.com (added)
   ⊘ test3@example.com (already exists)

2. Checking unsubscribe status...
   test1@example.com: 🚫 UNSUBSCRIBED
   notunsubscribed@example.com: ✓ OK to email

...
```

---

## 🚨 Integration Checklist

Ensure unsubscribe checks are in place:

- [x] Webhook handler adds unsubscribes automatically
- [x] Email sender checks list before sending
- [x] Batch sender filters unsubscribed emails
- [ ] Lead import warns if emails are already unsubscribed
- [ ] Dashboard shows unsubscribe stats
- [ ] Client UI allows manual unsubscribe additions
- [ ] Compliance export tool ready for audits

---

## 📈 Best Practices

### Keep Unsubscribe Rate Low

**Target:** <0.5% per campaign

**How to achieve:**
1. **Better targeting** - Only email relevant people
2. **Clear value prop** - Make emails worth reading
3. **Easy opt-out** - Don't hide the unsubscribe link
4. **Frequency management** - Don't email too often
5. **Quality copy** - Follow cold email best practices

### Monitor Trends

```javascript
// Check weekly
const stats = unsubscribeList.getStats();
const weeklyRate = stats.recentUnsubscribes.last7Days;

if (weeklyRate > 10) {
  console.warn('⚠️ High unsubscribe rate this week!');
  console.log('Check recent campaigns for issues');
}
```

### Cross-client Protection

The list is **global** across all clients. If Client A's campaign causes an unsubscribe, Client B's campaigns will also respect it.

**Why?** 
- You're the sender (shared domain/IP)
- One bad experience affects your entire platform
- Legal compliance applies to your business, not individual clients

---

## 🔐 Security

**Access Control:**
- Unsubscribe additions: Anyone (webhooks, manual)
- Unsubscribe removals: Admin only (logged)
- Export: Admin only

**Audit Trail:**
Every record includes:
- Who unsubscribed (email)
- When (timestamp)
- How (source: webhook, manual, etc.)
- Why (reason: user_request, bounce, spam, etc.)
- From where (campaign_id, client_id)

---

## 🆘 Troubleshooting

### "Why can't I email this lead?"

```javascript
const record = unsubscribeList.getUnsubscribeRecord('user@example.com');
console.log(record);
// Shows why they were unsubscribed
```

### "Accidentally added wrong email"

```javascript
unsubscribeList.removeFromUnsubscribeList('wrong@example.com');
console.log('Removed wrong email');
```

### "Need to import from old system"

```javascript
const oldSystemUnsubscribes = require('./old-unsubscribes.json');
const result = unsubscribeList.bulkImport(oldSystemUnsubscribes, {
  source: 'legacy_import',
  reason: 'Migration from old system'
});
console.log(`Imported ${result.added} emails`);
```

---

## 📚 Related Documentation

- [Webhook Setup](./WEBHOOK-SETUP.md) - How unsubscribes flow in
- [Email Sender](../lib/email-sender.js) - Enforcement layer
- [Compliance Guide](./COMPLIANCE.md) - Legal requirements

---

**Built:** Day 1, 24/7 Work Session  
**Priority:** P0 (Compliance & Reputation)  
**Status:** Production Ready ✅

🏛️ **Caesar protects your reputation.**
