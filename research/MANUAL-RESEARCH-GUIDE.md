# 📋 Manual Prospect Research Guide

**When to use:** Apollo.io out of credits, rate limits hit, or need highly targeted research

**Goal:** Find 10-20 hot prospects per session

---

## 🎯 Ideal Customer Profile (ICP)

**Must Have:**
- B2B SaaS company
- 5-50 employees (sweet spot: 10-20)
- Founder/CEO active on X/Twitter
- Revenue >$5K MRR (can afford $250/mo)

**Strong Signals:**
- Recently tweeted about cold email challenges
- Posts revenue updates (#buildinpublic)
- Mentioned needing more leads/customers
- Asked for outbound/sales tool recommendations
- Growing fast (hiring, launching features)

**Red Flags:**
- Enterprise size (>200 employees) - too slow
- Solopreneur with <$1K MRR - can't afford yet
- B2C product - not our ICP
- Inactive on social - hard to reach

---

## 🔍 Manual Research Process

### Step 1: Find Prospects on X (30 min)

**Search Queries** (use X.com advanced search):

1. **Direct Pain Points:**
   ```
   "cold email" (low response OR not working OR struggling)
   "outbound sales" (need help OR frustrated)
   "lead generation" (looking for OR need)
   ```

2. **Revenue Signals:**
   ```
   #buildinpublic MRR
   "hit $10K MRR" (recent milestone = growth mode)
   "need more customers" SaaS
   ```

3. **Tool Recommendations:**
   ```
   "cold email tool" (which should OR recommend)
   "best outbound" SaaS
   "sales automation" (recommendations OR help)
   ```

4. **Filter by Account Type:**
   - Use `from:@username` to search specific accounts
   - Follow relevant hashtags: #buildinpublic, #indiehackers, #SaaS
   - Check who's retweeting/replying to known SaaS founders

**What to Look For:**
- Tweets from last 7 days (recent = top of mind)
- High engagement (likes, retweets = active audience)
- Bio mentions company/role (CEO, Founder, etc.)
- Link to product in bio

### Step 2: Qualify Each Prospect (5 min per person)

For each potential prospect, open:

1. **Their X Profile:**
   - Do they tweet regularly? (3+ tweets/week = active)
   - Do they build in public? (share metrics, progress)
   - Is their product B2B SaaS? (check bio link)

2. **Their Company Website:**
   - What do they sell?
   - Who's their customer? (B2B? Enterprise? SMB?)
   - Team size? (look for "About" or "Team" page)
   - Any case studies or customers mentioned?

3. **LinkedIn (if public):**
   - Company size on LinkedIn
   - Recent hires? (growth signal)
   - Funding announcements?

**Scoring Checklist:**

| Criteria | Points | Your Score |
|----------|--------|------------|
| Tweeted about cold email in last 30 days | 25 | ___ |
| Active on X (5+ tweets/week) | 15 | ___ |
| Builds in public | 10 | ___ |
| 5-50 employees | 20 | ___ |
| Posted revenue >$5K MRR | 10 | ___ |
| Asked for recommendations | 10 | ___ |
| Founded <2 years ago (still scrappy) | 5 | ___ |
| Engaged with similar content | 5 | ___ |

**Total Score:** ___/100

- **70+ = Hot lead** (reach out ASAP)
- **50-69 = Warm lead** (good fit, lower priority)
- **<50 = Cold lead** (skip for now)

### Step 3: Capture Data (2 min per person)

**Create JSON entry** (copy this template to `research/manual-prospects.json`):

```json
{
  "name": "Sarah Johnson",
  "title": "CEO & Co-Founder",
  "company": "Acme SaaS",
  "twitter": "https://twitter.com/sarahj",
  "linkedin": "https://linkedin.com/in/sarahjohnson",
  "employees": 12,
  "recentTweets": [
    "Spent 10 hours this week on cold outreach. 2% reply rate. There has to be a better way.",
    "Hit $15K MRR this month! Now the challenge is scaling sales without hiring a full team.",
    "Anyone have cold email tool recommendations? Current setup is too manual."
  ],
  "signals": {
    "coldEmailPain": true,
    "needsLeads": true,
    "askedForRecs": true,
    "lowResponseRate": true
  },
  "notes": "Perfect fit - complained about cold email 3 days ago, actively looking for solution",
  "source": "X search: 'cold email not working'",
  "foundAt": "2026-02-02T10:30:00Z"
}
```

**Quick Tips:**
- Copy exact tweet text (for personalization later)
- Note which search query found them
- Add any context (recent launch, hiring, etc.)

---

## 🚀 Alternative Research Sources

### 1. Reddit (r/SaaS, r/indiehackers, r/startups)

**Search for:**
- "How to get first customers"
- "Cold email strategy"
- "Outbound sales for SaaS"

**Look for:**
- Founders asking for help
- Revenue updates (shows traction)
- Frustration posts (pain points)

### 2. Indie Hackers

**Browse:**
- Recent product launches (last 30 days)
- Revenue milestones ($5K+ MRR)
- "Ask IH" posts about sales/growth

**Filter by:**
- B2B products only
- Solo founder or small team
- Active on platform (last post <7 days)

### 3. Product Hunt

**Filter:**
- Launched in last 3 months (new, need traction)
- Category: B2B, SaaS, Productivity
- Upvotes >50 (some validation)

**Check:**
- Maker's Twitter (linked on PH profile)
- Comments (any mention of growth challenges?)
- Website (do they have customers yet?)

---

## 📊 Batch Processing

**Goal:** 10 hot leads per session (2-3 hours)

**Workflow:**

1. **Hour 1: Broad search**
   - Run 5-10 X searches
   - Bookmark 30-50 potential profiles
   - Quick scan (30 sec each)

2. **Hour 2: Deep qualification**
   - Pick top 20 from bookmarks
   - Full qualification (5 min each)
   - Score each prospect

3. **Hour 3: Data capture**
   - Create JSON entries for top 10
   - Run through prospect-scorer.js
   - Prioritize by score

**Output:** `research/manual-prospects-YYYY-MM-DD.json`

---

## 🎯 Next Steps After Research

Once you have 10+ hot prospects:

1. **Score them:**
   ```bash
   node scripts/research-prospects.js --source=manual --input=research/manual-prospects.json --save
   ```

2. **Review top 5:**
   - Read their recent tweets
   - Check their product
   - Draft personalized opener

3. **Send DMs** (see OUTREACH-PLAYBOOK.md for templates)

4. **Track in spreadsheet:**
   | Name | Score | DM Sent | Replied | Call Booked | Status |
   |------|-------|---------|---------|-------------|--------|
   | Sarah J | 85 | ✅ Feb 2 | ❌ | ❌ | Waiting |

---

## 💡 Pro Tips

**Finding Hidden Gems:**
- Search who's replying to known SaaS founders (shows active engagement)
- Check "Liked by" on relevant tweets (shows interest)
- Follow #buildinpublic feed daily (new prospects appear)

**Quality > Quantity:**
- 10 highly qualified prospects > 100 random ones
- Better to spend 30 min researching 1 perfect fit than 5 min on 6 mediocre ones

**Document Everything:**
- Your tweet that caught your eye
- Why they're a good fit
- Best angle for outreach

**Avoid:**
- Agencies (different buying process)
- Consultants (not product companies)
- Very early stage (no revenue = can't afford)
- People who just got funded (too busy)

---

## 🔄 Refresh Cadence

**Daily (if actively hunting for clients):**
- Quick X search (15 min)
- Add 2-3 hot leads to list

**Weekly:**
- Deep research session (2-3 hours)
- Find 10-20 new prospects
- Update scores for existing leads

**Monthly:**
- Review what's working (which sources, search terms)
- Update ICP based on who's converting
- Archive cold leads (free up focus)

---

## ✅ Success Metrics

**Good research session:**
- 10+ prospects found
- 5+ scored 70+ (hot)
- 3+ ready for immediate outreach

**Great research session:**
- 20+ prospects found
- 10+ scored 70+ (hot)
- 5+ with recent pain point tweets (easy personalization)

---

🏛️ **Remember: The best prospect is one who's actively looking for a solution. Find the pain, offer the cure.**
