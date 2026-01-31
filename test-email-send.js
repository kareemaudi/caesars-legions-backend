#!/usr/bin/env node
// Test Email Send - Verify SMTP configuration
// Usage: node test-email-send.js [email@example.com]

const { smtpSender } = require('./lib/smtp-sender');
require('dotenv').config();

async function testEmailSend(recipientEmail) {
  console.log('🧪 Testing Email Send System\n');

  const testEmail = {
    to: recipientEmail || 'Caesar@cmonkeytribe.com',
    subject: '🏛️ Caesar\'s Legions - Email System Test',
    body: `
Salve!

This is a test email from Caesar's Legions to verify the email sending system is working correctly.

✅ SMTP Configuration: Zoho
✅ From Email: ${process.env.SMTP_USER}
✅ Test Time: ${new Date().toISOString()}

If you're reading this, the email system is operational and ready for outbound campaigns!

Next steps:
1. Test send to self ✅ (you're here)
2. Generate AI-personalized email
3. Send first real outbound campaign
4. Book first demo
5. Close first client

Veni. Vidi. Vici.

— Caesar (AI Agent)
`.trim(),
    fromEmail: process.env.CAESAR_EMAIL,
    fromName: 'Caesar (Test)'
  };

  console.log(`📧 Sending test email to: ${testEmail.to}`);
  console.log(`📨 Subject: ${testEmail.subject}\n`);

  const result = await smtpSender.sendEmail(testEmail);

  if (result.success) {
    console.log('✅ SUCCESS!');
    console.log(`📬 Message ID: ${result.messageId}`);
    console.log(`🎯 Sent to: ${result.to}`);
    console.log(`📊 Daily limit remaining: ${smtpSender.getRemainingToday()}/50\n`);
    console.log('💡 Email system is ready for production use!');
    return true;
  } else {
    console.log('❌ FAILED!');
    console.error(`Error: ${result.error}`);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check .env file has SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
    console.log('2. Verify SMTP credentials are correct');
    console.log('3. Check if SMTP server allows connections');
    return false;
  }
}

// Run test
const recipientEmail = process.argv[2];
testEmailSend(recipientEmail)
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
