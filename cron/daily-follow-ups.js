#!/usr/bin/env node
/**
 * Daily Follow-up Processor
 * 
 * Runs via Clawdbot cron:
 * - Every day at 10 AM (client timezone)
 * - Sends 3-day and 7-day follow-ups
 * - Respects business hours
 * 
 * Add to Clawdbot cron:
 *   cron action=add 
 *     schedule="0 10 * * *" 
 *     text="Run Caesar's Legions follow-up automation" 
 *     contextMessages=0
 */

const path = require('path');
const fs = require('fs');

// Load follow-up system
const { processFollowUps } = require('../lib/follow-ups');

// Custom config (override defaults if needed)
const CONFIG = {
  followUpDelays: [3, 7],          // Days: First follow-up at day 3, second at day 7
  businessHoursOnly: true,
  businessHours: { start: 9, end: 17 },
  timezone: 'America/New_York',    // TODO: Get from client settings
  maxFollowUps: 2,
  minIntervalHours: 48
};

async function main() {
  console.log('\n🏛️ Caesar\'s Legions - Daily Follow-up Automation\n');
  console.log(`⏰ Started: ${new Date().toLocaleString()}\n`);
  
  try {
    // Check if we should run (environment-based override)
    const dryRun = process.env.DRY_RUN === 'true';
    
    if (dryRun) {
      console.log('🧪 DRY RUN MODE - No emails will be sent\n');
    }
    
    // Process follow-ups
    const results = await processFollowUps({ 
      dryRun,
      config: CONFIG 
    });
    
    // Log results to memory
    const logEntry = {
      timestamp: new Date().toISOString(),
      day3_sent: results.sent.day3?.length || 0,
      day7_sent: results.sent.day7?.length || 0,
      skipped: results.skipped || 0,
      errors: results.errors?.length || 0,
      dryRun,
      nextRun: results.nextSendTime || null
    };
    
    const logPath = path.join(__dirname, '../../memory/followup-log.jsonl');
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    
    // Summary for Clawdbot
    if (!dryRun && (logEntry.day3_sent > 0 || logEntry.day7_sent > 0)) {
      console.log('\n✅ SUMMARY FOR CLAWDBOT:');
      console.log(`Sent ${logEntry.day3_sent} day-3 follow-ups`);
      console.log(`Sent ${logEntry.day7_sent} day-7 follow-ups`);
      console.log(`Skipped ${logEntry.skipped} (already replied or bounced)`);
      
      if (logEntry.errors > 0) {
        console.log(`⚠️ ${logEntry.errors} errors encountered`);
      }
      
      // Return status for Clawdbot to process
      return {
        success: true,
        totalSent: logEntry.day3_sent + logEntry.day7_sent,
        errors: logEntry.errors
      };
    } else if (results.skipped) {
      console.log('\n⏰ Outside business hours, will retry later');
      return { success: true, skipped: true };
    } else {
      console.log('\n✅ No follow-ups needed today');
      return { success: true, noAction: true };
    }
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    
    // Log error to memory
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    };
    
    const errorPath = path.join(__dirname, '../../memory/followup-errors.jsonl');
    fs.appendFileSync(errorPath, JSON.stringify(errorLog) + '\n');
    
    return { success: false, error: error.message };
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(result => {
      console.log('\n🏁 Finished:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { main };
