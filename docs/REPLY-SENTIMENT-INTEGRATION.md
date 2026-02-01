# Reply Sentiment Analysis - Integration Guide

Automatically classify prospect replies as positive, question, neutral, or negative.

## Features

✅ **Sentiment Classification**
- Positive (interested, wants to talk)
- Question (needs more info)
- Neutral (acknowledged)
- Out of Office (auto-reply)
- Unsubscribe (wants to stop)
- Negative (not interested)

✅ **Action Recommendations**
- Priority level (high/medium/low/critical)
- Suggested response delay
- Template to use
- Next action

✅ **Confidence Scores**
- 0-100% confidence in classification
- Fallback to rule-based if OpenAI fails

## Quick Start

### 1. Basic Usage

```javascript
const { analyzeReplySentiment } = require('./lib/reply-sentiment');

const replyText = "This sounds interesting! Can we schedule a call?";

const analysis = await analyzeReplySentiment(replyText, {
  original_subject: "Cold email subject",
  original_body: "Your cold email body..."
});

console.log(analysis);
/*
{
  sentiment: 'positive',
  confidence: 85,
  intent: 'Interested in scheduling a call',
  key_phrases: ['sounds interesting', 'schedule a call'],
  action_recommendation: {
    priority: 'high',
    action: 'immediate_response',
    suggested_delay: '2-4 hours',
    template: 'schedule_call'
  }
}
*/
```

### 2. Batch Analysis

```javascript
const { batchAnalyzeReplies } = require('./lib/reply-sentiment');

const replies = [
  { id: 1, text: "Interested!", context: {} },
  { id: 2, text: "Not now", context: {} },
  { id: 3, text: "Tell me more", context: {} }
];

const { results, stats } = await batchAnalyzeReplies(replies, {
  maxConcurrent: 5,  // Process 5 at a time
  delayMs: 1000      // 1s delay between batches
});

console.log(stats);
/*
{
  total: 3,
  positive: 2,
  negative: 1,
  avg_confidence: 78
}
*/
```

### 3. Priority Inbox

```javascript
const { prioritizeReplies } = require('./lib/reply-sentiment');

// Get analyzed replies sorted by priority
const prioritized = prioritizeReplies(results);

// Handle high-priority first
for (const reply of prioritized) {
  if (reply.action_recommendation.priority === 'high') {
    await sendFollowUp(reply);
  }
}
```

## Integration with Webhook Handler

Add sentiment analysis to incoming replies:

```javascript
// lib/webhook-handler.js

const { analyzeReplySentiment } = require('./reply-sentiment');
const db = require('./db');

async function handleIncomingReply(webhookData) {
  const { email, reply_text, campaign_id } = webhookData;
  
  // Analyze sentiment
  const analysis = await analyzeReplySentiment(reply_text, {
    original_subject: webhookData.original_subject,
    original_body: webhookData.original_body
  });
  
  // Save to database
  db.insertReply({
    campaign_id,
    email,
    reply_text,
    sentiment: analysis.sentiment,
    confidence: analysis.confidence,
    intent: analysis.intent,
    priority: analysis.action_recommendation.priority,
    analyzed_at: new Date().toISOString()
  });
  
  // Auto-actions
  if (analysis.sentiment === 'unsubscribe') {
    await db.unsubscribeEmail(email);
    console.log(`✅ Auto-unsubscribed: ${email}`);
  }
  
  if (analysis.action_recommendation.priority === 'high') {
    await notifyClient({
      title: 'High Priority Reply',
      email,
      preview: reply_text.substring(0, 100),
      action: analysis.action_recommendation.action
    });
  }
  
  return analysis;
}
```

## Dashboard Integration

Show sentiment breakdown in client dashboard:

