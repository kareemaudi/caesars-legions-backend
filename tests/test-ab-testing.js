// ============================================================================
// A/B TESTING FRAMEWORK - Tests
// ============================================================================

const { 
  ABTestManager, 
  TEST_TYPES, 
  METRICS, 
  TEST_TEMPLATES,
  calculateSignificance,
  InMemoryDB 
} = require('../lib/ab-testing');

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAILED: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
  console.log('\n🧪 A/B Testing Framework Tests\n');
  console.log('='.repeat(50));
  
  const db = new InMemoryDB();
  const abTest = new ABTestManager(db);

  // =========================================================================
  // TEST 1: Statistical Significance Calculator
  // =========================================================================
  console.log('\n📊 Test 1: Statistical Significance Calculator\n');

  // Clear winner: Variant significantly better
  const clearWinner = calculateSignificance(10, 100, 25, 100);
  assert(clearWinner.isSignificant, 'Clear winner should be significant');
  assert(clearWinner.recommendation.includes('WINNER_VARIANT'), 
    'Should recommend variant as winner');
  console.log('   Clear winner analysis:', clearWinner.recommendation);

  // No winner: Similar performance
  const noWinner = calculateSignificance(15, 100, 16, 100);
  assert(!noWinner.isSignificant, 'Similar performance should not be significant');
  assert(noWinner.recommendation.includes('NOT_SIGNIFICANT'), 
    'Should recommend more testing');
  console.log('   No winner analysis:', noWinner.recommendation);

  // Control wins: Variant worse
  const controlWins = calculateSignificance(30, 100, 10, 100);
  assert(controlWins.isSignificant, 'Control win should be significant');
  assert(controlWins.recommendation.includes('CONTROL'), 
    'Should recommend keeping control');
  console.log('   Control wins analysis:', controlWins.recommendation);

  // =========================================================================
  // TEST 2: Create A/B Test
  // =========================================================================
  console.log('\n📝 Test 2: Create A/B Test\n');

  const testConfig = TEST_TEMPLATES.subjectLine([
    "Quick question about {company}",
    "{firstName} - growth opportunity",
    "Saw {company} on LinkedIn"
  ]);

  const test = await abTest.createTest(testConfig);
  
  assert(test.id.startsWith('test_'), 'Test ID should have correct prefix');
  assert(test.variants.length === 3, 'Should have 3 variants');
  assert(test.variants[0].isControl, 'First variant should be control');
  assert(!test.variants[1].isControl, 'Other variants should not be control');
  assert(test.status === 'active', 'Test should be active');
  console.log('   Created test:', test.id);
  console.log('   Variants:', test.variants.map(v => v.name).join(', '));

  // =========================================================================
  // TEST 3: Variant Assignment
  // =========================================================================
  console.log('\n🎲 Test 3: Variant Assignment\n');

  // Assign variants to multiple recipients
  const assignments = {};
  for (let i = 0; i < 100; i++) {
    const variant = await abTest.assignVariant(test.id, `recipient_${i}`);
    assignments[variant.id] = (assignments[variant.id] || 0) + 1;
  }

  console.log('   Distribution:', assignments);
  
  // All variants should get some assignments
  assert(Object.keys(assignments).length >= 2, 
    'Multiple variants should receive assignments');

  // Same recipient should get same variant (consistency)
  const v1 = await abTest.assignVariant(test.id, 'recipient_0');
  const v2 = await abTest.assignVariant(test.id, 'recipient_0');
  assert(v1.id === v2.id, 'Same recipient should get consistent variant');
  console.log('   Consistency check passed');

  // =========================================================================
  // TEST 4: Event Recording
  // =========================================================================
  console.log('\n📈 Test 4: Event Recording\n');

  // Record events for recipients
  for (let i = 0; i < 50; i++) {
    await abTest.recordEvent(test.id, `recipient_${i}`, 'sent');
  }

  // Open events (30 of 50)
  for (let i = 0; i < 30; i++) {
    await abTest.recordEvent(test.id, `recipient_${i}`, 'opened');
  }

  // Reply events (10 of 50)
  for (let i = 0; i < 10; i++) {
    await abTest.recordEvent(test.id, `recipient_${i}`, 'replied');
  }

  const updatedTest = await db.get('ab_tests', test.id);
  const totalSent = updatedTest.variants.reduce((sum, v) => sum + v.stats.sent, 0);
  const totalOpened = updatedTest.variants.reduce((sum, v) => sum + v.stats.opened, 0);
  const totalReplied = updatedTest.variants.reduce((sum, v) => sum + v.stats.replied, 0);

  assert(totalSent === 50, `Total sent should be 50, got ${totalSent}`);
  assert(totalOpened === 30, `Total opened should be 30, got ${totalOpened}`);
  assert(totalReplied === 10, `Total replied should be 10, got ${totalReplied}`);
  console.log(`   Stats recorded: ${totalSent} sent, ${totalOpened} opened, ${totalReplied} replied`);

  // =========================================================================
  // TEST 5: Test Analysis
  // =========================================================================
  console.log('\n🔍 Test 5: Test Analysis\n');

  const analysis = await abTest.analyzeTest(test.id);
  
  assert(analysis.testId === test.id, 'Analysis should reference correct test');
  assert(analysis.variantResults.length === 3, 'Should analyze all variants');
  assert(analysis.primaryMetric === METRICS.OPEN_RATE, 'Should use correct primary metric');
  
  console.log('   Analysis summary:');
  analysis.variantResults.forEach(r => {
    console.log(`   - ${r.variantName}: ${r.primaryMetricRate} open rate`);
    if (r.vsControl) {
      console.log(`     vs Control: ${r.vsControl.relativeLift} lift, ${r.vsControl.confidence} confidence`);
    }
  });

  // =========================================================================
  // TEST 6: Test Templates
  // =========================================================================
  console.log('\n📋 Test 6: Test Templates\n');

  // CTA test
  const ctaTest = TEST_TEMPLATES.cta([
    "Schedule a call?",
    "Worth 15 minutes?",
    "Reply to chat",
    "Book time here: [link]"
  ]);
  assert(ctaTest.type === TEST_TYPES.CTA, 'CTA template should have correct type');
  assert(ctaTest.primaryMetric === METRICS.REPLY_RATE, 'CTA should optimize for replies');
  console.log('   ✓ CTA template valid');

  // Send time test
  const sendTimeTest = TEST_TEMPLATES.sendTime([
    { day: 'Tuesday', time: '9:00 AM' },
    { day: 'Tuesday', time: '2:00 PM' },
    { day: 'Thursday', time: '10:00 AM' }
  ]);
  assert(sendTimeTest.type === TEST_TYPES.SEND_TIME, 'Send time template correct type');
  console.log('   ✓ Send time template valid');

  // Follow-up timing test
  const followUpTest = TEST_TEMPLATES.followUpTiming([48, 72, 96, 120]);
  assert(followUpTest.type === TEST_TYPES.FOLLOW_UP_TIMING, 'Follow-up template correct type');
  console.log('   ✓ Follow-up timing template valid');

  // =========================================================================
  // TEST 7: End Test & Winner Selection
  // =========================================================================
  console.log('\n🏆 Test 7: End Test & Winner\n');

  // Create a test with clear performance difference
  const winnerTest = await abTest.createTest({
    name: 'Winner Test',
    type: TEST_TYPES.EMAIL_BODY,
    primaryMetric: METRICS.REPLY_RATE,
    variants: [
      { name: 'Control', content: { body: 'Original body' } },
      { name: 'Better', content: { body: 'Improved body' } }
    ],
    minSampleSize: 20
  });

  // Simulate clear winner (variant much better)
  // Control: 5% reply rate
  for (let i = 0; i < 100; i++) {
    await abTest.assignVariant(winnerTest.id, `ctrl_${i}`);
    await db.increment('ab_tests', winnerTest.id, 'variants.0.stats.sent', 1);
    if (i < 5) {
      await db.increment('ab_tests', winnerTest.id, 'variants.0.stats.replied', 1);
    }
  }

  // Variant: 20% reply rate
  for (let i = 0; i < 100; i++) {
    const suffix = i + 100;
    await abTest.assignVariant(winnerTest.id, `var_${suffix}`);
    // Manually increment variant stats
  }
  
  // Directly set stats for cleaner test
  const wtData = await db.get('ab_tests', winnerTest.id);
  wtData.variants[0].stats = { sent: 100, replied: 5 }; // 5% reply rate
  wtData.variants[1].stats = { sent: 100, replied: 20 }; // 20% reply rate

  // End test
  const endResult = await abTest.endTest(winnerTest.id, 'manual_test');
  const endedTest = await db.get('ab_tests', winnerTest.id);
  
  assert(endedTest.status === 'completed', 'Test should be completed');
  assert(endedTest.winner !== null, 'Should have a winner');
  console.log(`   Test ended. Winner: ${endedTest.winner}`);

  // =========================================================================
  // TEST 8: Get Winning Content
  // =========================================================================
  console.log('\n📦 Test 8: Get Winning Content\n');

  const winningContent = await abTest.getWinningContent(TEST_TYPES.EMAIL_BODY);
  assert(winningContent !== null, 'Should return winning content');
  console.log('   Winning content retrieved:', winningContent);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(50));
  console.log('✅ All A/B Testing Framework tests passed!');
  console.log('='.repeat(50) + '\n');

  return { success: true, testsRun: 8 };
}

// Run tests
runTests()
  .then(result => {
    console.log('Tests completed:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
