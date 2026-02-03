#!/usr/bin/env node
/**
 * Test Email Generation Script
 * Tests email generation without actually sending emails
 * 
 * Usage: node scripts/test-email-generation.js
 */

require('dotenv').config();
const EmailGenerator = require('../lib/email-generator');

const testProspects = [
  {
    name: 'John Doe',
    company: 'Acme SaaS',
    title: 'Founder & CEO',
    pain: 'Struggling with cold email outreach, spending 10 hours/week',
    industry: 'B2B SaaS',
    companySize: '10-50',
    website: 'https://acmesaas.com',
    recentActivity: 'Posted on X about hiring first sales hire'
  },
  {
    name: 'Sarah Chen',
    company: 'DataFlow Analytics',
    title: 'Head of Growth',
    pain: 'Low reply rates on current outbound campaigns',
    industry: 'Data Analytics',
    companySize: '50-200',
    website: 'https://dataflow.io',
    recentActivity: 'Mentioned needing better lead generation in podcast'
  },
  {
    name: 'Mike Johnson',
    company: 'CloudSync',
    title: 'VP Sales',
    pain: 'Need to scale outbound without hiring more SDRs',
    industry: 'Cloud Infrastructure',
    companySize: '200-500',
    website: 'https://cloudsync.com',
    recentActivity: 'Company just raised Series B, expanding into enterprise'
  }
];

async function testEmailGeneration() {
  console.log('🧪 Testing Email Generation\n');
  console.log('=' .repeat(60));

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found in .env');
    console.log('\nPlease add OpenAI API key to .env file:');
    console.log('OPENAI_API_KEY=sk-...\n');
    process.exit(1);
  }

  const generator = new EmailGenerator({
    openaiApiKey: process.env.OPENAI_API_KEY
  });

  let totalTokens = 0;
  const results = [];

  for (const prospect of testProspects) {
    console.log(`\n📧 Generating email for ${prospect.name} (${prospect.company})`);
    console.log('-'.repeat(60));

    try {
      const startTime = Date.now();
      const email = await generator.generate(prospect);
      const duration = Date.now() - startTime;

      console.log(`✓ Generated in ${duration}ms`);
      console.log(`\nSubject: ${email.subject}`);
      console.log(`\nBody (${email.body.length} chars):\n`);
      console.log(email.body);
      console.log(`\nTokens used: ${email.tokensUsed || 'N/A'}`);
      console.log(`Estimated cost: $${((email.tokensUsed || 0) * 0.000002).toFixed(4)}`);

      totalTokens += email.tokensUsed || 0;
      results.push({
        prospect: prospect.name,
        success: true,
        tokens: email.tokensUsed,
        duration,
        subject: email.subject,
        bodyLength: email.body.length
      });

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      results.push({
        prospect: prospect.name,
        success: false,
        error: error.message
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success).length;
  console.log(`✓ Successful: ${successful}/${results.length}`);
  console.log(`✓ Total tokens: ${totalTokens.toLocaleString()}`);
  console.log(`✓ Total cost: $${(totalTokens * 0.000002).toFixed(4)}`);
  console.log(`✓ Avg tokens/email: ${Math.round(totalTokens / successful)}`);
  console.log(`✓ Cost per 100 emails: $${((totalTokens / successful) * 100 * 0.000002).toFixed(2)}`);

  console.log('\n💡 Next Steps:');
  console.log('  1. Review generated emails above');
  console.log('  2. Check personalization quality');
  console.log('  3. Verify CTAs are clear');
  console.log('  4. If satisfied, run: node scripts/e2e-test.js');
  console.log('');
}

// Run test
testEmailGeneration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
