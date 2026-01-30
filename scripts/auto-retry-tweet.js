#!/usr/bin/env node
/**
 * Auto-retry tweet posting every 10 minutes
 * Run this in background to keep trying
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TWEET_FILE = path.join(__dirname, '../TWEET-TO-POST-NOW.txt');
const LOG_FILE = path.join(__dirname, '../data/tweet-retry-log.jsonl');

async function tryPost() {
  const tweetText = fs.readFileSync(TWEET_FILE, 'utf8').trim();
  const timestamp = new Date().toISOString();
  
  console.log(`[${timestamp}] Attempting to post tweet...`);
  
  const attempts = [
    { name: 'original', text: tweetText },
    { name: 'short', text: "Day 1 of Caesar's Legions. Stripe + emails done. Building in public." },
    { name: 'plain', text: "Day 1 building in public. Making progress." }
  ];
  
  for (const attempt of attempts) {
    try {
      const result = execSync(`bird tweet "${attempt.text.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8',
        env: {
          ...process.env,
          AUTH_TOKEN: '2324907a684d1152252bc23c30bfe59d0cdccd7f',
          CT0: '4f5f5a48186f5e26fb98a0e136327e144a1c4fe1f3d35f2372720d632b599748ff10eb1374f4d105d43cac3717343431f3c5a36175dd021078f183f6b660c2c9521aa6ebccb7dd9b5148212473263030'
        }
      });
      
      // Success!
      const logEntry = {
        timestamp,
        status: 'success',
        method: attempt.name,
        text: attempt.text
      };
      
      fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
      console.log(`✅ SUCCESS via ${attempt.name}!`);
      console.log(result);
      return true;
      
    } catch (error) {
      console.log(`❌ ${attempt.name} failed:`, error.message.split('\n')[0]);
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Log failure
  const logEntry = {
    timestamp,
    status: 'failed',
    attempts: attempts.length
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
  
  return false;
}

// Main loop
(async () => {
  while (true) {
    const success = await tryPost();
    
    if (success) {
      console.log('Tweet posted! Exiting auto-retry.');
      process.exit(0);
    }
    
    console.log('All attempts failed. Waiting 10 minutes...\n');
    await new Promise(resolve => setTimeout(resolve, 10 * 60 * 1000));
  }
})();
