const { generateEmail } = require('../lib/email-generator.js');

const testLead = {
  first_name: 'Sarah',
  last_name: 'Chen',
  title: 'VP Sales',
  company: 'TechFlow Inc',
  email: 'sarah@techflow.io'
};

const testClient = {
  company: "Caesar's Legions",
  name: 'Kareem',
  value_prop: 'AI-powered cold email that gets 5%+ reply rates',
  target_audience: 'B2B SaaS companies'
};

console.log('Testing email generation...\n');

generateEmail({ lead: testLead, client: testClient })
  .then(result => {
    console.log('✅ EMAIL GENERATION TEST PASSED\n');
    console.log('Subject:', result.subject);
    console.log('\nBody:', result.body);
    console.log('\nMetadata:', result.personalization_data);
  })
  .catch(err => {
    console.error('❌ TEST FAILED:', err.message);
    console.error(err);
    process.exit(1);
  });
