# 🔍 Lead Research Automation System

**Purpose:** Continuously find B2B SaaS founders discussing cold email pain  
**Status:** Framework ready, needs integration with bird CLI / reddit-cli  
**Created:** 2026-02-03

---

## Overview

The lead research system automatically finds qualified prospects by:
1. **Monitoring X/Twitter** for cold email pain points
2. **Scraping Reddit** discussions in relevant subreddits
3. **Scoring prospects** based on multiple signals (0-100)
4. **Categorizing by priority** (HOT/WARM/COLD/RESEARCH)
5. **Deduplicating** to avoid re-processing
6. **Outputting** to daily JSONL files for review

---

## Quick Start

### Manual Run
```bash
cd caesars-legions-backend
node scripts/lead-research-automation.js
```

### Verbose Mode (see all prospects as discovered)
```bash
node scripts/lead-research-automation.js --verbose
```

### Automated (via cron)
```bash
# Every 6 hours
0 */6 * * * cd /path/to/caesars-legions-backend && node scripts/lead-research-automation.js
```

---

## Scoring Algorithm

Each prospect is scored 0-100 based on:

| Signal | Points | Notes |
|--------|--------|-------|
| **Source** | 15-20 | X/Twitter (20) > Reddit (15) |
| **Followers** | 0-25 | >1K (15pt) + >5K (10pt bonus) |
| **Engagement** | 0-10 | High engagement = buying power |
| **Pain explicit** | 20 | Clearly stated pain point |
| **Seeking solution** | 15 | "Looking for", "need help", etc. |
| **Revenue** | 10-15 | >$10K/mo (15pt), >$5K/mo (10pt) |
| **Recency** | 5-10 | Posted <24h (10pt), <7d (5pt) |
| **Industry fit** | 10 | SaaS/B2B/agency/consulting |

### Priority Categories
- **HOT (80-100):** Explicit pain + seeking solution + good fit → DM immediately
- **WARM (60-79):** Clear pain or high engagement → Monitor, DM when opportunity arises
- **COLD (40-59):** Potential fit → Add to nurture list
- **RESEARCH (<40):** Low priority → Keep for future reference

---

## Output Format

### Daily Files
**Location:** `research/prospects-YYYY-MM-DD.jsonl`

Each line is a JSON object:
```json
{
  "id": "1234567890",
  "source": "twitter",
  "username": "saas_founder",
  "display_name": "John Doe",
  "bio": "Building B2B SaaS | $20K MRR",
  "followers": 2500,
  "profile_url": "https://x.com/saas_founder",
  "post_url": "https://x.com/saas_founder/status/1234567890",
  "post_text": "Struggling with cold email reply rates. Currently at 2% but need to be at 10%+. Any recommendations?",
  "post_timestamp": 1706875200000,
  "engagement_rate": 3.2,
  "pain_explicit": true,
  "looking_for_solution": true,
  "mentioned_revenue": 20000,
  "industry": "SaaS",
  "score": 85,
  "priority": "HOT",
  "discovered_at": "2026-02-03T07:00:00Z"
}
```

### Cache File
**Location:** `research/prospect-cache.json`

Array of `source:id` strings to prevent duplicates:
```json
[
  "twitter:1234567890",
  "reddit:abc123",
  "twitter:9876543210"
]
```

---

## Integration Needed

### X/Twitter (via bird CLI)
```javascript
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function searchTwitter(query, limit = 10) {
  const result = await execAsync(`bird search "${query}" --limit ${limit} --json`);
  return JSON.parse(result.stdout);
}
```

**bird CLI commands:**
- `bird search "cold email" --limit 10` → Find tweets
- `bird user @username` → Get profile details
- `bird timeline @username --limit 20` → Recent tweets

### Reddit (via reddit-cli or web scraping)
```javascript
const { exec } = require('child_process');

async function searchReddit(subreddit, keywords, limit = 10) {
  const query = keywords.join(' OR ');
  const result = await execAsync(
    `reddit-cli search "${query}" --subreddit ${subreddit} --limit ${limit} --json`
  );
  return JSON.parse(result.stdout);
}
```

**Alternatives:**
- Reddit API (requires OAuth)
- PRAW (Python Reddit API Wrapper) → call via child_process
- Web scraping with Playwright (skills/reddit-insights)

---

## Search Queries

### X/Twitter
High-intent queries that indicate pain:
- "cold email not working"
- "low reply rate outbound"
- "struggling with cold outreach"
- "need better cold emails"
- "outbound sales broken"
- "cold email advice"
- "how to improve cold email"
- "cold email reply rate"
- "best cold email tool"
- "alternative to instantly"
- "alternative to lemlist"
- "cold email deliverability"

### Reddit Subreddits
Communities where B2B SaaS founders hang out:
- r/SaaS
- r/indiehackers
- r/B2BSaaS
- r/startups
- r/sales
- r/smallbusiness
- r/Entrepreneur

### Pain Keywords
Phrases that indicate cold email pain:
- "reply rate", "not getting replies"
- "emails going to spam"
- "deliverability", "bounce rate"
- "open rate", "looking for"
- "need help", "struggling"
- "frustrat", "better alternative"
- "recommendations", "which tool"

---

## Usage Workflow

