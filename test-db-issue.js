const fs = require('fs');
const db = require('./lib/db');

console.log('\n🔍 Testing database save/load issue\n');

// Insert a test email with old timestamp
const testData = {
  lead_id: 1,
  campaign_id: 1,
  client_id: 1,
  subject: 'Test Old Email',
  body: 'Test body',
  sent_at: 1000000000, // Sept 2001
  personalization_data: '{}'
};

console.log('1. Inserting email with sent_at:', testData.sent_at);
const result = db.insertEmailSent(testData);
console.log('   Inserted ID:', result.lastInsertRowid);

// Read the raw JSON file
console.log('\n2. Reading raw JSON file:');
const rawData = JSON.parse(fs.readFileSync('data/legions.json', 'utf8'));
const lastEmail = rawData.emails_sent[rawData.emails_sent.length - 1];
console.log('   Last email ID:', lastEmail.id);
console.log('   Last email sent_at:', lastEmail.sent_at);
console.log('   Expected:', testData.sent_at);
console.log('   Match:', lastEmail.sent_at === testData.sent_at);

// Read via getRecentEmails
console.log('\n3. Reading via getRecentEmails:');
const emails = db.getRecentEmails(1, 100);
const foundEmail = emails.find(e => e.id === result.lastInsertRowid);
if (foundEmail) {
  console.log('   Found email ID:', foundEmail.id);
  console.log('   sent_at:', foundEmail.sent_at);
  console.log('   Match:', foundEmail.sent_at === testData.sent_at);
} else {
  console.log('   ERROR: Could not find email with ID', result.lastInsertRowid);
  console.log('   Available IDs:', emails.map(e => e.id).join(', '));
}
