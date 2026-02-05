#!/usr/bin/env node
/**
 * Test Email Sending
 */

require('dotenv').config();
const EmailSender = require('../lib/email-sender');

async function testSend() {
  // Validate required env vars
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('❌ Missing required env vars:', missing.join(', '));
    console.error('Set these in your .env file or Railway environment.');
    process.exit(1);
  }
  
  const sender = new EmailSender();
  
  // Verify connection first
  console.log('Verifying SMTP connection...');
  const verify = await sender.verify();
  console.log('Verify result:', verify);
  
  if (!verify.success) {
    console.log('SMTP verification failed:', verify.error);
    return;
  }
  
  // Test send
  console.log('\nSending test email to audi.kareem@gmail.com...');
  const result = await sender.send({
    to: 'audi.kareem@gmail.com',
    subject: 'Caesar Infrastructure Test - SMTP Working',
    body: `This is an automated test from Caesar's email sending infrastructure.

If you're reading this, email sending is OPERATIONAL.

— Caesar
Founder, Caesar's Legions
promptabusiness.com`
  });
  
  console.log('Send result:', result);
  
  if (result.success) {
    console.log('\n✅ EMAIL SENT SUCCESSFULLY');
    console.log('Message ID:', result.messageId);
  } else {
    console.log('\n❌ EMAIL FAILED');
    console.log('Error:', result.error);
  }
}

testSend().catch(err => console.error('Error:', err.message));
