#!/usr/bin/env node
/**
 * Test email generation with real OpenAI API
 */

require('dotenv').config();
const { generateEmail } = require('../lib/email-generator');

const testLead = {
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  company: 'Acme Corp',
  title: 'VP of Sales'
};

const testClient = {
  company: "Caesar's Legions",
  value_prop: 'AI-powered cold email that gets 4-5% reply rates. Pay per meeting booked, not per email sent.',
  target_audience: 'B2B SaaS founders at $500K-$5M ARR',
  name: 'Kareem'
};

console.log('🧪 Testing Email Generation\n');
console.log('Lead:', testLead);
console.log('Client:', testClient);
console.log('\nGenerating...\n');

generateEmail({ 
  lead: testLead, 
  client: testClient 
})
  .then(result => {
    console.log('✅ SUCCESS!\n');
    console.log('Subject:', result.subject);
    console.log('\nBody:');
    console.log(result.body);
    console.log('\nPersonalization Data:', result.personalization_data);
  })
  .catch(error => {
    console.error('❌ FAILED:', error.message);
    process.exit(1);
  });
