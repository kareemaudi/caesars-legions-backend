#!/usr/bin/env node
/**
 * Caesar's Legions - Day 1 Execution Script
 * 
 * This script automates:
 * 1. Posting first tweet to @agenticCaesar
 * 2. Logging prospects for manual outreach
 * 3. Generating personalized DMs
 * 4. Tracking execution metrics
 * 
 * Run: node execute-day1.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const TWITTER_ACCOUNT = '@agenticCaesar';
const PROSPECTS_FILE = path.join(__dirname, '../data/prospects-warm.json');
const EXECUTION_LOG = path.join(__dirname, '../data/execution-log.jsonl');

// First tweet content
const TWEET_1 = `Day 1 of building Caesar's Legions in public.

$0 MRR → $10K MRR in 90 days.

AI-powered cold email for B2B SaaS founders.

Just finished: Prospect tracking system (scores leads 0-100 based on company size, revenue, pain points).

Next: Find first 10 clients.

Following along? 🏛️`;

// Load prospects
function loadProspects() {
  const data = fs.readFileSync(PROSPECTS_FILE, 'utf8');
  return JSON.parse(data);
}

// Log execution
function logExecution(action, status, details = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    action,
    status,
    ...details
  };
  
  fs.appendFileSync(
    EXECUTION_LOG,
    JSON.stringify(logEntry) + '\n'
  );
  
  console.log(`✓ ${action}: ${status}`);
}

// Main execution
async function execute() {
  console.log('🏛️ Caesar\'s Legions - Day 1 Execution\n');
  
  try {
    // Step 1: Tweet content
    console.log('\n📱 STEP 1: POST TO X');
    console.log('─'.repeat(60));
    console.log('\nAccount:', TWITTER_ACCOUNT);
    console.log('\nTweet content:\n');
    console.log(TWEET_1);
    console.log('\n' + '─'.repeat(60));
    console.log('\n👉 ACTION REQUIRED:');
    console.log('   1. Go to: https://x.com/compose/post');
    console.log('   2. Copy the tweet above');
    console.log('   3. Paste and click Post');
    console.log('   4. Press ENTER when done...\n');
    
    // Wait for user confirmation
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
    
    logExecution('tweet_1_posted', 'completed', {
      account: TWITTER_ACCOUNT,
      content_length: TWEET_1.length
    });
    
    // Step 2: Reddit outreach
    console.log('\n📧 STEP 2: REDDIT OUTREACH');
    console.log('─'.repeat(60));
    
    const prospects = loadProspects();
    
    prospects.prospects.forEach((prospect, index) => {
      console.log(`\n[${index + 1}/${prospects.prospects.length}] ${prospect.id}`);
      console.log(`Fit Score: ${prospect.fit_score}/100`);
      console.log(`Pain: "${prospect.pain_points[0]}"`);
      console.log(`\nLink: ${prospect.post_url || prospect.thread_url}`);
      console.log(`\nMessage to send:\n`);
      console.log(prospect.draft_message);
      console.log('\n' + '─'.repeat(60));
    });
    
    console.log('\n👉 ACTION REQUIRED:');
    console.log('   1. Open each link above');
    console.log('   2. Find the username, click "Send Message"');
    console.log('   3. Copy-paste the draft message');
    console.log('   4. Press ENTER when all 3 are sent...\n');
    
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
    
    logExecution('reddit_outreach', 'completed', {
      prospects_contacted: prospects.prospects.length
    });
    
    // Step 3: Summary
    console.log('\n✅ DAY 1 EXECUTION COMPLETE');
    console.log('─'.repeat(60));
    console.log(`\n✓ Tweet posted to ${TWITTER_ACCOUNT}`);
    console.log(`✓ ${prospects.prospects.length} Reddit DMs sent`);
    console.log(`\nExpected results (24h):`);
    console.log(`  → 2-3 responses to DMs`);
    console.log(`  → 10-20 likes on tweet`);
    console.log(`  → 1-2 questions about Caesar's Legions`);
    console.log(`\nNext: Wait for responses, prep for calls\n`);
    
    logExecution('day1_execution', 'completed', {
      total_actions: 4,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    logExecution('execution_error', 'failed', {
      error: error.message
    });
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  execute();
}

module.exports = { execute };
