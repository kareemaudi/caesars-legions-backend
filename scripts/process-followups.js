#!/usr/bin/env node

const { processFollowUps } = require('../lib/follow-ups');

async function main() {
  const args = process.argv.slice(2);
  const sendReal = args.includes('--send');
  
  console.log('\n🏛️ CAESAR\'S LEGIONS - Follow-up Processor\n');
  console.log(`Mode: ${sendReal ? 'LIVE (sending real emails)' : 'DRY RUN (preview only)'}\n`);
  
  try {
    const results = await processFollowUps({ dryRun: !sendReal });
    
    console.log('\n📊 Summary:');
    console.log(`   3-day follow-ups: ${results.day3.length}`);
    console.log(`   7-day follow-ups: ${results.day7.length}`);
    console.log(`   Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Errors:');
      results.errors.forEach(e => {
        console.log(`   ${e.lead}: ${e.error}`);
      });
    }
    
    console.log('\n');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
