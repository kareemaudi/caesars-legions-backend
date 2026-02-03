#!/usr/bin/env node

/**
 * Simple end-to-end email test
 */

const emailGenerator = require('./lib/email-generator');
const { enhancedSMTPSender } = require('./lib/smtp-sender-enhanced');
require('dotenv').config();

async function testSystem() {
  console.log('🧪 Testing Caesar\'s Email System\n');
  console.log('='.repeat(50));

  // Test data
  const testLead = {
    first_name: 'Test',
    last_name: 'Recipient',
    email: process.env.SMTP_USER, // Send to self for safety
    company: 'TestCorp',
    title: 'CEO',
    linkedin_url: 'https://linkedin.com/in/test'
  };

  const testClient = {
    company: "Caesar's Legions",
    value_prop: "AI-powered cold email that books meetings on autopilot",
    target_audience: "B2B SaaS founders"
  };

  // Step 1: Generate email
  console.log('\n1️⃣ Generating personalized email...');
  let email;
  try {
    email = await emailGenerator.generateEmail({
      lead: testLead,
      client: testClient
    });
    console.log('✅ Email generated');
    console.log(`   Subject: ${email.subject}`);
    console.log(`   Length: ${email.body.length} chars`);
  } catch (error) {
    console.log('❌ Generation failed:', error.message);
    return false;
  }

  // Step 2: Send email
  console.log('\n2️⃣ Sending via SMTP...');
  const sender = enhancedSMTPSender;
  
  try {
    const result = await sender.sendEmail({
      to: testLead.email,
      subject: `[TEST] ${email.subject}`,
      body: email.body
    });
    
    if (result.success) {
      console.log('✅ Email sent successfully');
      console.log(`   Message ID: ${result.messageId}`);
      console.log(`   Send time: ${result.sendTimeMs}ms`);
    } else {
      console.log('❌ Send failed:', result.error);
      return false;
    }
  } catch (error) {
    console.log('❌ SMTP error:', error.message);
    return false;
  }

  // Step 3: Stats
  console.log('\n3️⃣ Performance stats:');
  const genStats = emailGenerator.getStats();
  const smtpMetrics = sender.getMetrics();
  
  console.log(`   Generation: ${Math.round(genStats.avgLatencyMs)}ms, $${genStats.avgCostPerEmail.toFixed(4)}/email`);
  console.log(`   SMTP: ${smtpMetrics.totalSent} sent, ${smtpMetrics.totalFailed} failed`);

  console.log('\n' + '='.repeat(50));
  console.log('🎉 END-TO-END TEST PASSED');
  console.log('\n✅ OpenAI generation: Working');
  console.log('✅ SMTP sending: Working');
  console.log('✅ System ready for production');
  console.log('\n🏛️ Caesar\'s email army is operational.\n');
  
  return true;
}

testSystem()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
