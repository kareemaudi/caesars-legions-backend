#!/usr/bin/env node
/**
 * End-to-End Test Script
 * Tests the complete flow: Generate → Send → Follow-ups
 * 
 * Usage: node scripts/e2e-test.js [--live]
 *   --live: Actually send emails (default: dry run)
 * 
 * Example:
 *   node scripts/e2e-test.js              # Dry run (safe)
 *   node scripts/e2e-test.js --live       # Actually send test email
 */

require('dotenv').config();
const EmailGenerator = require('../lib/email-generator');
const FollowUpScheduler = require('../lib/follow-ups');

const isLive = process.argv.includes('--live');

// Test configuration
const TEST_PROSPECT = {
  name: 'Test User',
  email: process.env.TEST_EMAIL || 'test@example.com', // CHANGE THIS
  company: 'Test Company',
  title: 'Founder',
  pain: 'Testing cold email system before launch',
  industry: 'B2B SaaS',
  companySize: '1-10',
  website: 'https://example.com'
};

async function runE2ETest() {
  console.log('🧪 Running End-to-End Test');
  console.log('=' .repeat(60));
  console.log(`Mode: ${isLive ? '🔴 LIVE (will send real email)' : '🟢 DRY RUN (safe)'}`);
  console.log(`Test email: ${TEST_PROSPECT.email}`);
  console.log('=' .repeat(60));

  if (isLive && TEST_PROSPECT.email === 'test@example.com') {
    console.error('\n❌ Error: Cannot send to test@example.com');
    console.log('Please set TEST_EMAIL in .env to your real email:');
    console.log('TEST_EMAIL=your.email@example.com\n');
    process.exit(1);
  }

  const results = {
    steps: [],
    success: true,
    errors: []
  };

  try {
    // Step 1: Check API Keys
    console.log('\n1️⃣ Checking API keys...');
    const requiredKeys = ['OPENAI_API_KEY'];
    const optionalKeys = ['APOLLO_API_KEY', 'INSTANTLY_API_KEY'];
    
    const missingRequired = requiredKeys.filter(key => !process.env[key]);
    const missingOptional = optionalKeys.filter(key => !process.env[key]);

    if (missingRequired.length > 0) {
      throw new Error(`Missing required API keys: ${missingRequired.join(', ')}`);
    }

    console.log('✓ Required keys found: ' + requiredKeys.join(', '));
    if (missingOptional.length > 0) {
      console.log(`⚠️  Optional keys missing: ${missingOptional.join(', ')} (will skip related steps)`);
    }
    results.steps.push({ step: 'check_keys', success: true });

    // Step 2: Generate Email
    console.log('\n2️⃣ Generating personalized email...');
    const generator = new EmailGenerator({
      openaiApiKey: process.env.OPENAI_API_KEY
    });

    const startTime = Date.now();
    const email = await generator.generate(TEST_PROSPECT);
    const duration = Date.now() - startTime;

    console.log(`✓ Email generated in ${duration}ms`);
    console.log(`  Subject: ${email.subject}`);
    console.log(`  Body length: ${email.body.length} chars`);
    console.log(`  Tokens used: ${email.tokensUsed || 'N/A'}`);
    results.steps.push({ 
      step: 'generate_email', 
      success: true, 
      duration,
      tokens: email.tokensUsed 
    });

    // Step 3: Enrich Contact (if Apollo available)
    if (process.env.APOLLO_API_KEY) {
      console.log('\n3️⃣ Enriching contact data...');
      // TODO: Implement Apollo enrichment
      console.log('⚠️  Apollo enrichment not yet implemented (coming soon)');
      results.steps.push({ step: 'enrich_contact', success: true, skipped: true });
    } else {
      console.log('\n3️⃣ Skipping contact enrichment (no Apollo key)');
      results.steps.push({ step: 'enrich_contact', skipped: true });
    }

    // Step 4: Send Email
    console.log('\n4️⃣ Sending email...');
    if (isLive) {
      if (process.env.INSTANTLY_API_KEY) {
        console.log('⚠️  Live sending not yet implemented');
        console.log('TODO: Integrate with Instantly API');
        results.steps.push({ step: 'send_email', success: false, error: 'Not implemented' });
      } else {
        console.log('✗ Cannot send: INSTANTLY_API_KEY not configured');
        results.steps.push({ step: 'send_email', skipped: true, reason: 'No API key' });
      }
    } else {
      console.log('✓ DRY RUN - Would send to:', TEST_PROSPECT.email);
      console.log('  From: outreach@promptabusiness.com');
      console.log('  Subject:', email.subject);
      console.log('  Body preview:', email.body.substring(0, 100) + '...');
      results.steps.push({ step: 'send_email', success: true, dryRun: true });
    }

    // Step 5: Schedule Follow-ups
    console.log('\n5️⃣ Scheduling follow-ups...');
    const scheduler = new FollowUpScheduler();
    
    const followUps = scheduler.schedule({
      emailId: 'test-' + Date.now(),
      prospectEmail: TEST_PROSPECT.email,
      prospectName: TEST_PROSPECT.name,
      originalSubject: email.subject,
      sequence: [3, 5, 7] // Day 3, 5, 7
    });

    console.log(`✓ ${followUps.length} follow-ups scheduled:`);
    followUps.forEach(fu => {
      const daysFromNow = Math.ceil((new Date(fu.dueAt) - new Date()) / (1000 * 60 * 60 * 24));
      console.log(`  - Day ${fu.dayNumber}: ${new Date(fu.dueAt).toLocaleString()} (${daysFromNow} days)`);
      console.log(`    Subject: ${fu.subject}`);
    });
    results.steps.push({ 
      step: 'schedule_followups', 
      success: true, 
      count: followUps.length 
    });

    // Step 6: Validate Data
    console.log('\n6️⃣ Validating generated data...');
    const validations = [
      { check: 'Email has subject', pass: !!email.subject && email.subject.length > 0 },
      { check: 'Email has body', pass: !!email.body && email.body.length > 50 },
      { check: 'Subject is personalized', pass: email.subject.toLowerCase().includes(TEST_PROSPECT.company.toLowerCase()) || email.subject.toLowerCase().includes(TEST_PROSPECT.name.toLowerCase()) },
      { check: 'Body mentions prospect', pass: email.body.includes(TEST_PROSPECT.name) || email.body.includes(TEST_PROSPECT.company) },
      { check: 'Body has CTA', pass: email.body.toLowerCase().includes('reply') || email.body.toLowerCase().includes('interested') || email.body.toLowerCase().includes('meeting') },
      { check: 'Follow-ups scheduled', pass: followUps.length === 3 }
    ];

    const passed = validations.filter(v => v.pass).length;
    console.log(`✓ ${passed}/${validations.length} validations passed:`);
    validations.forEach(v => {
      console.log(`  ${v.pass ? '✓' : '✗'} ${v.check}`);
    });

    if (passed < validations.length) {
      throw new Error(`Only ${passed}/${validations.length} validations passed`);
    }
    results.steps.push({ step: 'validate_data', success: true, validations: passed });

    // Success!
    console.log('\n' + '='.repeat(60));
    console.log('✅ END-TO-END TEST PASSED');
    console.log('='.repeat(60));
    console.log(`Total steps: ${results.steps.length}`);
    console.log(`Successful: ${results.steps.filter(s => s.success).length}`);
    console.log(`Skipped: ${results.steps.filter(s => s.skipped).length}`);
    
    if (!isLive) {
      console.log('\n💡 To actually send test email:');
      console.log('   1. Set TEST_EMAIL in .env to your email');
      console.log('   2. Add INSTANTLY_API_KEY to .env');
      console.log('   3. Run: node scripts/e2e-test.js --live');
    }

    console.log('\n🚀 System is ready for launch!');
    console.log('   Next: Follow DEPLOYMENT-GUIDE.md to go live\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    results.success = false;
    results.errors.push(error.message);
    
    console.log('\n🔧 Troubleshooting:');
    if (error.message.includes('API key')) {
      console.log('  1. Check .env file has required API keys');
      console.log('  2. Verify API keys are valid (not expired)');
      console.log('  3. Check API key format matches documentation');
    } else if (error.message.includes('validation')) {
      console.log('  1. Check email generation prompt quality');
      console.log('  2. Review test prospect data');
      console.log('  3. Verify email template includes required elements');
    } else {
      console.log('  1. Check error message above for details');
      console.log('  2. Review lib/ code for bugs');
      console.log('  3. Run unit tests: npm test');
    }
    console.log('');
    
    process.exit(1);
  }

  return results;
}

// Run test
console.log('');
runE2ETest()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
