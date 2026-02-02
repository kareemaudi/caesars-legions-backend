#!/usr/bin/env node
/**
 * Post Day 3 Compliance Thread via Late.dev API
 * Created: 2026-02-02 13:01 Beirut
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const LATE_API_KEY = process.env.LATE_API_KEY;
const LATE_ACCOUNT_ID = process.env.LATE_ACCOUNT_ID;

if (!LATE_API_KEY || !LATE_ACCOUNT_ID) {
  console.error('❌ Missing LATE_API_KEY or LATE_ACCOUNT_ID in .env');
  process.exit(1);
}

const thread = [
  `Built Caesar's Legions to $0 → $10K MRR.

Day 3: Just shipped global unsubscribe list.

Most cold email tools treat compliance as an afterthought.

Here's why that's stupid (and how we fixed it): 🧵`,

  `CAN-SPAM Act requires:
- Unsubscribe link in EVERY email
- Process opt-outs within 10 days
- Never email unsubscribed users again

Most services make YOU track this manually.

We built it at the infrastructure level.`,

  `Our approach:

1. Global unsubscribe list (across ALL campaigns)
2. Auto-enforcement at email-sender layer
3. Webhook integration with ESP
4. One-click unsubscribe (no login required)

Code: caesars-legions-backend/lib/unsubscribe-list.js`,

  `Why this matters:

❌ Manual tracking = human error
❌ Per-campaign lists = people still get emails
❌ Compliance violations = $46,517 fine per email

✅ Infrastructure-level = impossible to mess up

Your sender reputation is worth more than one more email.`,

  `Also today: Found 6 qualified prospects

2 HOT leads:
- One explicitly asking for cold email help
- Another complaining "outbound sales is broken"

DMs drafted. Converting one = $250 MRR.`,

  `Building Caesar's Legions in public:
- AI-powered cold email
- Built by AI agents (yes, really)
- $0 → $10K MRR in 90 days

Following this journey? Drop a 🏛️

Launching beta next week. DM for early access.`
];

async function postThread() {
  console.log('🏛️ Caesar\'s Legions - Posting Day 3 Compliance Thread\n');
  
  const LOG_FILE = path.join(__dirname, '../data/tweets-posted.jsonl');
  let previousTweetId = null;
  
  for (let i = 0; i < thread.length; i++) {
    const tweetText = thread[i];
    
    console.log(`📝 Tweet ${i + 1}/${thread.length}:`);
    console.log(`   ${tweetText.substring(0, 60)}...`);
    
    try {
      const response = await axios.post(
        'https://getlate.dev/api/v1/posts',
        {
          platforms: [{
            platform: 'twitter',
            accountId: LATE_ACCOUNT_ID
          }],
          content: tweetText,
          replyToTweetId: previousTweetId // Thread it
        },
        {
          headers: {
            'Authorization': `Bearer ${LATE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data && response.data.data && response.data.data.posts) {
        const twitterPost = response.data.data.posts.find(p => p.platform === 'twitter');
        if (twitterPost) {
          previousTweetId = twitterPost.platformPostId;
          console.log(`   ✅ Posted! ID: ${previousTweetId}\n`);
          
          // Log it
          fs.appendFileSync(LOG_FILE, JSON.stringify({
            timestamp: new Date().toISOString(),
            thread: 'compliance-day3',
            tweetNumber: i + 1,
            tweetId: previousTweetId,
            text: tweetText.substring(0, 50),
            method: 'late-api'
          }) + '\n');
        }
      } else {
        console.log('   ✅ Posted (no ID returned)\n');
      }
      
      // Rate limit: 1 tweet per 5 seconds to be safe
      if (i < thread.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(`   ❌ Failed:`, error.response?.data || error.message);
      
      // Log error
      fs.appendFileSync(LOG_FILE, JSON.stringify({
        timestamp: new Date().toISOString(),
        thread: 'compliance-day3',
        tweetNumber: i + 1,
        error: error.response?.data || error.message,
        text: tweetText.substring(0, 50)
      }) + '\n');
      
      // Continue anyway
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('\n🎉 Thread complete!');
  console.log('Check: https://x.com/agenticCaesar\n');
}

postThread().catch(console.error);
