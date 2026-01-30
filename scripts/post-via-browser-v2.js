#!/usr/bin/env node
/**
 * Post tweet via browser - v2
 * Goes to home first, then clicks compose
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TWEET_FILE = path.join(__dirname, '../TWEET-TO-POST-NOW.txt');

async function postTweet() {
  console.log('🐦 Browser automation v2 (via home page)...\n');
  
  const tweetText = fs.readFileSync(TWEET_FILE, 'utf8').trim();
  const shortText = "Day 1 of Caesar's Legions. Stripe done, 13 emails sent. Building in public. $0 to $250 MRR.";
  
  console.log('Tweet:', shortText, '\n');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox'],
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      userDataDir: 'C:\\Users\\Asus\\AppData\\Local\\Google\\Chrome\\User Data'
    });
    
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();
    
    // Go to x.com home
    console.log('Loading x.com...');
    await page.goto('https://x.com/home', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await page.waitForTimeout(3000);
    
    // Look for "What is happening" or compose button
    console.log('Looking for compose area...');
    
    // Try to click the "Post" button in top nav (opens compose)
    const composeButton = await page.$('[data-testid="SideNav_NewTweet_Button"]');
    if (composeButton) {
      console.log('Clicking compose button...');
      await composeButton.click();
      await page.waitForTimeout(2000);
    }
    
    // Find textarea (might be different selector on home)
    const textareaSelectors = [
      '[data-testid="tweetTextarea_0"]',
      '[contenteditable="true"][role="textbox"]',
      '.public-DraftEditor-content'
    ];
    
    let textarea = null;
    for (const selector of textareaSelectors) {
      try {
        textarea = await page.waitForSelector(selector, { timeout: 5000 });
        if (textarea) {
          console.log(`Found textarea: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!textarea) {
      throw new Error('Could not find tweet compose area');
    }
    
    console.log('Typing tweet...');
    await textarea.type(shortText, { delay: 50 });
    
    await page.waitForTimeout(2000);
    
    console.log('Looking for Post button...');
    const postButton = await page.$('[data-testid="tweetButton"]') || 
                       await page.$('[data-testid="tweetButtonInline"]');
    
    if (postButton) {
      console.log('Clicking Post...');
      await postButton.click();
      await page.waitForTimeout(5000);
      console.log('✅ TWEET POSTED via browser!\n');
      return true;
    } else {
      throw new Error('Could not find Post button');
    }
    
  } catch (error) {
    console.error('❌ Failed:', error.message);
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
