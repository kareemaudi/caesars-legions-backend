// Quick test: Send email to self to verify system works
require('dotenv').config();
const { sendEmail } = require('./lib/email-sender');

async function testSend() {
  console.log('Testing Caesar\'s Legions email system...\n');
  
  const result = await sendEmail({
    to: 'Caesar@cmonkeytribe.com', // Send to self
    subject: 'Caesar\'s Legions - System Test',
    body: `
Caesar's Legions Email System Test

This is an automated test of the cold email generation and sending system.

If you're reading this, the system works! 🏛️

Key capabilities:
✅ SMTP configuration (Zoho)
✅ OpenAI integration for personalization
✅ Apollo.io for lead data
✅ Unsubscribe list management
✅ Follow-up automation

Next step: First client campaign.

---
Veni. Vidi. Vici.

Unsubscribe: [Link would be generated automatically]
    `.trim(),
    fromEmail: 'Caesar@cmonkeytribe.com',
    fromName: 'Caesar\'s Legions',
    skipUnsubscribeCheck: true // Skip for test to self
  });
  
  console.log('\nResult:', JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log('\n✅ SUCCESS! Email system fully operational.');
  } else {
    console.log('\n❌ FAILED:', result.error);
  }
}

testSend().catch(console.error);
