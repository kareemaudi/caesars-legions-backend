#!/usr/bin/env node
/**
 * TWITTER API INTEGRATION - Full Autonomous Posting
 * 
 * Setup: Get keys from https://developer.x.com/en/portal/dashboard
 * Add to .env:
 *   TWITTER_API_KEY=your_key
 *   TWITTER_API_SECRET=your_secret
 *   TWITTER_ACCESS_TOKEN=your_token
 *   TWITTER_ACCESS_SECRET=your_token_secret
 */

const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Initialize Twitter client
function getTwitterClient() {
  if (!process.env.TWITTER_API_KEY) {
    throw new Error('Twitter API not configured. See caesars-legions-backend/TWITTER-API-SETUP.md');
  }
  
  return new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });
}

// Post tweet
async function postTweet(text) {
  const client = getTwitterClient();
  
  try {
    const tweet = await client.v2.tweet(text);
    console.log('✅ Tweet posted!');
    console.log('   ID:', tweet.data.id);
    console.log('   URL:', `https://x.com/agenticCaesar/status/${tweet.data.id}`);
    
    // Log
    fs.appendFileSync(
      path.join(__dirname, '../data/tweets-posted.jsonl'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        tweetId: tweet.data.id,
        text: text.substring(0, 50) + '...',
        status: 'posted'
      }) + '\n'
    );
    
    return tweet.data.id;
    
  } catch (error) {
    console.error('❌ Failed to post:', error.message);
    throw error;
  }
}

// Post from queue
async function postFromQueue() {
  const queueFile = path.join(__dirname, '../data/tweets-ready-to-post.json');
  
  if (!fs.existsSync(queueFile)) {
    console.log('No tweets in queue');
    return;
  }
  
  const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
  const nextTweet = queue.tweets.find(t => t.status === 'ready');
  
  if (!nextTweet) {
    console.log('No ready tweets in queue');
    return;
  }
  
  console.log('Posting next tweet from queue...\n');
  console.log(nextTweet.content);
  console.log('\n---\n');
  
  await postTweet(nextTweet.content);
  
  // Mark as posted
  nextTweet.status = 'posted';
  nextTweet.postedAt = new Date().toISOString();
  fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
}

// Main
async function main() {
  const action = process.argv[2] || 'queue';
  const text = process.argv.slice(3).join(' ');
  
  console.log('🐦 TWITTER API - AUTONOMOUS POSTING\n');
  
  try {
    if (action === 'test') {
      await postTweet('🏛️ Caesar\'s autonomous posting system is LIVE. Building in public starts now.');
      
    } else if (action === 'post' && text) {
      await postTweet(text);
      
    } else if (action === 'queue') {
      await postFromQueue();
      
    } else {
      console.log('Usage:');
      console.log('  node twitter-api-setup.js test          # Test post');
      console.log('  node twitter-api-setup.js post <text>   # Post specific text');
      console.log('  node twitter-api-setup.js queue         # Post next from queue');
    }
    
  } catch (error) {
    if (error.message.includes('not configured')) {
      console.log('\n⚠️  Twitter API not set up yet.');
      console.log('See: caesars-legions-backend/TWITTER-API-SETUP.md\n');
    } else {
      console.error('\n❌ Error:', error.message, '\n');
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { postTweet, postFromQueue };
