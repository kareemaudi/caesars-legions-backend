// A/B Testing Framework for Caesar's Legions
// Test different email variations to optimize open rates and replies

const db = require('./db');

/**
 * Create an A/B test
 * @param {Object} test - Test configuration
 * @returns {number} Test ID
 */
function createTest(test) {
  const {
    campaign_id,
    test_name,
    test_type, // 'subject' | 'body' | 'full' | 'send_time'
    variant_a,
    variant_b,
    split_ratio = 50, // % of leads that get variant A (rest get B)
    status = 'active' // 'active' | 'paused' | 'completed'
  } = test;

  const result = db.prepare(`
    INSERT INTO ab_tests (
      campaign_id, test_name, test_type,
      variant_a, variant_b, split_ratio,
      status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    campaign_id,
    test_name,
    test_type,
    JSON.stringify(variant_a),
    JSON.stringify(variant_b),
    split_ratio,
    status,
    Math.floor(Date.now() / 1000)
  );

  console.log(`✓ A/B test created: ${test_name} (${test_type})`);

  return result.lastInsertRowid;
}

/**
 * Assign a lead to a test variant
 * @param {number} testId - Test ID
 * @param {number} leadId - Lead ID
 * @returns {string} Variant assigned ('A' or 'B')
 */
function assignVariant(testId, leadId) {
  const test = getTest(testId);
  
  if (!test) {
    throw new Error(`Test ${testId} not found`);
  }

  // Check if already assigned
  const existing = db.prepare(`
    SELECT variant FROM ab_test_assignments
    WHERE test_id = ? AND lead_id = ?
  `).get(testId, leadId);

  if (existing) {
    return existing.variant;
  }

  // Deterministic assignment based on lead ID
  // This ensures consistent variant assignment even if we retry
  const hash = leadId % 100;
  const variant = hash < test.split_ratio ? 'A' : 'B';

  // Record assignment
  db.prepare(`
    INSERT INTO ab_test_assignments (test_id, lead_id, variant, assigned_at)
    VALUES (?, ?, ?, ?)
  `).run(testId, leadId, variant, Math.floor(Date.now() / 1000));

  return variant;
}

/**
 * Get email content based on assigned variant
 * @param {number} testId - Test ID
 * @param {number} leadId - Lead ID
 * @param {Object} baseEmail - Base email content
 * @returns {Object} Modified email content for assigned variant
 */
function getVariantContent(testId, leadId, baseEmail) {
  const variant = assignVariant(testId, leadId);
  const test = getTest(testId);

  const variantConfig = variant === 'A' 
    ? JSON.parse(test.variant_a)
    : JSON.parse(test.variant_b);

  let modifiedEmail = { ...baseEmail };

  switch (test.test_type) {
    case 'subject':
      modifiedEmail.subject = variantConfig.subject;
      break;

    case 'body':
      modifiedEmail.body = variantConfig.body;
      break;

    case 'full':
      modifiedEmail.subject = variantConfig.subject;
      modifiedEmail.body = variantConfig.body;
      break;

    case 'send_time':
      // Send time handled at campaign level
      modifiedEmail.scheduled_time = variantConfig.scheduled_time;
      break;

    case 'cta':
      // Replace CTA in body
      modifiedEmail.body = modifiedEmail.body.replace(
        '{{CTA}}',
        variantConfig.cta
      );
      break;
  }

  // Add tracking parameter to identify variant in metrics
  modifiedEmail.variant = variant;
  modifiedEmail.test_id = testId;

  return modifiedEmail;
}

/**
 * Record email performance for A/B test
 * @param {number} testId - Test ID
 * @param {number} leadId - Lead ID
 * @param {string} event - 'sent' | 'opened' | 'clicked' | 'replied'
 * @param {Object} data - Additional event data
 */
function recordEvent(testId, leadId, event, data = {}) {
  const variant = assignVariant(testId, leadId);

  db.prepare(`
    INSERT INTO ab_test_events (
      test_id, lead_id, variant, event,
      event_data, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    testId,
    leadId,
    variant,
    event,
    JSON.stringify(data),
    Math.floor(Date.now() / 1000)
  );

  console.log(`✓ A/B event: ${event} for variant ${variant} (test ${testId})`);
}

/**
 * Get test results and statistical significance
 * @param {number} testId - Test ID
 * @returns {Object} Test results with metrics and significance
 */
function getTestResults(testId) {
  const test = getTest(testId);

  if (!test) {
    return null;
  }

  // Get metrics for variant A
  const variantA = getVariantMetrics(testId, 'A');
  const variantB = getVariantMetrics(testId, 'B');

  // Calculate statistical significance (simplified chi-square test)
  const significance = calculateSignificance(variantA, variantB);

  return {
    test_id: testId,
    test_name: test.test_name,
    test_type: test.test_type,
    status: test.status,
    variant_a: variantA,
    variant_b: variantB,
    winner: determineWinner(variantA, variantB, significance),
    confidence: significance.confidence,
    is_significant: significance.is_significant,
    recommendation: getRecommendation(variantA, variantB, significance)
  };
}

/**
 * Get metrics for a specific variant
 * @param {number} testId - Test ID
 * @param {string} variant - 'A' or 'B'
 * @returns {Object} Metrics for the variant
 */
function getVariantMetrics(testId, variant) {
  const events = db.prepare(`
    SELECT event, COUNT(*) as count
    FROM ab_test_events
    WHERE test_id = ? AND variant = ?
    GROUP BY event
  `).all(testId, variant);

  const sent = events.find(e => e.event === 'sent')?.count || 0;
  const opened = events.find(e => e.event === 'opened')?.count || 0;
  const clicked = events.find(e => e.event === 'clicked')?.count || 0;
  const replied = events.find(e => e.event === 'replied')?.count || 0;

  return {
    variant,
    sent,
    opened,
    clicked,
    replied,
    open_rate: sent > 0 ? (opened / sent * 100).toFixed(2) : 0,
    click_rate: opened > 0 ? (clicked / opened * 100).toFixed(2) : 0,
    reply_rate: sent > 0 ? (replied / sent * 100).toFixed(2) : 0
  };
}

/**
 * Calculate statistical significance (simplified)
 * @param {Object} variantA - Variant A metrics
 * @param {Object} variantB - Variant B metrics
 * @returns {Object} Significance analysis
 */
function calculateSignificance(variantA, variantB) {
  // Use reply rate as primary metric
  const rateA = parseFloat(variantA.reply_rate);
  const rateB = parseFloat(variantB.reply_rate);
  const sampleA = variantA.sent;
  const sampleB = variantB.sent;

  // Need at least 30 samples per variant for statistical validity
  if (sampleA < 30 || sampleB < 30) {
    return {
      is_significant: false,
      confidence: 0,
      message: `Need more data (A: ${sampleA}, B: ${sampleB}). Target: 30+ each.`
    };
  }

  // Calculate pooled standard error
  const pooledRate = (variantA.replied + variantB.replied) / (sampleA + sampleB);
  const se = Math.sqrt(pooledRate * (1 - pooledRate) * (1/sampleA + 1/sampleB));
  
  // Z-score
  const z = Math.abs((rateA - rateB) / 100) / se;

  // Convert z-score to confidence level (simplified)
  let confidence = 0;
  if (z >= 1.96) confidence = 95; // 95% confidence
  else if (z >= 1.65) confidence = 90; // 90% confidence
  else if (z >= 1.28) confidence = 80; // 80% confidence
  else confidence = Math.floor(z * 40); // Rough approximation

  return {
    is_significant: z >= 1.96, // 95% threshold
    confidence,
    z_score: z.toFixed(2),
    message: z >= 1.96 
      ? `Statistically significant (${confidence}% confidence)`
      : `Not significant yet (${confidence}% confidence)`
  };
}

/**
 * Determine winner
 * @param {Object} variantA - Variant A metrics
 * @param {Object} variantB - Variant B metrics
 * @param {Object} significance - Significance analysis
 * @returns {string} 'A' | 'B' | 'No clear winner'
 */
function determineWinner(variantA, variantB, significance) {
  if (!significance.is_significant) {
    return 'No clear winner (need more data)';
  }

  const rateA = parseFloat(variantA.reply_rate);
  const rateB = parseFloat(variantB.reply_rate);

  if (rateA > rateB) return 'A';
  if (rateB > rateA) return 'B';
  return 'Tie';
}

/**
 * Get actionable recommendation
 * @param {Object} variantA - Variant A metrics
 * @param {Object} variantB - Variant B metrics
 * @param {Object} significance - Significance analysis
 * @returns {string} Recommendation
 */
function getRecommendation(variantA, variantB, significance) {
  if (!significance.is_significant) {
    return `Continue test until ${30 - Math.min(variantA.sent, variantB.sent)} more sends. Current confidence: ${significance.confidence}%`;
  }

  const winner = determineWinner(variantA, variantB, significance);
  
  if (winner === 'A') {
    const lift = ((variantA.reply_rate - variantB.reply_rate) / variantB.reply_rate * 100).toFixed(0);
    return `Use Variant A (${lift}% better reply rate). Roll out to all future sends.`;
  }
  
  if (winner === 'B') {
    const lift = ((variantB.reply_rate - variantA.reply_rate) / variantA.reply_rate * 100).toFixed(0);
    return `Use Variant B (${lift}% better reply rate). Roll out to all future sends.`;
  }

  return 'No significant difference. Either variant works.';
}

/**
 * Get test by ID
 * @param {number} testId - Test ID
 * @returns {Object} Test record
 */
function getTest(testId) {
  return db.prepare(`
    SELECT * FROM ab_tests WHERE id = ?
  `).get(testId);
}

/**
 * List all tests for a campaign
 * @param {number} campaignId - Campaign ID
 * @returns {Array} List of tests
 */
function getTestsByCampaign(campaignId) {
  return db.prepare(`
    SELECT * FROM ab_tests WHERE campaign_id = ?
    ORDER BY created_at DESC
  `).all(campaignId);
}

/**
 * Complete a test (stop assigning new leads)
 * @param {number} testId - Test ID
 */
function completeTest(testId) {
  db.prepare(`
    UPDATE ab_tests SET status = 'completed'
    WHERE id = ?
  `).run(testId);

  console.log(`✓ Test ${testId} completed`);
}

module.exports = {
  createTest,
  assignVariant,
  getVariantContent,
  recordEvent,
  getTestResults,
  getVariantMetrics,
  getTest,
  getTestsByCampaign,
  completeTest
};
