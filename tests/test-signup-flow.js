// ============================================================================
// TEST: Signup & Onboarding Flow
// ============================================================================
// Tests the full signup flow (without actual Stripe calls)
// Run: node tests/test-signup-flow.js
// ============================================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { startOnboarding, createClientProfile, generateICP, setupInitialCampaign } = require('../api/onboarding');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  TESTING: Signup & Onboarding Flow');
console.log('═══════════════════════════════════════════════════════════════\n');

async function runTests() {
  let passed = 0;
  let failed = 0;

  // Test 1: Create Client Profile
  console.log('TEST 1: Create Client Profile');
  try {
    const profile = await createClientProfile({
      customerId: 'cus_test_123',
      email: 'test@example.com',
      name: 'Test User',
      company: 'Test SaaS Co',
      website: 'https://testsaas.com',
      painPoint: 'Low reply rates on cold email',
      targetAudience: 'HR Directors at 100-500 person tech companies',
      subscriptionId: 'sub_test_123'
    });

    console.log('  ✅ Profile created:', profile.id);
    console.log('     Company:', profile.company);
    console.log('     Plan:', profile.plan);
    console.log('     MRR:', profile.mrr);
    passed++;
  } catch (err) {
    console.log('  ❌ FAILED:', err.message);
    failed++;
  }
  console.log();

  // Test 2: Generate ICP
  console.log('TEST 2: Generate ICP');
  try {
    const icp = await generateICP({
      company: 'Test SaaS Co',
      website: 'https://testsaas.com',
      targetAudience: 'VP of Sales at B2B SaaS companies with 50-200 employees',
      painPoint: 'Spending too much time on manual outreach'
    });

    console.log('  ✅ ICP generated');
    console.log('     Verticals:', icp.suggested_verticals.join(', '));
    console.log('     Titles:', icp.lead_criteria.titles.slice(0, 3).join(', '));
    console.log('     Company size:', JSON.stringify(icp.lead_criteria.company_size));
    passed++;
  } catch (err) {
    console.log('  ❌ FAILED:', err.message);
    failed++;
  }
  console.log();

  // Test 3: ICP parsing edge cases
  console.log('TEST 3: ICP Parsing (Edge Cases)');
  try {
    const icpEnterprise = await generateICP({
      company: 'Enterprise Co',
      targetAudience: 'CTOs at enterprise fintech companies with 1000+ employees'
    });

    const icpStartup = await generateICP({
      company: 'Startup Inc',
      targetAudience: 'Founders of early-stage startups'
    });

    console.log('  ✅ Enterprise ICP:');
    console.log('     Size:', JSON.stringify(icpEnterprise.lead_criteria.company_size));
    console.log('     Verticals:', icpEnterprise.suggested_verticals.join(', '));

    console.log('  ✅ Startup ICP:');
    console.log('     Size:', JSON.stringify(icpStartup.lead_criteria.company_size));
    console.log('     Titles:', icpStartup.lead_criteria.titles.slice(0, 3).join(', '));
    passed++;
  } catch (err) {
    console.log('  ❌ FAILED:', err.message);
    failed++;
  }
  console.log();

  // Test 4: Setup Initial Campaign
  console.log('TEST 4: Setup Initial Campaign');
  try {
    const icp = await generateICP({
      company: 'Campaign Test Co',
      targetAudience: 'Marketing directors'
    });

    const campaign = await setupInitialCampaign('client_test_456', icp);

    console.log('  ✅ Campaign created:', campaign.id);
    console.log('     Name:', campaign.name);
    console.log('     Sequence steps:', campaign.email_sequence.length);
    console.log('     Step 1:', campaign.email_sequence[0].type, '(day', campaign.email_sequence[0].delay_days + ')');
    console.log('     Step 2:', campaign.email_sequence[1].type, '(day', campaign.email_sequence[1].delay_days + ')');
    passed++;
  } catch (err) {
    console.log('  ❌ FAILED:', err.message);
    failed++;
  }
  console.log();

  // Test 5: Full Onboarding Flow (simulated)
  console.log('TEST 5: Full Onboarding Flow');
  try {
    const result = await startOnboarding({
      customerId: 'cus_full_test',
      email: 'fulltest@example.com',
      name: 'Full Test User',
      company: 'Full Test Inc',
      website: 'https://fulltest.io',
      painPoint: 'Need more meetings booked',
      targetAudience: 'CEOs of mid-market SaaS companies',
      subscriptionId: 'sub_full_test',
      sessionId: 'sess_full_test'
    });

    console.log('  ✅ Onboarding completed');
    console.log('     Status:', result.status);
    console.log('     Steps completed:', result.steps.length);
    result.steps.forEach(step => {
      console.log(`       - ${step.step}: ${step.status}`);
    });
    passed++;
  } catch (err) {
    console.log('  ❌ FAILED:', err.message);
    failed++;
  }
  console.log();

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════');

  // Check Stripe config
  console.log('\n📋 STRIPE CONFIGURATION CHECK:');
  console.log(`  STRIPE_SECRET_KEY: ${process.env.STRIPE_SECRET_KEY ? '✅ Set' : '⚠️ Not set (required for payments)'}`);
  console.log(`  STRIPE_WEBHOOK_SECRET: ${process.env.STRIPE_WEBHOOK_SECRET ? '✅ Set' : '⚠️ Not set (optional for dev)'}`);
  console.log(`  BASE_URL: ${process.env.BASE_URL || 'http://localhost:3001'}`);
  console.log(`  CALENDLY_LINK: ${process.env.CALENDLY_LINK || 'Not set'}`);

  console.log('\n💡 To enable payments, add Stripe keys to .env');
  console.log('   Get them from: https://dashboard.stripe.com/apikeys\n');

  return failed === 0;
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
