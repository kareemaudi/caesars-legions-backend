#!/usr/bin/env node
/**
 * HOURLY TWEET POSTER - Autonomous
 * Runs every hour, posts next tweet from queue
 * 
 * Usage: node hourly-poster.js
 * Cron: 0 * * * * node /path/to/hourly-poster.js
 */

const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, '../data/tweets-ready-to-post.json');
const TWEET_FILE = path.join(__dirname, '../TWEET-TO-POST-NOW.txt');
const LOG_FILE = path.join(__dirname, '../autonomous-execution-log.jsonl');

function log(action, status, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    status,
    ...details
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  console.log(`[${entry.timestamp}] ${action}: ${status}`);
}

function getNextTweet() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return null;
  }
  
  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  const nextTweet = queue.tweets.find(t => t.status === 'ready');
  
  return nextTweet;
}

function markPosted(tweetId) {
  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  const tweet = queue.tweets.find(t => t.id === tweetId);
  
  if (tweet) {
    tweet.status = 'posted';
    tweet.postedAt = new Date().toISOString();
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  }
}

async function main() {
  console.log('🏛️ HOURLY TWEET POSTER - Autonomous\n');
  
  const nextTweet = getNextTweet();
  
  if (!nextTweet) {
    console.log('No tweets in queue. Generate more tweets.\n');
    log('hourly_check', 'no_tweets_available');
    return;
  }
  
  console.log(`Next tweet (${nextTweet.id}):\n`);
  console.log(nextTweet.content);
  console.log('\n---\n');
  
  // Write to clipboard file
  fs.writeFileSync(TWEET_FILE, nextTweet.content);
  
  console.log('Tweet ready. Choose posting method:\n');
  console.log('1. Twitter API (if configured):');
  console.log('   node scripts/twitter-api-setup.js post "$(cat TWEET-TO-POST-NOW.txt)"\n');
  console.log('2. Playwright (if Chrome closed):');
  console.log('   node scripts/playwright-twitter.js\n');
  console.log('3. Manual (if Chrome open):');
  console.log('   - Tweet copied to TWEET-TO-POST-NOW.txt');
  console.log('   - Copy to clipboard: Get-Content TWEET-TO-POST-NOW.txt | Set-Clipboard');
  console.log('   - Go to x.com/compose/post');
  console.log('   - Paste & Post\n');
  
  log('tweet_prepared', 'ready', { 
    tweetId: nextTweet.id,
    preview: nextTweet.content.substring(0, 50) + '...'
  });
  
  // For now, mark as pending until we have full automation
  console.log('Once posted, run:');
  console.log(`  node -e "const q=require('./data/tweets-ready-to-post.json'); const t=q.tweets.find(t=>t.id==='${nextTweet.id}'); t.status='posted'; t.postedAt=new Date().toISOString(); require('fs').writeFileSync('./data/tweets-ready-to-post.json', JSON.stringify(q,null,2))"\n`);
}

main();
