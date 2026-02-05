#!/usr/bin/env node
/**
 * Test Email Sending
 */

require('dotenv').config();
const EmailSender = require('../lib/email-sender');

async function testSend() {
  // Override with Railway env vars for local testing
  process.env.SMTP_HOST = process.env.SMTP_HOST || 'smtp.zoho.com';
  process.env.SMTP_PORT = process.env.SMTP_PORT || '587';
  process.env.SMTP_USER = process.env.SMTP_USER || 'Caesar@cmonkeytribe.com';
  process.env.SMTP_PASS = process.env.SMTP_PASS || 'T&-8VrU33t%AXvw';
  process.env.CAESAR_EMAIL = process.env.CAESAR_EMAIL || 'Caesar@cmonkeytribe.com';
  process.env.FROM_NAME = process.env.FROM_NAME || 'Caesar - Caesars Legions';
  
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
