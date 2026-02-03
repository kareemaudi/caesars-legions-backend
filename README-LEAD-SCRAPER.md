# 🔍 X Lead Scraper - Find Your First Clients

**Purpose:** Automate discovery of B2B SaaS founders discussing cold email pain on X (Twitter)

---

## What It Does

1. **Searches X** for 10 high-intent queries like:
   - "cold email not working"
   - "outbound sales struggling"
   - "cold email agency expensive"
   - "looking for cold email tool"

2. **Scores each lead** based on:
   - Pain signals (struggling, expensive, not working) → +3 points each
   - Fit signals (founder, CEO, B2B SaaS, revenue) → +2 points each
   - Follower count (1K+ → 10K+) → +2 to +5 points
   - Recency (posted <7 days ago) → +2 to +3 points
   - Engagement (likes, retweets, replies) → +1 to +2 points

3. **Outputs:**
   - `research/x-leads-YYYY-MM-DD.jsonl` - All qualified leads
   - `research/outreach-plan-YYYY-MM-DD.json` - Top 10 with DM strategies

---

## Installation

**Prerequisites:**
- `bird` CLI installed (skills/bird)
- X/Twitter account cookies configured

```bash
# Test bird CLI works
bird search "cold email" --limit 5
```

---

## Usage

### Basic Scrape
```bash
node scripts/run-lead-scraper.js
```

### Custom Parameters
```bash
# Higher quality threshold
node scripts/run-lead-scraper.js --min-score 8

# More results per query
node scripts/run-lead-scraper.js --limit 50

# Both
node scripts/run-lead-scraper.js --min-score 10 --limit 30
```

---

## Output Format

### Leads File (JSONL)
```json
{
  "username": "saasfounder",
  "name": "Jane Doe",
  "bio": "Building B2B SaaS at Acme Inc. $2M ARR.",
  "followers": 8500,
  "verified": true,
  "tweet_text": "Our cold email campaigns are not working. Paying $15K/mo and frustrated.",
  "tweet_url": "https://x.com/saasfounder/status/123",
  "tweet_date": "2026-02-03T10:30:00Z",
  "likes": 15,
  "retweets": 3,
  "replies": 8,
  "score": 18,
  "fit": "HIGH",
  "scraped_at": "2026-02-03T16:00:00Z"
}
```

### Outreach Plan (JSON)
```json
{
  "generated_at": "2026-02-03T16:00:00Z",
  "total_leads": 47,
  "outreach_batch": 10,
  "leads": [
    {
      "username": "saasfounder",
      "name": "Jane Doe",
      "score": 18,
      "fit": "HIGH",
      "context": "Our cold email campaigns are not working. Paying $15K/mo and frustrated.",
      "dm_approach": "Acknowledge pricing frustration → Empathize with poor results → Offer free test campaign (50 emails) → Share Caesar's Legions value prop ($250/mo vs $18K/mo agencies)",
      "priority": 1
    }
  ]
}
```

---

## Scoring System

| Criteria | Points | Notes |
|----------|--------|-------|
| Pain signal word | +3 each | struggling, expensive, not working, etc. |
| Fit signal word | +2 each | founder, CEO, B2B SaaS, revenue, etc. |
| 1K-5K followers | +2 | Good reach |
| 5K-10K followers | +3 | Strong reach |
| 10K+ followers | +5 | High-value target |
| Verified account | +3 | Credibility signal |
| Posted <3 days | +3 | Hot lead |
| Posted 3-7 days | +2 | Recent |
| 10+ likes | +1 | Engaged audience |
| 5+ retweets | +1 | Resonated |
| 3+ replies | +2 | Active discussion |

**Fit Categories:**
- **HIGH:** Score ≥11 (top priority)
- **MEDIUM:** Score 6-10 (good prospects)
- **LOW:** Score ≤5 (filtered out by default)

---

## DM Strategy Templates

The scraper auto-generates personalized approaches. Example outputs:

### High-Intent Pain
**Context:** "Cold email agencies charge $18K/mo. Way too expensive for us."

**Approach:**
1. Acknowledge pricing frustration
2. Share Caesar's Legions pricing ($250/mo)
3. Offer free test campaign (50 emails)
4. Show ROI math (72x cheaper)

### Poor Results
**Context:** "Our cold email open rates are terrible. 5% at best."

**Approach:**
1. Empathize with poor results
2. Share typical Caesar's Legions performance (35-45% open, 8-12% reply)
3. Explain AI-powered personalization
4. Offer free campaign to prove it

### Looking for Tool
**Context:** "Anyone have cold email tool recommendations? Need something affordable."

**Approach:**
1. Direct offer to help
2. Quick pitch: AI-powered cold email at $250/mo
3. Free test campaign
4. Case study (when we have one)

---

## Automation

### Run Every 6 Hours (Heartbeat)
Add to `HEARTBEAT.md`:
```javascript
// Every 6 hours
if (hoursSinceLastScrape >= 6) {
  await exec('node caesars-legions-backend/scripts/run-lead-scraper.js');
  logActivity('Lead scraper executed', { leadsFound: leads.length });
}
```

### Daily Summary
Track in `memory/metrics-YYYY-MM.json`:
```json
{
  "lead_generation": {
    "leads_found": 47,
    "high_fit": 12,
    "medium_fit": 23,
    "low_fit": 12,
    "dms_sent": 8,
    "responses": 2,
    "demos_booked": 1
  }
}
```

---

## Next Steps After Scraping

1. **Review Top 10** in outreach plan
2. **Customize DMs** based on their specific pain
3. **Send 5-10 DMs/day** (avoid spam detection)
4. **Track responses** in `research/outreach-tracking.jsonl`:
   ```json
   {
     "date": "2026-02-03",
     "username": "saasfounder",
     "dm_sent": true,
     "response": "Interested! Tell me more",
     "demo_booked": true,
     "outcome": "client"
   }
   ```

---

## Compliance

**Rate Limits:**
- 2 seconds between search queries (built-in)
- Max 10 queries per run
- Run max 4x/day (every 6 hours)

**X Terms:**
- Only scrape public data
- No automated DMs (manual only)
- Respect user privacy
- Don't spam

---

## Troubleshooting

### "bird: command not found"
```bash
# Install bird CLI
cd skills/bird
npm install
npm link
```

### "No leads found"
- Lower `--min-score` threshold
- Increase `--limit` per query
- Check if X cookies expired (`bird auth status`)

### "Rate limit exceeded"
- Wait 15 minutes
- Reduce scraping frequency
- Spread out queries more (increase delay)

---

## Integration with Caesar's Legions

Once we have leads:
1. **Onboard client** → `scripts/onboard-client.js`
2. **Create campaign** → Use their pain as copy angle
3. **Track performance** → Dashboard shows opens/replies
4. **Get testimonial** → Use for next round of outreach

---

🏛️ **Veni. Vidi. Vici.**
