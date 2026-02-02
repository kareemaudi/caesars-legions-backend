// Test Global Unsubscribe List

const unsubscribeList = require('../lib/unsubscribe-list');

console.log('\n🧪 Testing Global Unsubscribe List\n');
console.log('='.repeat(50));

// Test 1: Add email to unsubscribe list
console.log('\n1. Adding emails to unsubscribe list...');
const testEmails = [
  { email: 'test1@example.com', source: 'manual_test', reason: 'testing' },
  { email: 'test2@example.com', source: 'webhook_instantly', reason: 'user_unsubscribe' },
  { email: 'TEST3@EXAMPLE.COM', source: 'manual_test', reason: 'testing' } // Test case insensitivity
];

testEmails.forEach(({ email, source, reason }) => {
  const added = unsubscribeList.addToUnsubscribeList(email, { source, reason });
  console.log(`   ${added ? '✓' : '⊘'} ${email} (${added ? 'added' : 'already exists'})`);
});

// Test 2: Check if emails are unsubscribed
console.log('\n2. Checking unsubscribe status...');
const checkEmails = [
  'test1@example.com',
  'test3@example.com', // Should match TEST3@EXAMPLE.COM (case insensitive)
  'notunsubscribed@example.com'
];

checkEmails.forEach(email => {
  const isUnsub = unsubscribeList.isUnsubscribed(email);
  console.log(`   ${email}: ${isUnsub ? '🚫 UNSUBSCRIBED' : '✓ OK to email'}`);
});

// Test 3: Get unsubscribe record
console.log('\n3. Getting unsubscribe record details...');
const record = unsubscribeList.getUnsubscribeRecord('test2@example.com');
if (record) {
  console.log('   Record found:');
  console.log(`     Email: ${record.email}`);
  console.log(`     Source: ${record.source}`);
  console.log(`     Reason: ${record.reason}`);
  console.log(`     Date: ${record.unsubscribed_at}`);
}

// Test 4: Filter a lead list
console.log('\n4. Filtering a lead list...');
const leads = [
  { email: 'test1@example.com', name: 'John Doe', company: 'Acme Inc' },
  { email: 'goodlead@example.com', name: 'Jane Smith', company: 'Beta Corp' },
  { email: 'test2@example.com', name: 'Bob Johnson', company: 'Gamma LLC' },
  { email: 'anothergood@example.com', name: 'Alice Brown', company: 'Delta Co' }
];

const { allowed, blocked } = unsubscribeList.filterUnsubscribed(leads);
console.log(`   Input: ${leads.length} leads`);
console.log(`   Allowed: ${allowed.length} leads`);
console.log(`   Blocked: ${blocked.length} leads`);

if (blocked.length > 0) {
  console.log('\n   Blocked emails:');
  blocked.forEach(lead => {
    console.log(`     - ${lead.email} (${lead.name})`);
  });
}

// Test 5: Get statistics
console.log('\n5. Unsubscribe list statistics...');
const stats = unsubscribeList.getStats();
console.log(`   Total unsubscribed: ${stats.total}`);
console.log(`   Last 7 days: ${stats.recentUnsubscribes.last7Days}`);
console.log(`   Last 30 days: ${stats.recentUnsubscribes.last30Days}`);
console.log('\n   By source:');
Object.entries(stats.bySource).forEach(([source, count]) => {
  console.log(`     ${source}: ${count}`);
});

// Test 6: Bulk import
console.log('\n6. Testing bulk import...');
const bulkEmails = [
  'bulk1@example.com',
  'bulk2@example.com',
  { email: 'bulk3@example.com', source: 'csv_import', reason: 'previous_system' }
];

const importResults = unsubscribeList.bulkImport(bulkEmails, { 
  source: 'bulk_import_test',
  reason: 'testing_bulk'
});

console.log(`   Added: ${importResults.added}`);
console.log(`   Skipped: ${importResults.skipped}`);
console.log(`   Errors: ${importResults.errors.length}`);

// Test 7: Export list
console.log('\n7. Exporting full list...');
const fullList = unsubscribeList.exportList();
console.log(`   Total records: ${fullList.length}`);
console.log('\n   Sample (first 3):');
fullList.slice(0, 3).forEach(record => {
  console.log(`     ${record.email} - ${record.source} (${new Date(record.unsubscribed_at).toLocaleDateString()})`);
});

// Cleanup test data
console.log('\n8. Cleaning up test data...');
const testCleanupEmails = [
  'test1@example.com',
  'test2@example.com',
  'test3@example.com',
  'bulk1@example.com',
  'bulk2@example.com',
  'bulk3@example.com'
];

testCleanupEmails.forEach(email => {
  const removed = unsubscribeList.removeFromUnsubscribeList(email);
  if (removed) {
    console.log(`   ✓ Removed: ${email}`);
  }
});

console.log('\n='.repeat(50));
console.log('✅ All tests completed!\n');
console.log('Final stats:');
const finalStats = unsubscribeList.getStats();
console.log(`   Total unsubscribed: ${finalStats.total}`);
console.log(`   File: data/global-unsubscribe.json\n`);
