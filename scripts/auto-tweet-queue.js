#!/usr/bin/env node

/**
 * Auto Tweet Queue - Posts tweets from queue at scheduled times
 * 
 * Usage:
 *   node auto-tweet-queue.js           # Post next pending tweet
 *   node auto-tweet-queue.js --dry-run # Show what would be posted
 *   node auto-tweet-queue.js --day 1   # Post specific day's tweets
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const QUEUE_FILE = path.join(__dirname, '../data/tweet-queue-week1.json');
const LOG_FILE = path.join(__dirname, '../data/tweet-log.jsonl');
const LATE_API_KEY = process.env.LATE_API_KEY;
const LATE_ACCOUNT_ID = process.env.LATE_ACCOUNT_ID;

async function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) {
    console.error('❌ Tweet queue not found:', QUEUE_FILE);
    process.exit(1);
  }
  
  const data = fs.readFileSync(QUEUE_FILE, 'utf8');
  return JSON.parse(data);
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function logTweet(tweet, response) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    day: tweet.day,
    type: tweet.type,
    tweet: tweet.tweet.substring(0, 50) + '...',
    success: !!response,
    response: response ? { id: response.id } : null
  };
  
  fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
}

async function postTweet(text) {
  if (!LATE_API_KEY || !LATE_ACCOUNT_ID) {
    throw new Error('Missing LATE_API_KEY or LATE_ACCOUNT_ID in .env');
  }
  
  try {
    const response = await axios.post(
      'https://api.late.dev/v1/posts',
      {
        accountId: LATE_ACCOUNT_ID,
        text: text,
        platforms: ['twitter']
      },
      {
        headers: {
          'Authorization': `Bearer ${LATE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('❌ Error posting tweet:', error.response?.data || error.message);
    throw error;
  }
}

function getCurrentDayOfMission() {
  // Caesar launched on 2026-01-30
  const launchDate = new Date('2026-01-30T00:00:00+02:00');
  const now = new Date();
  const diffTime = Math.abs(now - launchDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getCurrentHour() {
  return new Date().getHours();
}

async function postNextTweet(dryRun = false, specificDay = null) {
  const queue = await loadQueue();
  const currentDay = specificDay || getCurrentDayOfMission();
  const currentHour = getCurrentHour();
  
  console.log(`📅 Current mission day: ${currentDay}`);
  console.log(`⏰ Current hour: ${currentHour}:00`);
  
  // Find next pending tweet for current day
  let nextTweet = null;
  
  if (specificDay) {
    // Post all tweets for specific day
    nextTweet = queue.find(t => t.day === specificDay && t.status === 'pending');
  } else {
    // Find next tweet for current day and time
    nextTweet = queue.find(t => {
      if (t.status !== 'pending') return false;
      if (t.day !== currentDay) return false;
      
      const tweetHour = parseInt(t.time.split(':')[0]);
      return tweetHour <= currentHour;
    });
  }
  
  if (!nextTweet) {
    console.log('✅ No pending tweets for current time');
    console.log('\nUpcoming tweets:');
    queue
      .filter(t => t.status === 'pending')
      .slice(0, 3)
      .forEach(t => {
        console.log(`  Day ${t.day} ${t.time}: ${t.tweet.substring(0, 50)}...`);
      });
    return;
  }
  
  console.log('\n📝 Next tweet to post:');
  console.log(`   Day: ${nextTweet.day}`);
  console.log(`   Time: ${nextTweet.time}`);
  console.log(`   Type: ${nextTweet.type}`);
  console.log(`\n${nextTweet.tweet}\n`);
  
  if (dryRun) {
    console.log('🔍 Dry run - would post above tweet');
    return;
  }
  
  try {
    console.log('📤 Posting to X via Late.dev...');
    const response = await postTweet(nextTweet.tweet);
    
    console.log('✅ Tweet posted successfully!');
    console.log(`   Tweet ID: ${response.id || 'unknown'}`);
    
    // Mark as posted
    nextTweet.status = 'posted';
    nextTweet.postedAt = new Date().toISOString();
    nextTweet.responseId = response.id;
    
    saveQueue(queue);
    logTweet(nextTweet, response);
    
  } catch (error) {
    console.error('❌ Failed to post tweet');
    
    // Mark as failed
    nextTweet.status = 'failed';
    nextTweet.failedAt = new Date().toISOString();
    nextTweet.error = error.message;
    
    saveQueue(queue);
    logTweet(nextTweet, null);
    
    process.exit(1);
  }
}

async function showStats() {
  const queue = await loadQueue();
  
  const stats = {
    total: queue.length,
    pending: queue.filter(t => t.status === 'pending').length,
    posted: queue.filter(t => t.status === 'posted').length,
    failed: queue.filter(t => t.status === 'failed').length
  };
  
  console.log('\n📊 Tweet Queue Stats:');
  console.log(`   Total: ${stats.total}`);
  console.log(`   Pending: ${stats.pending}`);
  console.log(`   Posted: ${stats.posted}`);
  console.log(`   Failed: ${stats.failed}`);
  
  const byDay = {};
  queue.forEach(t => {
    byDay[t.day] = byDay[t.day] || { pending: 0, posted: 0 };
    if (t.status === 'pending') byDay[t.day].pending++;
    if (t.status === 'posted') byDay[t.day].posted++;
  });
  
  console.log('\n📅 By Day:');
  Object.keys(byDay).sort().forEach(day => {
    console.log(`   Day ${day}: ${byDay[day].posted} posted, ${byDay[day].pending} pending`);
  });
}

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const statsMode = args.includes('--stats');
const dayIndex = args.indexOf('--day');
const specificDay = dayIndex >= 0 ? parseInt(args[dayIndex + 1]) : null;

// Run
(async () => {
  if (statsMode) {
    await showStats();
  } else {
    await postNextTweet(dryRun, specificDay);
  }
})();
