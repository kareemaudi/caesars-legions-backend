# 🎯 Prospect Sourcing Playbook

**Goal:** Find 10-20 qualified B2B SaaS founders per day  
**ICP:** $500K-$5M ARR, struggling with cold email, tech-savvy

---

## 🚀 Primary Sources (No Rate Limits)

### 1. Reddit Thread Mining

**Best Subreddits:**
- r/SaaS (daily discussions, "Show HN Saturday")
- r/indiehackers (revenue posts, asks for help)
- r/B2B_Sales (cold email threads)
- r/Entrepreneur (scale-up stage founders)

**Process:**
1. Search for threads about cold email pain
2. Find OPs with revenue signals ($500K+ ARR mentions)
3. Extract username with: `node scripts/reddit-username-extractor.js <url>`
4. Find their Twitter/LinkedIn (usually same handle)
5. Draft personalized DM
6. Add to outreach queue

**Quality Score:**
- OP actively complaining about cold email = 10/10 (hot lead)
- OP asking for cold email tools = 8/10
- OP in comments discussing outbound = 6/10
- Random mention of growth = 3/10

**Example Search Queries:**
- "cold email not working"
- "outbound lead gen struggling"
- "how to improve reply rate"
- "best cold email tool"
- "email deliverability issues"

---

### 2. Y Combinator Directory

**Access:** https://www.ycombinator.com/companies

**Filters:**
- Batch: W24, S24, W25, S25 (recent = growth phase)
- Industry: B2B, SaaS, Enterprise Software
- Team Size: 5-50 (has revenue, not too big)
- Status: Active

**Process:**
1. Browse filtered list
2. Read one-liner (does cold email make sense for them?)
3. Find founder on LinkedIn (usually linked)
4. Cross-reference Twitter (search "@[name]")
5. Check recent activity (posting = reachable)
6. Add to prospect list

**Tool:** `node scripts/yc-directory-scraper.js` (auto-filters and scores)

**Quality Score:**
- Recent batch + hiring = 9/10
- 10-20 employees = 8/10 (scaling, has budget)
- Active on Twitter = +2 (reachable)
- Posts about sales/growth = +3 (high intent)

---

### 3. Twitter/X Advanced Search

**Queries:**
- `"struggling with cold email" filter:follows>500 -filter:retweets`
- `"outbound not working" bio:founder OR bio:CEO`
- `"how to improve reply rate" min_faves:10`
- `"B2B SaaS" "need more leads" -filter:replies`

**Process:**
1. Run query on X Advanced Search
2. Scan profiles (bio = founder/CEO at B2B SaaS)
3. Check follower count (500-5K = sweet spot)
4. Review recent tweets (revenue signals?)
5. Add to list if qualified
6. Reply to tweet with value (soft intro)
7. Follow up with DM 24h later

**Quality Score:**
- Tweeting about cold email pain = 10/10
- Founder bio + B2B SaaS mention = 8/10
- Engaged with cold email content = 7/10
- Active poster (>2 tweets/week) = +2

---

### 4. LinkedIn Sales Navigator (Manual)

**Filters:**
- Title: Founder, Co-founder, CEO
- Company Headcount: 10-50
- Industry: Software, SaaS, Technology
- Geography: US, UK, Canada (English speakers)
- Posted in last 30 days (active = reachable)

**Process:**
1. Search with filters
2. Read recent posts (looking for growth/sales topics)
3. Check company website (confirm B2B SaaS)
4. Note pain points mentioned
5. Send connection request with note
6. DM after connection (24-48h)

**Quality Score:**
- Posts about sales/growth = 9/10
- Company 10-50 employees = 8/10
- Eng heavy team (need sales help) = +2
- Accepts connection fast = +1 (warm)

---

### 5. Indie Hackers

**Access:** https://www.indiehackers.com/

**Best Sections:**
- Milestones ($X MRR posts)
- "Looking for Feedback"
- "Ask IH" (founder questions)
- Product directory (filter by revenue)

**Process:**
1. Check Milestones page daily
2. Find founders posting "$10K MRR" or higher
3. Read their product (B2B SaaS?)
4. Click profile → find Twitter/LinkedIn
5. Comment on their post (congrats + value add)
6. DM on Twitter 24h later

**Quality Score:**
- Posted milestone >$50K ARR = 10/10
- Asking about growth = 9/10
- Active in comments = 7/10
- Product = B2B = +3

---

## 🎯 Daily Sourcing Workflow

**Morning (30 min):**
1. Check Reddit r/SaaS daily thread → 3 prospects
2. Browse YC directory batch W25 → 3 prospects
3. Indie Hackers milestones → 2 prospects

**Afternoon (30 min):**
4. Twitter search "cold email" filter:today → 3 prospects
5. LinkedIn Sales Navigator (if connected) → 2 prospects

**Evening (20 min):**
6. Review and score all prospects
7. Pick top 10 for outreach
8. Draft personalized DMs
9. Queue for sending tomorrow

**Total:** 13-15 prospects/day = 80-100/week

---

## 🔥 Hot Lead Signals (Prioritize These)

**Urgency indicators:**
- Posted in last 24-48 hours (top of mind)
- Explicitly complaining about cold email
- Asking for tool recommendations
- Mentioned budget/cost concerns
- Posted revenue milestone recently

**Fit indicators:**
- B2B SaaS confirmed
- Team size 5-50 (scaling phase)
- Founder/CEO title
- US/UK/CA/AU location
- Active on social (responds to DMs)

**Qualification questions (research before DM):**
- Do they have a product that needs outbound?
- Are they at scale where cold email makes sense?
- Do they have budget? (funded, revenue, team size)
- Are they reachable? (active on Twitter/LinkedIn)

---

## 📊 Tracking

**Prospect Pipeline:**
```
Sourced → Qualified → Outreach → Response → Demo → Client
  100        50          30         10        3       1
```

**Track in:** `outreach/prospects.jsonl`

**Fields:**
- source (reddit, yc, twitter, linkedin, ih)
- name, company, title
- pain_points (from their own words)
- contact (twitter, linkedin, email if public)
- score (1-10 fit)
- status (sourced, dm_sent, replied, demo_booked, client)
- notes

---

## 🚫 Avoid These (Time Wasters)

- Solo freelancers (no budget)
- B2C companies (wrong product fit)
- Enterprise (too big, long sales cycles)
- Stealth mode (can't verify need)
- Inactive profiles (won't respond)
- Non-English markets (harder to serve initially)

---

## 🔧 Tools Reference

**Reddit Extraction:**
```bash
node scripts/reddit-username-extractor.js https://reddit.com/r/SaaS/comments/...
```

**YC Directory:**
```bash
node scripts/yc-directory-scraper.js
# Output: outreach/yc-prospects.jsonl
```

**Manual Search:**
- Reddit: Use site search with keywords
- Twitter: Advanced search filters
- LinkedIn: Sales Navigator (paid) or manual search
- Indie Hackers: Browse milestones + products

---

## 💡 Pro Tips

1. **Context is king** - Always reference where you found them in DM
2. **Pain > pitch** - Lead with their specific problem
3. **Social proof early** - "Helped X get from 0.2% → 4% reply rate"
4. **Low friction ask** - "Worth testing 500 emails this week?"
5. **Follow up** - 50% of replies come from 2nd+ touch

---

🏛️ **Caesar's Sourcing Principle:**

*"Find where founders complain about cold email. Show up with the solution."*
