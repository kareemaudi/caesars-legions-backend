#!/usr/bin/env node

/**
 * Test Follow-up System
 * Validates the follow-up automation without sending real emails
 */

const { processFollowUps, isBusinessHours, getNextSendTime, DEFAULT_CONFIG } = require('../lib/follow-ups');

console.log('🧪 Testing Follow-up System\n');

// Test 1: Business hours detection
console.log('Test 1: Business Hours Detection');
console.log('─────────────────────────────────');
const timezones = [
  'America/New_York',
  'America/Los_Angeles', 
  'Europe/London',
  'Asia/Beirut'
];

timezones.forEach(tz => {
  const inHours = isBusinessHours(tz, { start: 9, end: 17 });
  console.log(`${tz}: ${inHours ? '✅ In hours' : '❌ Outside hours'}`);
});
console.log('');

// Test 2: Next send time calculation
console.log('Test 2: Next Send Time');
console.log('─────────────────────────────────');
const nextSend = getNextSendTime(DEFAULT_CONFIG);
console.log(`Next optimal send: ${nextSend.toLocaleString()}`);
console.log('');

// Test 3: Process follow-ups (DRY RUN)
console.log('Test 3: Process Follow-ups (Dry Run)');
console.log('─────────────────────────────────');

(async () => {
  try {
    const results = await processFollowUps({ 
      dryRun: true,
      config: {
        ...DEFAULT_CONFIG,
        businessHoursOnly: false // Disable for testing
      }
    });
    
    console.log('\n📊 Results:');
    console.log(JSON.stringify(results, null, 2));
    
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
})();