```javascript
function getCampaignStats(campaignId) {
  const replies = db.getRepliesByCampaign(campaignId);
  
  return {
    total_replies: replies.length,
    positive: replies.filter(r => r.sentiment === 'positive').length,
    questions: replies.filter(r => r.sentiment === 'question').length,
    neutral: replies.filter(r => r.sentiment === 'neutral').length,
    negative: replies.filter(r => r.sentiment === 'negative').length,
    unsubscribes: replies.filter(r => r.sentiment === 'unsubscribe').length,
    avg_confidence: Math.round(
      replies.reduce((sum, r) => sum + r.confidence, 0) / replies.length
    ),
    // Engagement rate = (positive + question) / total
    engagement_rate: Math.round(
      (replies.filter(r => ['positive', 'question'].includes(r.sentiment)).length / replies.length) * 100
    )
  };
}
```

## Automated Follow-ups

Integrate with follow-up system:

```javascript
// Check for positive replies daily
const { analyzeReplySentiment } = require('./lib/reply-sentiment');
const { sendFollowUpEmail } = require('./lib/follow-ups');

async function processHighPriorityReplies() {
  const unprocessedReplies = db.getUnprocessedReplies();
  
  for (const reply of unprocessedReplies) {
    const analysis = await analyzeReplySentiment(reply.text);
    
    if (analysis.sentiment === 'positive') {
      // Send booking link immediately
      await sendFollowUpEmail({
        to: reply.email,
        template: 'schedule_call',
        delay: '2 hours'
      });
    }
    
    if (analysis.sentiment === 'question') {
      // Answer question and offer call
      await sendFollowUpEmail({
        to: reply.email,
        template: 'answer_and_offer_call',
        delay: '4 hours'
      });
    }
    
    // Mark as processed
    db.markReplyProcessed(reply.id);
  }
}

// Run every 4 hours
setInterval(processHighPriorityReplies, 4 * 60 * 60 * 1000);
```

## Testing

Run the test script:

```bash
cd caesars-legions-backend
node scripts/test-reply-sentiment.js
```

Output shows:
- Individual reply analysis
- Batch processing stats
- Priority inbox sorting
- Engagement metrics

## Database Schema

Add sentiment fields to replies table:

```sql
ALTER TABLE replies ADD COLUMN sentiment TEXT;
ALTER TABLE replies ADD COLUMN confidence INTEGER;
ALTER TABLE replies ADD COLUMN intent TEXT;
ALTER TABLE replies ADD COLUMN priority TEXT;
ALTER TABLE replies ADD COLUMN analyzed_at TIMESTAMP;
```

## Rate Limits

OpenAI rate limits apply:
- Free tier: 3 RPM (requests per minute)
- Paid tier: 60+ RPM

Use batch processing with delays:
```javascript
await batchAnalyzeReplies(replies, {
  maxConcurrent: 3,  // 3 concurrent requests
  delayMs: 1000      // 1s between batches
});
```

## Fallback

If OpenAI fails, uses rule-based classification:
- Keywords: "interested", "yes", "schedule" → positive
- Keywords: "unsubscribe", "remove me" → unsubscribe
- Contains "?" → question
- Keywords: "not interested", "no thanks" → negative

Confidence is lower (50-70%) but prevents total failure.

## Cost

GPT-4 Turbo pricing:
- ~$0.01 per reply analyzed (500 tokens avg)
- 100 replies = $1
- 1000 replies/month = $10

Worth it for:
- Auto-prioritization
- Better response times
- Higher close rates

## Metrics to Track

**Sentiment Distribution:**
- What % of replies are positive?
- Are we getting too many unsubscribes? (>2% is high)

**Confidence Scores:**
- Low confidence (<50%) = review manually
- High confidence (>80%) = trust the classification

**Engagement Rate:**
- (Positive + Question) / Total Replies
- Target: >15% for cold email

**Response Time:**
- How fast do we respond to high-priority?
- Target: <4 hours for positive replies

## Next Steps

1. ✅ Built sentiment analysis system
2. ⏳ Integrate with webhook handler
3. ⏳ Add to client dashboard
4. ⏳ Auto-trigger follow-ups based on sentiment
5. ⏳ A/B test response templates by sentiment type

---

**Impact:** Turn every reply into actionable intelligence. Know exactly who to prioritize and what to say.
