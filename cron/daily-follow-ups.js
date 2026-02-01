#!/usr/bin/env node

/**
 * Daily Follow-up Cron Job
 * Runs automated follow-ups for all active campaigns
 * 
 * Usage:
 *   node cron/daily-follow-ups.js [--dry-run] [--config=path/to/config.json]
 * 
 * Schedule with Clawdbot cron every day at 10 AM ET
 */

require('dotenv').config();
const { processFollowUps, DEFAULT_CONFIG } = require('../lib/follow-ups');
const fs = require('fs');
const path = require('path');

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const configArg = args.find(arg => arg.startsWith('--config='));
const customConfigPath = configArg ? configArg.split('=')[1] : null;

// Load custom config if provided
let config = { ...DEFAULT_CONFIG };
if (customConfigPath && fs.existsSync(customConfigPath)) {
  try {
    const customConfig = JSON.parse(fs.readFileSync(customConfigPath, 'utf8'));
    config = { ...config, ...customConfig };
    console.log(`📋 Loaded custom config from ${customConfigPath}`);
  } catch (error) {
    console.error(`⚠️ Failed to load config: ${error.message}`);
    process.exit(1);
  }
}

// Log configuration
console.log('\n🏛️ Caesar\'s Legions - Daily Follow-up Processor');
console.log('================================================\n');
console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
console.log(`Config:`, JSON.stringify(config, null, 2));
console.log(`Started: ${new Date().toISOString()}\n`);

// Run the follow-up processor
(async () => {
  try {
    const results = await processFollowUps({ dryRun, config });
    
    // Check if we skipped due to business hours
    if (results.skipped) {
      console.log(`⏰ Skipped: Outside business hours`);
      console.log(`   Next run: ${results.nextSendTime?.toISOString()}`);
      process.exit(0);
    }
    
    // Calculate totals
    const totalSent = Object.values(results.sent)
      .reduce((sum, arr) => sum + arr.length, 0);
    
    // Log summary
    console.log('\n📊 SUMMARY');
    console.log('==========');
    console.log(`Total sent: ${totalSent}`);
    console.log(`Errors: ${results.errors.length}`);
    console.log(`Skipped: ${results.skipped}`);
    
    // Show breakdown by day
    Object.entries(results.sent).forEach(([day, emails]) => {
      if (emails.length > 0) {
        console.log(`\n${day} (${emails.length}):`);
        emails.forEach(email => console.log(`  • ${email}`));
      }
    });
    
    // Show errors if any
    if (results.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      results.errors.forEach(err => {
        console.log(`  • ${err.lead}: ${err.error} (Day ${err.delay})`);
      });
    }
    
    // Log to file for tracking
    const logEntry = {
      timestamp: new Date().toISOString(),
      dryRun,
      totalSent,
      errors: results.errors.length,
      skipped: results.skipped,
      breakdown: Object.fromEntries(
        Object.entries(results.sent).map(([k, v]) => [k, v.length])
      )
    };
    
    const logFile = path.join(__dirname, '../logs/follow-ups.jsonl');
    const logDir = path.dirname(logFile);
    
    // Ensure logs directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    console.log(`\n📝 Logged to: ${logFile}`);
    
    console.log(`\n✅ Completed at ${new Date().toISOString()}`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ FATAL ERROR:');
    console.error(error);
    
    // Log error
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    };
    
    const errorFile = path.join(__dirname, '../logs/follow-ups-errors.jsonl');
    const errorDir = path.dirname(errorFile);
    
    if (!fs.existsSync(errorDir)) {
      fs.mkdirSync(errorDir, { recursive: true });
    }
    
    fs.appendFileSync(errorFile, JSON.stringify(errorLog) + '\n');
    
    process.exit(1);
  }
})();
