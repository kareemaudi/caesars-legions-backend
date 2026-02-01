#!/usr/bin/env node
/**
 * Post X thread via Late.dev API
 * Usage: node scripts/post-thread-late.js
 */

require('dotenv').config();
const axios = require('axios');

const LATE_API_KEY = process.env.LATE_API_KEY;
const LATE_ACCOUNT_ID = process.env.LATE_ACCOUNT_ID;

if (!LATE_API_KEY || !LATE_ACCOUNT_ID) {
  console.error('❌ Missing LATE_API_KEY or LATE_ACCOUNT_ID in .env');
  process.exit(1);
}

const thread = [
  `You paid $500 for a cold email campaign.

The freelancer wrote "world-class copy."

You sent 1,000 emails.

Zero replies.

You thought cold email was dead.

It's not. Here's what actually happened 🧵`,

  `The problem wasn't your copy.

It was your infrastructure.

In 2020, you could blast from your main domain and book meetings.

In 2026, that's the fastest way to get blacklisted by Gmail.

Cold email became an engineering problem.`,

  `Here's what kills your campaigns:

1️⃣ Single domain (destroys sender reputation)
2️⃣ No warm-up (Gmail flags you as spam)
3️⃣ Missing DNS setup (SPF, DKIM, DMARC)
4️⃣ High bounce rate (>0.5% = death)
5️⃣ Static lists (looks like spam)

Fix these first.`,

  `❌ Old way: Send from yourcompany.com
✅ New way: Domain fleet (5-10 "burner" domains)

Why?

If your main domain gets flagged, your team's internal emails stop landing too.

Protect the mothership. Use getcompany.io, trycompany.co, etc.`,

  `Each domain needs 2 inboxes.

Max 30-50 emails per day per inbox.

Math: 10 domains × 2 inboxes × 50/day = 1,000 emails/day

But you can't start tomorrow.

You need a 21-day warm-up period.

(Gmail builds trust slowly)`,

  `The Technical Trifecta:

• SPF (who can send)
• DKIM (signature verification)
• DMARC (policy enforcement)

No DNS setup = no digital passport.

You're showing up to international borders without ID.

You're not getting in.`,

  `Static lists are for 2022.

"CTOs in Austin" = organized spam.

Winners use triggers:
• Just hired VP of Sales
• Just raised Series A
• Just switched tech stack

Timing > targeting.

(Use Clay or Apollo for this)`,

  `Every bounce hurts.

If 5 out of 1,000 emails bounce (0.5%), your reputation bleeds.

Use MillionVerifier or ZeroBounce.

Scrub your lists before sending.

Prevention > damage control.`,

  `The real cost breakdown:

❌ "$500 copywriting package" = wasted
✅ Proper infrastructure:
   • 10 domains: $120/mo
   • 20 Google Workspace seats: $200/mo
   • Email verification: $50/mo
   • Warm-up service: $100/mo

Total: ~$500/mo (just for infrastructure)`,

  `That's why most founders fail at cold email.

It's no longer a marketing play.

It's a DevOps problem.

You need:
• Domain fleet management
• DNS configuration
• Bounce rate monitoring
• Trigger-based targeting
• Multi-week warm-ups

Or... outsource it.`,

  `We built Caesar's Legions to solve this.

Pay per meeting booked ($50 each).
Zero infrastructure costs.
21-day warm-up starts immediately.

If you're a B2B SaaS founder tired of burning domains, DM me "CAESAR"

First 5 get a free pilot (50 emails).`
];

async function postThread() {
  console.log('🏛️ Caesar\'s Legions - Posting X Thread\n');
  
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
      
      // Continue anyway (some might succeed)
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('\n🎉 Thread complete!');
  console.log('Check: https://x.com/agenticCaesar\n');
}

postThread().catch(console.error);
