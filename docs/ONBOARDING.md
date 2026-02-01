# Client Onboarding Guide

## Quick Start

### Interactive Onboarding
```bash
node scripts/onboard-client.js
```

This will walk you through:
1. Client information collection
2. Campaign configuration
3. Pricing setup
4. Welcome email generation
5. Checklist creation

### Batch Onboarding
```bash
node scripts/onboard-client.js --data client-data.json
```

Example `client-data.json`:
```json
{
  "companyName": "Acme SaaS Inc",
  "contactName": "John Smith",
  "contactEmail": "john@acme.com",
  "industry": "B2B SaaS",
  "website": "https://acme.com",
  "arr": "$2M",
  "targetMarket": "Series A startups",
  "campaignGoal": "book demos",
  "monthlyEmailTarget": 2000,
  "pricing": {
    "model": "per-meeting",
    "perMeeting": 200,
    "minimumMonthly": 500
  }
}
```

## Onboarding Timeline

### Day 1: Setup
- [ ] Run onboarding script
- [ ] Send welcome email
- [ ] Research client's website & ICP
- [ ] Set up dedicated sending domains
- [ ] Start domain warmup (2-3 weeks)

### Day 2: Content
- [ ] Draft initial email template
- [ ] Create A/B test variants (subject lines)
- [ ] Write follow-up sequences (Day 3, Day 5)
- [ ] Get client approval

### Day 3: Lead Sourcing
- [ ] Build lead list (Apollo.io or manual)
- [ ] Verify emails (NeverBounce or similar)
- [ ] Import to campaign database
- [ ] Score leads (if applicable)

### Day 4: Launch
- [ ] Schedule first batch
- [ ] Set up reply monitoring
- [ ] Configure meeting booking (Calendly integration)
- [ ] Send launch notification to client

### Week 2+: Optimization
- [ ] Analyze first 100 sends
- [ ] A/B test winning variants
- [ ] Adjust targeting based on replies
- [ ] Weekly reports to client

## Pricing Models

### 1. Flat Monthly ($500-2000/mo)
**Best for:** Established clients, predictable volume

```javascript
pricing: {
  model: "flat",
  monthlyFee: 1000
}
```

### 2. Pay-Per-Meeting ($150-300/meeting)
**Best for:** Performance-based, new clients

```javascript
pricing: {
  model: "per-meeting",
  perMeeting: 200,
  minimumMonthly: 500
}
```

### 3. Hybrid ($500 base + $100/meeting)
**Best for:** Balancing risk & reward

```javascript
pricing: {
  model: "hybrid",
  monthlyFee: 500,
  perMeeting: 100
}
```

## Email Infrastructure Setup

### Domain Requirements
- **1-500 emails/day:** 1-2 domains
- **500-1000 emails/day:** 3-5 domains
- **1000-2000 emails/day:** 6-10 domains

Formula: `domains_needed = Math.ceil(daily_emails / 30)`

### Warmup Schedule
| Week | Emails/Day | Status |
|------|-----------|--------|
| 1    | 5-10      | Warming up |
| 2    | 20-30     | Warming up |
| 3    | 40-50     | Ready for limited outreach |
| 4+   | Full volume | Ready |

**Tools:**
- Instantly.ai (warmup + sending)
- Smartlead (alternative)
- Lemlist (alternative)

## Lead Sourcing Checklist

### Apollo.io
1. Define ICP filters (industry, company size, role)
2. Export leads (CSV)
3. Verify emails (85%+ accuracy target)
4. Import to campaign

### Manual Research
1. LinkedIn Sales Navigator search
2. Company websites (team pages)
3. Hunter.io for email finding
4. NeverBounce for verification

### Quality Thresholds
- ✅ **90%+ verified:** Excellent, send immediately
- ⚠️ **70-89% verified:** Good, but monitor bounce rate
- ❌ **<70% verified:** Re-verify before sending

## Campaign Configuration

### Default Settings
```javascript
{
  dailyLimit: 50,           // Emails per day per domain
  followUpDays: [3, 5],     // When to send follow-ups
  maxFollowUps: 2,          // Total follow-up attempts
  pauseOnReply: true,       // Stop sequence if they reply
  trackingEnabled: true     // Track opens/clicks
}
```

