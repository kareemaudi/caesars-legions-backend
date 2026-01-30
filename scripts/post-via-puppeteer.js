#!/usr/bin/env node
/**
 * Post tweet via Puppeteer (browser automation)
 * Uses actual browser UI to bypass API rate limits
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TWEET_FILE = path.join(__dirname, '../TWEET-TO-POST-NOW.txt');
const COOKIES_FILE = path.join(__dirname, '../twitter-cookies.json');

async function postTweet() {
  console.log('🐦 Posting tweet via browser automation...\n');
  
  const tweetText = fs.readFileSync(TWEET_FILE, 'utf8').trim();
  console.log('Tweet:', tweetText, '\n');
  
  let browser;
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    
    const page = await browser.newPage();
    
    // Set cookies if available
    if (fs.existsSync(COOKIES_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
      await page.setCookie(...cookies);
    }
    
    // Go to Twitter compose
    await page.goto('https://x.com/compose/post', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('Waiting for compose box...');
    
    // Wait for the tweet textarea
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 15000 });
    
    console.log('Typing tweet...');
    
    // Type the tweet
    await page.type('[data-testid="tweetTextarea_0"]', tweetText, { delay: 50 });
    
    // Wait a moment
    await page.waitForTimeout(2000);
    
    console.log('Clicking Post button...');
    
    // Click post button
    await page.click('[data-testid="tweetButton"]');
    
    // Wait for success
    await page.waitForTimeout(5000);
    
    console.log('✅ TWEET POSTED via browser!\n');
    
    // Save cookies for next time
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    
    return true;
    
  } catch (error) {
    console.error('❌ Browser automation failed:', error.message);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

postTweet().then(success => {
  process.exit(success ? 0 : 1);
});
