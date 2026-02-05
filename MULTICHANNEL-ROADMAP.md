# Caesar's Legions - Multi-Channel Outbound Roadmap

## Pivot Summary
**From:** Cold email agency
**To:** Multi-channel outbound agency (Email + LinkedIn + Twitter + Reddit)

---

## Phase 1: Email Foundation (CURRENT)

### Done ✅
- [x] Email generation (OpenAI)
- [x] SMTP sending (Zoho - but rate limited)
- [x] Campaign templates
- [x] Psychology-optimized copy

### Needed 🔧
- [ ] Email verification (Hunter.io API)
- [ ] Better SMTP (Mailgun)
- [ ] Bounce handling
- [ ] Reply detection

---

## Phase 2: Multi-Channel Infrastructure

### LinkedIn Module
```
lib/linkedin-outreach.js
- Connection request automation
- Message sequences
- Profile viewing
- InMail support (premium)
```

**Requires:**
- LinkedIn account access
- Expandi/Dripify OR browser automation
- Rate limiting (100 actions/day max)

### Twitter/X Module
```
lib/twitter-outreach.js
- DM automation
- Engagement (likes, replies, quotes)
- Thread posting
- Follower engagement
```

**Requires:**
- @agenticCaesar API keys
- Rate limiting per Twitter rules

### Reddit Module
```
lib/reddit-outreach.js
- Comment automation
- DM sequences
- Subreddit monitoring
- Karma management
```

**Requires:**
- Reddit account + API credentials
- Karma building strategy

---

## Phase 3: Orchestration Layer

### Sequence Engine
```
lib/sequence-engine.js
- Multi-channel sequences
- Day 1: LinkedIn connect
- Day 2: Email if no accept
- Day 4: Twitter engage
- Day 6: Follow-up email
- Unified tracking
```

### Prospect Manager
```
lib/prospect-manager.js
- Unified prospect record
- Channel status per prospect
- Response tracking across channels
- Conversion attribution
```

---

## Phase 4: Client Dashboard

### Features Needed
- Real-time campaign metrics
- Per-channel breakdown
- Response notifications
- Meeting scheduler integration
- Invoice/payment history

---

## API Structure

```
POST /api/campaigns
  - Create multi-channel campaign
  
POST /api/prospects
  - Add prospect with all channels
  
POST /api/sequences
  - Define multi-channel sequence
  
GET /api/metrics
  - Unified metrics dashboard
  
POST /api/send/:channel
  - Send on specific channel
```

---

## Database Schema Updates

```sql
-- Prospects table
ALTER TABLE prospects ADD COLUMN linkedin_url TEXT;
ALTER TABLE prospects ADD COLUMN twitter_handle TEXT;
ALTER TABLE prospects ADD COLUMN reddit_username TEXT;

-- Touches table (track all outreach)
CREATE TABLE touches (
  id SERIAL PRIMARY KEY,
  prospect_id INTEGER REFERENCES prospects(id),
  channel VARCHAR(20), -- 'email', 'linkedin', 'twitter', 'reddit'
  type VARCHAR(50), -- 'connection_request', 'dm', 'email', 'comment'
  content TEXT,
  sent_at TIMESTAMP,
  status VARCHAR(20), -- 'sent', 'delivered', 'opened', 'replied'
  response TEXT
);

-- Sequences table
CREATE TABLE sequences (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER,
  step_number INTEGER,
  channel VARCHAR(20),
  delay_days INTEGER,
  template_id INTEGER,
  condition VARCHAR(100) -- 'if_no_response', 'if_connected', etc.
);
```

---

## Pricing Update

### Current
- $497/mo - Cold email only

### New (Multi-Channel)
- $497/mo - Email + 1 channel (LinkedIn OR Twitter)
- $797/mo - All channels (Email + LinkedIn + Twitter + Reddit)
- $1,497/mo - All channels + strategy calls

---

## Implementation Priority

1. **Week 1:** Fix email (Hunter + Mailgun)
2. **Week 2:** Add LinkedIn module
3. **Week 3:** Add Twitter module
4. **Week 4:** Orchestration + dashboard

---

*Created: 2026-02-05*
*Status: Planning*
