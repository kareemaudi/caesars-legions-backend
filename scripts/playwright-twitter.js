#!/usr/bin/env node
/**
 * PLAYWRIGHT TWITTER AUTOMATION
 * Posts tweets using existing Chrome session (already logged in)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const CHROME_USER_DATA = process.env.CHROME_USER_DATA || 'C:\\Users\\Asus\\AppData\\Local\\Google\\Chrome\\User Data';
const TWEET_FILE = path.join(__dirname, '../TWEET-TO-POST-NOW.txt');
const LOG_FILE = path.join(__dirname, '../data/tweets-posted.jsonl');

async function postTweet(tweetText) {
  console.log('🐦 PLAYWRIGHT - Autonomous Twitter Posting\n');
  
  let browser;
  try {
    // Launch Chrome with existing profile (already logged in)
    console.log('Launching Chrome with your profile...');
    browser = await chromium.launchPersistentContext(CHROME_USER_DATA, {
      headless: false, // Show browser for verification
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled']
    });
    
    const page = await browser.newPage();
    
    // Go to X compose
    console.log('Navigating to X compose...');
    await page.goto('https://x.com/compose/post');
    
    // Wait for compose box
    console.log('Waiting for compose box...');
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    
    // Type tweet
    console.log('Typing tweet...\n');
    console.log(tweetText);
    console.log('\n---\n');
    await page.fill('[data-testid="tweetTextarea_0"]', tweetText);
    
    // Wait a moment
    await page.waitForTimeout(2000);
    
    // Click post button
    console.log('Clicking Post button...');
    await page.click('[data-testid="tweetButton"]');
    
    // Wait for success
    await page.waitForTimeout(3000);
    
    console.log('✅ TWEET POSTED SUCCESSFULLY!\n');
    
    // Log
    fs.appendFileSync(LOG_FILE, JSON.stringify({
      timestamp: new Date().toISOString(),
      text: tweetText.substring(0, 50) + '...',
      method: 'playwright',
      status: 'posted'
    }) + '\n');
    
    return true;
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    return false;
    
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function main() {
  // Read tweet to post
  if (!fs.existsSync(TWEET_FILE)) {
    console.error('No tweet file found:', TWEET_FILE);
    process.exit(1);
  }
  
  const tweetText = fs.readFileSync(TWEET_FILE, 'utf8').trim();
  
  if (!tweetText) {
    console.error('Tweet file is empty');
    process.exit(1);
  }
  
  await postTweet(tweetText);
}

if (require.main === module) {
  main();
}

module.exports = { postTweet };
