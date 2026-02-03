# X Lead Scraper - Documentation

## Purpose

Automatically find qualified B2B SaaS founders on X (Twitter) who are discussing cold email, outbound automation, and lead generation.

## How It Works

1. **Search X** for specific keywords using bird CLI
2. **Score leads** based on:
   - Whether they share metrics (reply rates, volume)
   - Pain points expressed
   - Founder/CEO in bio
   - Revenue signals
   - Engagement levels
   - Recent activity
3. **Filter** to only qualified prospects (score ≥ 6/50)
4. **Save** to `research/prospects-x-YYYY-MM-DD.jsonl`

## Installation

```bash
# Install bird CLI globally
npm install -g @sweetistics/bird

# Configure with your X cookies
bird config --cookies
```

## Usage

### Manual Run
```bash
# Run with default keywords
node scripts/lead-scraper-x.js

# Dry run (don't save)
node scripts/lead-scraper-x.js --dry-run

# Custom keywords
node scripts/lead-scraper-x.js --keywords="cold email,outbound sales"
```

### Automated (Cron)
```bash
# Add to crontab (run every 6 hours)
0 */6 * * * cd /path/to/caesars-legions-backend && node scripts/lead-scraper-x.js
```

Or use Clawdbot cron:
```bash
clawdbot cron add --name "X Lead Research" --schedule "0 */6 * * *" --command "node scripts/lead-scraper-x.js"
```

## Configuration

Edit `CONFIG` object in `lead-scraper-x.js`:

```javascript
const CONFIG = {
  keywords: ['cold email', 'outbound automation', ...],
  minFollowers: 50,
  maxFollowers: 100000,
  minScore: 6,
  maxResults: 20
};
```

## Scoring System

| Criterion | Points | Description |
|-----------|--------|-------------|
| Has Metrics | 10 | Shares reply rates, volume, etc. |
| Pain Point | 15 | Expresses frustration/challenge |
| Is Founder | 12 | Bio says founder/CEO |
| Revenue Signals | 8 | Mentions revenue/customers |
| High Engagement | 5 | 100-100K followers, 10+ likes |
| Recent Activity | 3 | Posted in last 7 days |

**Max Score:** 53 points

**Thresholds:**
- High Priority: ≥25 points
- Medium Priority: 15-24 points
- Low Priority: 6-14 points
- Filtered out: <6 points

## Output Format

JSONL file in `research/`:

```json
{
  "handle": "@username",
  "name": "First Last",
  "bio": "Founder @ Company...",
  "followers": 1234,
  "fit_score": 28,
  "reasons": "Shares metrics, Expresses pain point, Founder/CEO",
  "pain_point": "Struggling to scale cold email without...",
  "tweet_text": "Just hit 7% reply rate but...",
  "tweet_url": "https://x.com/username/status/123",
  "keyword_found": "cold email",
  "priority": "HIGH",
  "scraped_at": "2026-02-02T22:45:00Z"
}
```

## Integration with Outreach

After running the scraper:

1. **Review leads** in `research/prospects-x-YYYY-MM-DD.jsonl`
2. **Pick top 5** highest scoring leads
3. **Craft DM** using their pain point and tweet context
4. **Track in outreach tracker** (`outreach/dm-log.jsonl`)

## Rate Limiting

- Searches 3 keywords per run (to avoid X rate limits)
- 2-second delay between searches
- Recommended: Run every 6 hours max

## Monitoring

Check if running correctly:

```bash
# Check recent output
ls -lt research/prospects-x-*.jsonl | head -1

# Count prospects found today
wc -l research/prospects-x-$(date +%Y-%m-%d).jsonl

# View top prospects
head -n 5 research/prospects-x-$(date +%Y-%m-%d).jsonl | jq .
```

## Troubleshooting

### Error: bird CLI not found
```bash
npm install -g @sweetistics/bird
```

### Error: X rate limit
- Wait 15 minutes
- Reduce keywords searched per run
- Increase delay between searches

### No results found
- Check if bird CLI is authenticated (`bird me`)
- Try broader keywords
- Lower `minScore` threshold temporarily

## Future Enhancements

- [ ] Auto-DM top prospects (needs approval system)
- [ ] Track lead status over time (engaged, converted, etc.)
- [ ] A/B test different DM templates
- [ ] Integration with CRM/database
- [ ] Sentiment analysis on tweets
- [ ] Network analysis (who they follow/engage with)

---

**Auto-Approval:** ✅ YES (read-only research)  
**Last Updated:** 2026-02-02
