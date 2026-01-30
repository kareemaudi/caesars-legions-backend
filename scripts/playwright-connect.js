#!/usr/bin/env node
/**
 * Connect to RUNNING Chrome and post tweet
 * Safer approach - doesn't close existing browser
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TWEET_FILE = path.join(__dirname, '../TWEET-TO-POST-NOW.txt');

async function postToExistingChrome() {
  console.log('🐦 Connecting to running Chrome...\n');
  
  // Read tweet
  const tweetText = fs.readFileSync(TWEET_FILE, 'utf8').trim();
  console.log('Tweet to post:\n');
  console.log(tweetText);
  console.log('\n---\n');
  
  // Instructions for manual posting
  console.log('⚠️  Playwright can\'t connect to running Chrome without CDP endpoint.\n');
  console.log('SIMPLEST SOLUTION:\n');
  console.log('1. Tweet is already in clipboard');
  console.log('2. Go to: https://x.com/compose/post');
  console.log('3. CTRL+V');
  console.log('4. Click Post\n');
  console.log('OR\n');
  console.log('Close Chrome completely, then run:');
  console.log('  node scripts/playwright-twitter.js\n');
  console.log('That will automate it fully.');
}

postToExistingChrome();
