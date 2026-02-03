#!/usr/bin/env node

/**
 * End-to-end test of email generation system
 * Tests: OpenAI integration, email generation, SMTP sending
 */

const emailGenerator = require('./lib/email-generator');
const nodemailer = require('nodemailer');
require('dotenv').config();

async function testEmailGeneration() {
  console.log('🧪 Testing Email Generation System\n');
  console.log('='.repeat(50));

  // Test 1: Check environment variables
  console.log('\n1️⃣ Checking environment variables...');
  const requiredEnvVars = ['OPENAI_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.log('❌ Missing env vars:', missing.join(', '));
    console.log('\nRequired in .env:');
    console.log('  OPENAI_API_KEY=sk-...');
    console.log('  SMTP_HOST=smtp.zoho.com');
    console.log('  SMTP_PORT=465');
    console.log('  SMTP_USER=caesar@cmonkeytribe.com');
    console.log('  SMTP_PASS=...');
    return false;
  }
  console.log('✅ All environment variables present');

  // Test 2: Generate email with OpenAI
  console.log('\n2️⃣ Testing OpenAI email generation...');
  
  const testLead = {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@example.com',
    company: 'TechCorp',
    title: 'CEO',
    linkedin_url: 'https://linkedin.com/in/johndoe'
  };

  const testClient = {
    company: "Caesar's Legions",
    value_prop: "AI-powered cold email that books meetings on autopilot. 100 personalized emails/week, sent and managed by AI.",
    target_audience: "B2B SaaS founders and CEOs"
  };

  let generatedEmail;
  try {
    const startTime = Date.now();
    generatedEmail = await emailGenerator.generateEmail({
      lead: testLead,
      client: testClient
    });
    const latency = Date.now() - startTime;
    
    console.log('✅ Email generated successfully');
    console.log(`⏱️  Latency: ${latency}ms`);
    console.log('\n--- Generated Email ---');
    console.log(`Subject: ${generatedEmail.subject}`);
    console.log(`\n${generatedEmail.body}`);
    console.log('--- End Email ---\n');
  } catch (error) {
    console.log('❌ Email generation failed:', error.message);
    if (error.status === 401) {
      console.log('   → Invalid OpenAI API key');
    } else if (error.status === 429) {
      console.log('   → Rate limited or out of credits');
    }
    return false;
  }

  // Test 3: SMTP connection
  console.log('3️⃣ Testing SMTP connection...');
  
  const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    await transporter.verify();
    console.log('✅ SMTP connection successful');
  } catch (error) {
    console.log('❌ SMTP connection failed:', error.message);
    return false;
  }

  // Test 4: Send test email (to Caesar's own email for safety)
  console.log('\n4️⃣ Sending test email...');
  
  const testRecipient = process.env.SMTP_USER; // Send to self for testing
  
  try {
    const info = await transporter.sendMail({
      from: `"Caesar's Legions" <${process.env.SMTP_USER}>`,
      to: testRecipient,
      subject: generatedEmail.subject,
      text: generatedEmail.body,
      html: generatedEmail.body.replace(/\n/g, '<br>')
    });
    
    console.log('✅ Test email sent successfully');
    console.log(`📧 Message ID: ${info.messageId}`);
    console.log(`📬 Sent to: ${testRecipient}`);
  } catch (error) {
    console.log('❌ Email sending failed:', error.message);
    return false;
  }

  // Test 5: Performance stats
  console.log('\n5️⃣ Performance stats:');
  const stats = emailGenerator.getStats();
  console.log(`   Total calls: ${stats.totalCalls}`);
  console.log(`   Total tokens: ${stats.totalTokens}`);
  console.log(`   Total cost: $${stats.totalCost.toFixed(4)}`);
  console.log(`   Avg latency: ${Math.round(stats.avgLatencyMs)}ms`);
  console.log(`   Avg cost/email: $${stats.avgCostPerEmail.toFixed(4)}`);

  // Success summary
  console.log('\n' + '='.repeat(50));
  console.log('🎉 ALL TESTS PASSED');
  console.log('\n✅ Email generation: Working');
  console.log('✅ SMTP sending: Working');
  console.log('✅ End-to-end flow: Ready for production');
  console.log('\n🏛️ Caesar\'s email army is operational.\n');
  
  return true;
}

// Run tests
testEmailGeneration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });
