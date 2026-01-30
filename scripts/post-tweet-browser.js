#!/usr/bin/env node
/**
 * Post tweet using Clawdbot browser automation
 * Uses Chrome extension relay (no cookies needed)
 */

const fs = require('fs');
const path = require('path');

async function postTweetViaBrowser(tweetText) {
  console.log('🐦 Posting tweet via browser automation...\n');
  console.log('Tweet:', tweetText, '\n');
  
  // This would use Clawdbot's browser tool
  // For now, just show instructions
  
  console.log('To post via Clawdbot browser tool:');
  console.log('1. Make sure Chrome extension relay is attached');
  console.log('2. Open x.com in that tab');
  console.log('3. I can automate the compose → type → post flow\n');
  
  console.log('Or via CLI:');
  console.log('clawdbot browser --action open --url "https://x.com/compose/post"');
  console.log('clawdbot browser --action act --request \'{"kind":"type","text":"' + tweetText.replace(/"/g, '\\"') + '"}\'');
  console.log('clawdbot browser --action act --request \'{"kind":"click","ref":"post-button"}\'');
}

const TWEET_FILE = path.join(__dirname, '../TWEET-TO-POST-NOW.txt');
const tweetText = fs.readFileSync(TWEET_FILE, 'utf8').trim();

postTweetViaBrowser(tweetText);
