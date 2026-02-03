const db = require('./lib/db');

const now = Math.floor(Date.now() / 1000);
const emails = db.getRecentEmails(1, 100);

console.log('\n📧 Testing Timestamps:\n');

[0, 5, 10, 15].forEach(idx => {
  const e = emails[idx];
  if (e) {
    const days = Math.floor((now - e.sent_at) / 86400);
    console.log(`Email ${idx+1}: ${e.first_name} ${e.last_name} - ${days} days ago`);
  }
});

console.log('\nExpected:');
console.log('  Emails 1-5: 0 days (recent)');
console.log('  Emails 6-10: 3 days (ready for follow-up 1)');
console.log('  Emails 11-15: 7 days (ready for follow-up 2)');
console.log('  Emails 16-20: 4 days (follow-ups sent 4 days ago)\n');
