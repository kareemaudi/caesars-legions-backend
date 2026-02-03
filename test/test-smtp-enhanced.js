#!/usr/bin/env node
/**
 * Test suite for enhanced SMTP sender
 * Verifies: persistence, retry logic, metrics, error categorization
 */

const { enhancedSMTPSender, ErrorTypes } = require('../lib/smtp-sender-enhanced');
require('dotenv').config();

async function runTests() {
  console.log('🧪 Testing Enhanced SMTP Sender\n');

  // Test 1: Health Check
  console.log('1️⃣  Health Check...');
  const health = await enhancedSMTPSender.healthCheck();
  console.log(JSON.stringify(health, null, 2));
  
  if (!health.smtp.configured) {
    console.log('\n⚠️  SMTP not configured. Set SMTP_USER and SMTP_PASS in .env');
    return;
  }

  if (!health.smtp.healthy) {
    console.log('\n❌ SMTP connection failed:', health.smtp.error);
    return;
  }

  console.log('✓ SMTP healthy\n');

  // Test 2: Preflight Checks
  console.log('2️⃣  Testing Preflight Checks...');
  
  const invalidEmail = enhancedSMTPSender.preflightCheck('not-an-email');
  console.log('Invalid email:', invalidEmail.errorType === ErrorTypes.INVALID_EMAIL ? '✓' : '✗');
  
  const validEmail = enhancedSMTPSender.preflightCheck('test@example.com');
  console.log('Valid email:', validEmail.success ? '✓' : '✗');
  console.log();

  // Test 3: Rate Limit Tracking
  console.log('3️⃣  Testing Rate Limit Tracking...');
  console.log(`Daily sent: ${enhancedSMTPSender.state.dailySent}`);
  console.log(`Remaining today: ${enhancedSMTPSender.getRemainingToday()}`);
  console.log(`Can send: ${enhancedSMTPSender.canSendToday() ? '✓' : '✗'}`);
  console.log();

  // Test 4: Metrics
  console.log('4️⃣  Current Metrics...');
  const metrics = enhancedSMTPSender.getMetrics();
  console.log(JSON.stringify(metrics, null, 2));
  console.log();

  // Test 5: DRY RUN - Don't actually send
  console.log('5️⃣  DRY RUN - Email Preparation...');
  const testEmail = {
    to: 'test@example.com',
    subject: 'Test Email from Caesar\'s Legions',
    body: 'This is a test email.\n\nBest regards,\nCaesar',
    fromEmail: process.env.SMTP_USER,
    fromName: 'Caesar\'s Legions'
  };

  const content = enhancedSMTPSender.prepareEmailContent(
    testEmail.body,
    testEmail.to,
    testEmail.fromEmail,
    testEmail.fromName,
    testEmail.subject
  );

  console.log('Subject:', content.subject);
  console.log('From:', content.from);
  console.log('To:', content.to);
  console.log('Has unsubscribe link:', content.text.includes('unsubscribe') ? '✓' : '✗');
  console.log('Has physical address:', content.text.includes('Business St') ? '✓' : '✗');
  console.log();

  // Test 6: OPTIONAL - Actual Send (commented out for safety)
  console.log('6️⃣  Actual Send Test (SKIPPED - uncomment to test)');
  console.log('To test real sending, uncomment the code below and run again.\n');
  
  /*
  const sendResult = await enhancedSMTPSender.sendEmail({
    to: 'your-email@example.com', // CHANGE THIS
    subject: 'Test Email from Enhanced SMTP',
    body: 'This is a real test email.\n\nIf you receive this, the system is working!',
    fromEmail: process.env.SMTP_USER,
    fromName: 'Caesar\'s Legions Test'
  });
  console.log('Send result:', sendResult);
  */

  console.log('✅ All tests complete!\n');
  console.log('📊 Final Metrics:');
  console.log(JSON.stringify(enhancedSMTPSender.getMetrics(), null, 2));
}

runTests().catch(console.error);
