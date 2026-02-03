const db = require('./lib/db');

const now = Math.floor(Date.now() / 1000);
const emails = db.getRecentEmails(1, 100);

console.log('\n📧 All Emails (sorted by sent_at DESC):\n');

emails.forEach((e, idx) => {
  const days = Math.floor((now - e.sent_at) / 86400);
  const hours = Math.floor((now - e.sent_at) / 3600);
  console.log(`${idx+1}. ${e.first_name} ${e.last_name} - ID:${e.id} - ${days}d ${hours % 24}h ago - sent_at:${e.sent_at}`);
});

console.log('\nGroup breakdown (by ID):');
console.log('  IDs 1-5: Should be recent (0 days)');
console.log('  IDs 6-10: Should be 3 days ago');
console.log('  IDs 11-20: Should be 7 days ago (with follow-ups)');
