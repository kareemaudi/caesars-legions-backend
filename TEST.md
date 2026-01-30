# 🧪 Caesar's Legions - Testing Guide

## Quick Smoke Test (No API Keys Required)

This test runs with mock data to verify everything works.

### 1. Test Client Onboarding

Create a test client manually:

```bash
cd caesars-legions-backend
node -e "
const db = require('./lib/db');
const result = db.insertClient({
  email: 'caesar@test.com',
  name: 'Caesar Test',
  company: 'Test SaaS Inc',
  target_audience: 'B2B SaaS founders',
  value_prop: 'We help you get more customers with AI-powered cold email',
  website: 'https://test.com'
});
console.log('✅ Test client created! ID:', result.lastInsertRowid);
"
```

### 2. Test Campaign (Dry Run)

Run a campaign with mock leads (no API keys needed):

```bash
node scripts/run-campaign.js 1
```

**Expected output:**
- Sources 10 mock leads
- Generates personalized emails (or fallback templates if no OpenAI key)
- Shows email previews
- `[DRY RUN - not sent]` for each email
- Logs to database

### 3. Test Dashboard

Start the dashboard:

```bash
npm run dashboard
```

Then open: http://localhost:3000

**Expected:**
- See "Test SaaS Inc" in client list
- Click → View dashboard
- See stats (0% open rate initially)
- See recent emails sent (10 from dry run)

---

## Test With Real API Keys

### 1. Add OpenAI Key

```bash
# Edit .env
OPENAI_API_KEY=sk-your-real-key
```

### 2. Run Campaign Again

```bash
node scripts/run-campaign.js 1
```

**Expected:**
- Now uses GPT-4 for email generation
- Emails should be more personalized
- Still dry run (safe)

### 3. Test With Real Sending

⚠️ **IMPORTANT:** Only do this when you're ready!

```bash
# Add Instantly.ai key first
# Then run:
node scripts/run-campaign.js 1 --send --limit=1
```

This sends **1 real email**. Verify it works before scaling up.

---

## Test Apollo.io Lead Sourcing

If you have Apollo API access:

```bash
# Edit .env
APOLLO_API_KEY=your-apollo-key

# Run campaign
node scripts/run-campaign.js 1
```

**Expected:**
- Sources REAL B2B SaaS founders
- No more mock leads
- Shows LinkedIn URLs, company data

---

## Test Data Persistence

```bash
# Check database file exists
ls data/legions.json

# View raw data
cat data/legions.json | jq '.'

# Check clients
node -e "const db = require('./lib/db'); console.log(db.getAllClients());"

# Check emails sent
node -e "const db = require('./lib/db'); console.log(db.getEmailStats(1));"
```

---

## Test Campaign Runner Flow

Full end-to-end test:

```bash
# 1. Onboard client
npm run onboard
# Enter test data when prompted

# 2. Run campaign (dry run)
node scripts/run-campaign.js 1

# 3. Check dashboard
npm run dashboard
# Open http://localhost:3000/dashboard/1

# 4. Verify data persisted
node -e "const db = require('./lib/db'); console.log(db.getRecentEmails(1, 5));"
```

---

## Performance Test

Test with 100 leads:

```bash
node scripts/run-campaign.js 1 --limit=100
```

**Expected:**
- Takes ~2-3 minutes (GPT-4 + rate limiting)
- All 100 emails generated
- Stored in database
- Dashboard updates

---

## Error Handling Test

### Test Missing Client

```bash
node scripts/run-campaign.js 999
```

**Expected:** `❌ Client not found`

### Test Without API Keys

```bash
# Remove all API keys from .env
node scripts/run-campaign.js 1
```

**Expected:**
- Falls back to mock leads
- Falls back to template emails
- Still completes successfully

---

## Database Reset

To start fresh:

```bash
rm data/legions.json
node -e "require('./lib/db');" # Reinitialize
```

---

## Production Pre-Flight Checklist

Before deploying to real clients:

- [ ] OpenAI key works (run campaign, check emails look good)
- [ ] Apollo key works (verify real leads sourced)
- [ ] Instantly key works (send 1 test email to yourself)
- [ ] Dashboard loads (http://localhost:3000)
- [ ] Emails don't land in spam (send to Gmail/Outlook test accounts)
- [ ] Data persists (check `data/legions.json` exists)
- [ ] Cron works (test scheduled campaign)

---

## Troubleshooting

### "Cannot find module 'openai'"

```bash
npm install
```

### "OPENAI_API_KEY is not defined"

```bash
# Check .env file exists
cat .env
# Make sure it has: OPENAI_API_KEY=sk-...
```

### "Database error"

```bash
# Reset database
rm data/legions.json
node -e "require('./lib/db');"
```

### "Apollo API error"

```bash
# Check API key is valid
# Or remove it and use mock leads:
# Comment out APOLLO_API_KEY in .env
```

---

## Next Steps After Testing

1. Deploy to Railway/Heroku (see DEPLOYMENT.md)
2. Get first real client onboarded
3. Run campaign with --send flag
4. Share dashboard link with client
5. Collect feedback
6. Iterate!

---

🏛️ **Test everything. Trust nothing. Vici.**