### 1. Discovery (Automated)
Run every 6 hours via cron:
```bash
# Add to crontab
0 */6 * * * cd /path/to/caesars-legions-backend && node scripts/lead-research-automation.js >> logs/research.log 2>&1
```

### 2. Review (Daily)
Check today's prospects:
```bash
cat research/prospects-$(date +%Y-%m-%d).jsonl | jq 'select(.priority == "HOT")'
```

### 3. Outreach (Manual for now)
For HOT prospects (80-100 score):
1. Review their profile and recent posts
2. Craft personalized DM (use templates from SALES-BATTLECARD.md)
3. Track in outreach system
4. Follow up 3-5 days later if no response

### 4. Nurture (Automated later)
For WARM/COLD prospects:
1. Add to X list "Caesar Prospects"
2. Engage with their content (like, retweet, thoughtful reply)
3. Build relationship before pitching
4. DM when they post about cold email again

---

## Expected Results

### Per 6-Hour Run
- **Total prospects found:** 20-50
- **HOT (immediate outreach):** 3-8
- **WARM (monitor):** 5-12
- **COLD (nurture):** 5-15
- **RESEARCH (archive):** 5-15

### Daily (4 runs)
- **80-200 prospects** total
- **12-32 HOT prospects** → Immediate DM candidates
- **Conversion estimate:** 10-15% reply rate = 1-3 conversations per day

### Weekly
- **500+ prospects** in database
- **~15 conversations** started
- **1-2 demos** booked (if product-market fit)
- **~$1K MRR** potential (2 clients at $500/mo)

---

## Metrics to Track

Log to `research/research-metrics.jsonl`:

```json
{
  "timestamp": "2026-02-03T07:00:00Z",
  "run_id": "abc123",
  "duration_ms": 12500,
  "prospects_found": 45,
  "by_priority": {
    "HOT": 7,
    "WARM": 12,
    "COLD": 18,
    "RESEARCH": 8
  },
  "by_source": {
    "twitter": 28,
    "reddit": 17
  },
  "avg_score": 54.3,
  "with_pain": 23,
  "seeking_solution": 15,
  "duplicates_skipped": 12
}
```

---

## Improvements (Future)

### Short-term
- [ ] Integrate bird CLI for X search
- [ ] Integrate reddit-cli or reddit-insights MCP
- [ ] Add email extraction (if public in bio)
- [ ] Auto-generate DM drafts for HOT prospects

### Medium-term
- [ ] Sentiment analysis on posts (positive/negative tone)
- [ ] Competitor mention detection ("using Instantly but...")
- [ ] Team size extraction (1 founder vs 10-person team)
- [ ] LinkedIn profile lookup (for decision-maker verification)

### Long-term
- [ ] Auto-engage with prospects (like, reply)
- [ ] Auto-DM (with approval workflow)
- [ ] CRM integration (HubSpot, Pipedrive)
- [ ] Lead enrichment (Clearbit, Apollo.io)
- [ ] Predictive scoring (ML model based on conversions)

---

## Troubleshooting

### "No prospects found"
- Check bird CLI is installed: `bird --version`
- Verify reddit-cli is working: `reddit-cli --help`
- Check API rate limits (X: 180 req/15min, Reddit: 60 req/min)
- Try different search queries

### "Duplicate prospects"
- Cache is working correctly (prevents re-processing)
- Delete `research/prospect-cache.json` to reset
- Check if you want to re-process old prospects

### "Low scores"
- Adjust scoring algorithm in `scoreProspect()`
- Lower threshold for HOT priority (e.g., 70 instead of 80)
- Add more signals (company size, funding, etc.)

---

## Examples

### HOT Prospect (Score: 87)
```
Source: X/Twitter
Username: @saas_founder_xyz
Followers: 3,500
Post: "Our cold emails are getting 1.2% reply rate. Need to 10x this or we're toast. 
       Currently using Instantly but thinking of switching. Any recommendations?"

Pain: ✓ Explicit (low reply rate, considering switch)
Solution: ✓ Seeking (asking for recommendations)
Fit: ✓ SaaS founder, using competitor
Revenue: ✓ Implied (has budget for Instantly)

→ DM immediately with personalized message
```

### WARM Prospect (Score: 68)
```
Source: Reddit r/SaaS
Username: u/indie_builder
Karma: 1,200
Post: "Just hit $15K MRR! Now struggling to scale outbound. 
       Hired a VA but emails still not converting well."

Pain: ✓ Implicit (outbound not converting)
Solution: ? Not actively seeking
Fit: ✓ SaaS, $15K MRR (good budget)
Revenue: ✓ $15K/mo

→ Monitor, engage with their content, DM when opportunity arises
```

### COLD Prospect (Score: 45)
```
Source: Reddit r/startups
Username: u/first_time_founder
Post: "Launching my first SaaS next month. What's the best way to get initial customers?"

Pain: ? General question, not specific to cold email
Solution: ✓ Open to suggestions
Fit: ? Too early (not launched yet)

→ Add to nurture list, check back in 3 months
```

---

## Next Steps

1. **Integrate bird CLI** for X search
2. **Integrate reddit-cli** or reddit-insights MCP
3. **Test with real data** (run for 1 week)
4. **Analyze results** (conversion rate, quality)
5. **Optimize scoring** based on learnings
6. **Automate outreach** (with approval workflow)

---

🏛️ **Veni. Vidi. Vici.**