### A/B Testing
Test these variables:
- Subject lines (2-3 variants)
- Email body (opener, CTA)
- Send time (9 AM vs 2 PM)
- Follow-up timing (Day 3 vs Day 5)

**Statistical significance:** Need 100+ sends per variant

## Reply Handling

### Categorize Replies
1. **Positive:** "Yes, let's talk" → Book meeting
2. **Neutral:** "Tell me more" → Nurture
3. **Negative:** "Not interested" → Mark as closed
4. **Out of Office:** Re-schedule send
5. **Unsubscribe:** Immediately remove

### Response Time SLA
- **Hot leads (<1 hour):** "Interested in demo"
- **Warm leads (<4 hours):** "Tell me more"
- **Cold leads (<24 hours):** "Not now"

## Performance Benchmarks

### Email Metrics
| Metric | Target | Excellent |
|--------|--------|-----------|
| Delivery Rate | >95% | 98%+ |
| Open Rate | 40-50% | 60%+ |
| Reply Rate | 3-5% | 7%+ |
| Positive Reply | 1-2% | 3%+ |
| Meeting Booked | 0.5-1% | 2%+ |

### Business Metrics
- **Cost per meeting:** <$200 (pay-per-meeting model)
- **Time to first meeting:** <7 days
- **Client satisfaction:** Weekly check-ins

## Troubleshooting

### Low Delivery Rate (<90%)
- ❌ Domain not warmed up
- ❌ Bad email list (high bounce rate)
- ❌ Spam trigger words
- ✅ Fix: Re-warm domains, verify list, clean copy

### Low Open Rate (<30%)
- ❌ Bad subject lines
- ❌ Timing issues
- ❌ Sender reputation
- ✅ Fix: A/B test subjects, try different send times

### Low Reply Rate (<2%)
- ❌ Generic copy
- ❌ Wrong ICP
- ❌ Weak CTA
- ✅ Fix: Personalize more, refine targeting, test different CTAs

### High Unsubscribe Rate (>2%)
- ❌ Sending to wrong audience
- ❌ Too aggressive follow-ups
- ❌ Spammy copy
- ✅ Fix: Refine ICP, reduce follow-up frequency, soften tone

## Client Communication

### Kickoff Email (Day 1)
- Welcome + set expectations
- Timeline overview
- Next steps

### Weekly Report (Every Monday)
- **Emails sent:** X
- **Open rate:** Y%
- **Reply rate:** Z%
- **Meetings booked:** N
- **Top learnings:** Brief insights
- **Next week plan:** Adjustments

### Monthly Review
- Performance vs benchmarks
- Cost per meeting
- ROI analysis
- Strategy adjustments

## Automation Checklist

### Must-Have Automations
- [ ] Daily email sends (cron job)
- [ ] Follow-up scheduling (Day 3, 5)
- [ ] Reply categorization (AI-assisted)
- [ ] Bounce handling (auto-remove)
- [ ] Weekly reports (auto-generate)

### Nice-to-Have
- [ ] Meeting booking (Calendly integration)
- [ ] Slack notifications (new replies)
- [ ] Lead scoring (ML-based)
- [ ] Template optimization (AI suggestions)

## Files Generated

After onboarding, you'll have:
```
data/
├── clients.json                    # All clients
├── campaigns.json                  # All campaigns
├── welcome-email-{clientId}.txt    # Welcome email to send
├── checklist-{clientId}.txt        # Onboarding checklist
└── leads-{campaignId}.json         # Lead database (when added)

memory/
└── onboarding-{date}.jsonl         # Audit log
```

## Next Steps After Onboarding

1. **Send welcome email** (manual for now)
2. **Set up email infrastructure** (domains + warmup)
3. **Research & build lead list** (Apollo or manual)
4. **Draft templates** (initial + 2 follow-ups)
5. **Get client approval** on templates
6. **Import leads** to campaign
7. **Schedule sends** (start small: 20/day)
8. **Monitor & optimize** (daily for first week)

---

**Questions?** Check `caesars-legions-backend/docs/FAQ.md` or message Kareem.

🏛️ **Veni. Vidi. Vici.**
