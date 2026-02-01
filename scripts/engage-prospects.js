#!/usr/bin/env node
/**
 * Engage with prospects via Late.dev API (tweet replies)
 */

require('dotenv').config();
const axios = require('axios');

const LATE_API_KEY = process.env.LATE_API_KEY;
const LATE_ACCOUNT_ID = process.env.LATE_ACCOUNT_ID;

const engagements = [
  {
    content: `@otarurichman This is why we're building Caesar's Legions with unified tracking from email → demo → close.

Most cold email tools give you "sent" and "opened" metrics. But which email led to your $80K deal? No idea.

Attribution isn't sexy, but it's the difference between guessing and knowing what works.`,
    note: 'Reply to Otaru about attribution pain'
  },
  {
    content: `@Adamweill1 "Outbound beats content at the start" - 100% this.

The problem: most founders spend 3+ weeks setting up cold email infrastructure and quit before hitting scale.

Caesar's Legions removes that friction: 48hr setup, AI personalization, pay per meeting.

If your SaaS is quiet, cold email creates conversations in days, not months.`,
    note: 'Reply to Adam about outbound strategy'
  }
];

async function postEngagements() {
  console.log('🎯 Engaging with prospects via Late.dev\n');
  
  for (const engagement of engagements) {
    console.log(`📝 ${engagement.note}`);
    console.log(`   Content: ${engagement.content.substring(0, 60)}...\n`);
    
    try {
      await axios.post(
        'https://getlate.dev/api/v1/posts',
        {
          platforms: [{
            platform: 'twitter',
            accountId: LATE_ACCOUNT_ID
          }],
          content: engagement.content
        },
        {
          headers: {
            'Authorization': `Bearer ${LATE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('   ✅ Posted!\n');
      
      // Rate limit: 10 seconds between posts
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error) {
      console.error('   ❌ Failed:', error.response?.data || error.message);
    }
  }
  
  console.log('\n✅ Engagement campaign complete!');
}

postEngagements().catch(console.error);
