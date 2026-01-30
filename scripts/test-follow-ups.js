// Test script for enhanced follow-up system
// Tests business hours logic, timezone awareness, and configurable delays

const { 
  isBusinessHours, 
  getNextSendTime,
  DEFAULT_CONFIG 
} = require('../lib/follow-ups');

console.log('🧪 Testing Enhanced Follow-up System\n');

// Test 1: Business Hours Detection
console.log('--- Test 1: Business Hours Detection ---');

const timezones = [
  'America/New_York',
  'Europe/London', 
  'Asia/Tokyo',
  'America/Los_Angeles'
];

timezones.forEach(tz => {
  const inHours = isBusinessHours(tz, { start: 9, end: 17 });
  const now = new Date().toLocaleString('en-US', { timeZone: tz });
  console.log(`${tz}: ${inHours ? '✅' : '❌'} (${now})`);
});

// Test 2: Next Send Time Calculation
console.log('\n--- Test 2: Next Send Time Calculation ---');

const configs = [
  { businessHoursOnly: true, timezone: 'America/New_York', businessHours: { start: 9, end: 17 } },
  { businessHoursOnly: false, timezone: 'America/New_York', businessHours: { start: 9, end: 17 } },
  { businessHoursOnly: true, timezone: 'Asia/Beirut', businessHours: { start: 10, end: 18 } }
];

configs.forEach((config, i) => {
  const nextTime = getNextSendTime(config);
  const isNow = Math.abs(nextTime - new Date()) < 1000; // Within 1 second = now
  console.log(`Config ${i+1}:`);
  console.log(`  Business hours only: ${config.businessHoursOnly}`);
  console.log(`  Timezone: ${config.timezone}`);
  console.log(`  Next send: ${nextTime.toLocaleString()} ${isNow ? '(NOW)' : '(SCHEDULED)'}`);
});

// Test 3: Custom Follow-up Delays
console.log('\n--- Test 3: Custom Follow-up Delays ---');

const customConfigs = [
  { followUpDelays: [3, 7], maxFollowUps: 2, name: 'Default (3, 7 days)' },
  { followUpDelays: [2, 5, 10], maxFollowUps: 3, name: 'Aggressive (2, 5, 10 days)' },
  { followUpDelays: [5, 14], maxFollowUps: 2, name: 'Conservative (5, 14 days)' },
  { followUpDelays: [1, 3, 7, 14], maxFollowUps: 4, name: 'Full sequence (1, 3, 7, 14 days)' }
];

customConfigs.forEach(config => {
  console.log(`${config.name}:`);
  console.log(`  Delays: [${config.followUpDelays.join(', ')}] days`);
  console.log(`  Max follow-ups: ${config.maxFollowUps}`);
  console.log(`  Total touches: ${config.followUpDelays.length + 1} (initial + ${config.followUpDelays.length} follow-ups)`);
});

// Test 4: Default Config Display
console.log('\n--- Test 4: Default Configuration ---');
console.log(JSON.stringify(DEFAULT_CONFIG, null, 2));

console.log('\n✅ All tests complete!\n');

console.log('📝 Usage Examples:\n');
console.log('// Use default config (3 and 7 day follow-ups)');
console.log('await processFollowUps({ dryRun: true });\n');

console.log('// Custom aggressive sequence');
console.log('await processFollowUps({');
console.log('  dryRun: false,');
console.log('  config: {');
console.log('    followUpDelays: [2, 5, 10],');
console.log('    maxFollowUps: 3,');
console.log('    businessHoursOnly: true,');
console.log('    timezone: "America/New_York"');
console.log('  }');
console.log('});\n');

console.log('// Send any time (ignore business hours)');
console.log('await processFollowUps({');
console.log('  config: { businessHoursOnly: false }');
console.log('});\n');
