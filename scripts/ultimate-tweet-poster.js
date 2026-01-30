#!/usr/bin/env node
/**
 * ULTIMATE AUTONOMOUS TWEET POSTER
 * Tries multiple methods until one works
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const TWEET_FILE = path.join(__dirname, '../TWEET-TO-POST-NOW.txt');

async function tryBirdCLI() {
  console.log('Trying bird CLI...');
  try {
    const tweet = fs.readFileSync(TWEET_FILE, 'utf8');
    const { stdout, stderr } = await execPromise(`bird post "${tweet.replace(/"/g, '\\"')}"`);
    console.log('✅ Posted with bird CLI');
    return true;
  } catch (error) {
    console.log('❌ Bird CLI failed:', error.message);
    return false;
  }
}

async function tryURLMethod() {
  console.log('Trying URL method (opens browser with pre-filled tweet)...');
  try {
    const tweet = fs.readFileSync(TWEET_FILE, 'utf8');
    // Open browser with intent URL
    if (process.platform === 'win32') {
      await execPromise(`powershell -Command "Add-Type -AssemblyName System.Web; $encoded = [System.Web.HttpUtility]::UrlEncode('${tweet.replace(/'/g, "''")}'); Start-Process 'https://x.com/intent/post?text=$encoded'"`);
    } else {
      await execPromise(`open "https://x.com/intent/post?text=$(node -pe 'encodeURIComponent(require(\"fs\").readFileSync(\"${TWEET_FILE}\", \"utf8\"))')"`);
    }
    console.log('✅ Browser opened with pre-filled tweet');
    console.log('   (Final click needed in browser)');
    return true;
  } catch (error) {
    console.log('❌ URL method failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🏛️ ULTIMATE TWEET POSTER - Autonomous\n');
  
  if (!fs.existsSync(TWEET_FILE)) {
    console.error('No tweet file found');
    process.exit(1);
  }
  
  const tweet = fs.readFileSync(TWEET_FILE, 'utf8');
  console.log('Tweet to post:\n');
  console.log(tweet);
  console.log('\n---\n');
  
  // Try methods in order
  const methods = [
    { name: 'Bird CLI', fn: tryBirdCLI },
    { name: 'URL Method', fn: tryURLMethod }
  ];
  
  for (const method of methods) {
    console.log(`\nAttempting: ${method.name}`);
    const success = await method.fn();
    if (success) {
      console.log(`\n✅ SUCCESS via ${method.name}\n`);
      process.exit(0);
    }
  }
  
  console.log('\n⚠️ All methods attempted.');
  console.log('Tweet is ready in browser OR needs authentication setup.\n');
}

main();
