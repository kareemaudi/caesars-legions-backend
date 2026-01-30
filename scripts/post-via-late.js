#!/usr/bin/env node
/**
 * Post tweet via Late.dev API
 * WORKS - bypasses Twitter Error 226
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TWEET_FILE = path.join(__dirname, '../TWEET-TO-POST-NOW.txt');

async function postTweet() {
  console.log('🚀 Posting via Late.dev API...\n');
  
  // Check for API key
  if (!process.env.LATE_API_KEY) {
    console.error('❌ LATE_API_KEY not found in .env');
    console.error('Sign up at: https://getlate.dev');
    console.error('Then add to .env: LATE_API_KEY=your_key_here');
    process.exit(1);
  }
  
  if (!process.env.LATE_ACCOUNT_ID) {
    console.error('❌ LATE_ACCOUNT_ID not found in .env');
    console.error('After connecting X account via Late, add: LATE_ACCOUNT_ID=your_account_id');
    process.exit(1);
  }
  
  const tweetText = fs.readFileSync(TWEET_FILE, 'utf8').trim();
  console.log('Tweet:', tweetText, '\n');
  
  try {
    const response = await fetch('https://getlate.dev/api/v1/posts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        platforms: [{
          platform: 'twitter',
          accountId: process.env.LATE_ACCOUNT_ID
        }],
        content: tweetText,
        // scheduledFor: null  // Post immediately (or set future timestamp)
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${JSON.stringify(result)}`);
    }
    
    console.log('✅ TWEET POSTED via Late.dev!');
    console.log('Post ID:', result.id);
    console.log('Status:', result.status);
    console.log('\nResponse:', JSON.stringify(result, null, 2));
    
    // Log success
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: 'late.dev',
      status: 'success',
      postId: result.id,
      text: tweetText.substring(0, 50) + '...'
    };
    
    const logFile = path.join(__dirname, '../data/tweets-posted.jsonl');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to post:', error.message);
    
    // Log failure
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: 'late.dev',
      status: 'failed',
      error: error.message
    };
    
    const logFile = path.join(__dirname, '../data/tweets-posted.jsonl');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    
    return false;
  }
}

if (require.main === module) {
  postTweet().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { postTweet };
