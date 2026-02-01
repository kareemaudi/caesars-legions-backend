#!/usr/bin/env node

/**
 * Daily Follow-up Processor
 * Runs every day at 9 AM to send automated follow-ups
 * 
 * Usage:
 *   node cron/process-follow-ups.js              # Dry run (default)
 *   node cron/process-follow-ups.js --live       # Actually send emails
 *   node cron/process-follow-ups.js --config custom-config.json
 */

const { processFollowUps, DEFAULT_CONFIG } = require('../lib/follow-ups');
const fs = require('fs');
const path = require('path');

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = !args.includes('--live');
const configFile = args.find(arg => arg.endsWith('.json'));

// Load custom config if provided
let config = DEFAULT_CONFIG;
if (configFile) {
  try {
    const configPath = path.resolve(process.cwd(), configFile);
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.log(`📄 Loaded config from ${configFile}`);
  } catch (error) {
    console.error(`⚠️ Failed to load config ${configFile}: ${error.message}`);
    console.log('Using default config instead');
  }
}

// Log run details
console.log('\n🤖 Caesar\'s Legions - Automated Follow-ups\n');
console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '🚀 LIVE'}`);
console.log(`Time: ${new Date().toLocaleString()}`);
console.log(`Config:`);
console.log(`  - Follow-up days: ${config.followUpDelays.join(', ')}`);
console.log(`  - Business hours: ${config.businessHoursOnly ? 'Yes' : 'No'}`);
console.log(`  - Timezone: ${config.timezone}`);
console.log(`  - Max follow-ups per lead: ${config.maxFollowUps}\n`);

// Run the processor
(async () => {
  try {
    const results = await processFollowUps({ dryRun, config });
    
    // Log results to file
    const logEntry = {
      timestamp: new Date().toISOString(),
      mode: dryRun ? 'dry_run' : 'live',
      results,
      config_used: config
    };
    
    const logDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFile = path.join(logDir, 'follow-ups.jsonl');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    
    console.log(`\n📝 Logged to ${logFile}`);
    
    // Exit with appropriate code
    process.exit(results.errors?.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Follow-up processing failed:', error);
    process.exit(1);
  }
})();
