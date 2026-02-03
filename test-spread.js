// Test that object spread overrides defaults

const data = {
  name: 'Test',
  sent_at: 12345,
  body: 'Hello'
};

const obj1 = {
  id: 1,
  sent_at: 99999, // Default
  ...data // Should override
};

console.log('With ...data after defaults:');
console.log('  sent_at:', obj1.sent_at, '(expected: 12345)');
console.log('  ✓ Works:', obj1.sent_at === 12345);

// Now test db.insertEmailSent
const db = require('./lib/db');

console.log('\nTesting db.insertEmailSent:');
const testData = {
  lead_id: 1,
  campaign_id: 1,
  client_id: 1,
  subject: 'Test',
  body: 'Test body',
  sent_at: 1000000000, // Way in the past (Sept 2001)
  personalization_data: '{}'
};

const result = db.insertEmailSent(testData);
console.log('  Inserted with ID:', result.lastInsertRowid);

// Read it back
const emails = db.getRecentEmails(1, 1);
if (emails[0]) {
  console.log('  sent_at from DB:', emails[0].sent_at);
  console.log('  Expected:', 1000000000);
  console.log('  ✓ Works:', emails[0].sent_at === 1000000000);
}
