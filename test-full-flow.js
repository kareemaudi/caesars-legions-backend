#!/usr/bin/env node
// Test Full Flow: Lead → AI Email Generation → Send
// Usage: node test-full-flow.js

const { smtpSender } = require('./lib/smtp-sender');
const { generateEmail } = require('./lib/email-generator');
require('dotenv').config();

async function testFullFlow() {
  console.log('🧪 Testing Full Caesar\'s Legions Flow\n');

  // Test prospect from today's research
  const testLead = {
    first_name: 'Kareem',
    last_name: '(Test)',
    company: 'CMT',
    title: 'Founder',
    email: 'Caesar@cmonkeytribe.com',
    industry: 'Digital Marketing',
    recent_activity: 'Mentioned building AI agent for outbound automation',
    pain_point: 'Spending 3 hours/day on manual outbound sales'
  };

  const testClient = {
    name: 'Caesar',
    company: 'Caesar\'s Legions',
    value_prop: 'automate outbound sales with AI agents',
    target_audience: 'B2B SaaS founders',
    case_study: 'Helped founders save 15+ hours/week on outbound'
  };

  console.log('👤 Test Prospect:');
  console.log(`   Name: ${testLead.first_name} ${testLead.last_name}`);
  console.log(`   Company: ${testLead.company}`);
  console.log(`   Pain: ${testLead.pain_point}\n`);

  console.log('🤖 Step 1: Generate AI-personalized email...');
  
  const emailContent = await generateEmail({ lead: testLead, client: testClient });
  
  console.log('✅ Email generated!');
  console.log('\n📧 Subject:', emailContent.subject);
  console.log('\n📝 Body:\n');
  console.log('---');
  console.log(emailContent.body);
  console.log('---\n');

  console.log('📨 Step 2: Send email...');
  
  const sendResult = await smtpSender.sendEmail({
    to: testLead.email,
    subject: emailContent.subject,
    body: emailContent.body,
    fromEmail: process.env.CAESAR_EMAIL,
    fromName: 'Kareem - Caesar\'s Legions'
  });

  if (sendResult.success) {
    console.log('✅ Email sent successfully!');
    console.log(`📬 Message ID: ${sendResult.messageId}`);
    console.log(`🎯 Delivered to: ${sendResult.to}`);
    console.log(`📊 Daily limit remaining: ${smtpSender.getRemainingToday()}/50\n`);
    
    console.log('🎉 FULL FLOW WORKING!');
    console.log('✅ AI email generation');
    console.log('✅ SMTP sending');
    console.log('✅ Personalization');
    console.log('\n🚀 Ready for first client campaign!');
    return true;
  } else {
    console.log('❌ Email send failed:', sendResult.error);
    return false;
  }
}

// Run test
testFullFlow()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Error:', error);
    process.exit(1);
  });
