#!/usr/bin/env node
/**
 * Test email generation with current OpenAI API key
 * Usage: node scripts/test-email-gen.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { generateEmail, generateFollowUp } = require('../lib/email-generator');

async function testEmailGeneration() {
  console.log('🧪 Testing Email Generation...\n');

  // Test data based on our real qualified leads
  const testLead = {
    first_name: 'Emiliano',
    last_name: 'Guerrero',
    title: 'Founder',
    company: 'Rivin.ai',
    email: 'emiliano@rivin.ai'
  };

  const testClient = {
    name: 'Caesar',
    company: "Caesar's Legions",
    value_prop: 'AI-powered cold email campaigns that get replies. We research your prospects, write personalized emails, and automate follow-ups.',
    target_audience: 'B2B SaaS founders doing $10K-$500K MRR'
  };

  try {
    // Test 1: Generate initial email
    console.log('📧 Test 1: Generate initial cold email');
    console.log('Target:', testLead.first_name, testLead.last_name, `(${testLead.title} at ${testLead.company})`);
    console.log('');

    const startTime = Date.now();
    const email = await generateEmail({
      lead: testLead,
      client: testClient
    });
    const duration = Date.now() - startTime;

    console.log('✅ SUCCESS');
    console.log(`⏱️  Generation time: ${duration}ms`);
    console.log('');
    console.log('📬 SUBJECT:', email.subject);
    console.log('');
    console.log('📝 BODY:');
    console.log(email.body);
    console.log('');
    console.log('🎯 PERSONALIZATION:', email.personalization_data);
    console.log('\n' + '─'.repeat(80) + '\n');

    // Test 2: Generate follow-up
    console.log('📧 Test 2: Generate follow-up email (3 days later)');
    const followUp = await generateFollowUp({
      lead: testLead,
      client: testClient,
      previousEmail: email,
      daysSince: 3
    });

    console.log('✅ SUCCESS');
    console.log('');
    console.log('📬 SUBJECT:', followUp.subject);
    console.log('');
    console.log('📝 BODY:');
    console.log(followUp.body);
    console.log('\n' + '─'.repeat(80) + '\n');

    // Quality checks
    console.log('📊 Quality Checks:');
    const subjectLength = email.subject.length;
    const bodyLength = email.body.length;
    const bodyWordCount = email.body.split(/\s+/).length;

    console.log(`  Subject length: ${subjectLength} chars ${subjectLength <= 50 ? '✅' : '⚠️  (too long)'}`);
    console.log(`  Body length: ${bodyLength} chars`);
    console.log(`  Body word count: ${bodyWordCount} words ${bodyWordCount <= 150 ? '✅' : '⚠️  (too long)'}`);
    console.log(`  Contains lead name: ${email.body.includes(testLead.first_name) ? '✅' : '❌'}`);
    console.log(`  Contains company name: ${email.body.includes(testLead.company) ? '✅' : '⚠️'}`);
    console.log('');

    console.log('🎉 All tests passed! Email generation is working.');
    return true;
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('');
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run tests
if (require.main === module) {
  testEmailGeneration()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testEmailGeneration };
