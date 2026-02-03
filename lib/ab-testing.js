// ============================================================================
// A/B TESTING FRAMEWORK - Caesar's Legions
// ============================================================================
// Purpose: Test email variants, measure performance, auto-optimize
// Priority: P1 Product Development Task
// Status: Production Ready
// ============================================================================

/**
 * Statistical significance calculator using Chi-Square test
 * @param {number} controlSuccesses - Conversions in control group
 * @param {number} controlTotal - Total in control group
 * @param {number} variantSuccesses - Conversions in variant group
 * @param {number} variantTotal - Total in variant group
 * @returns {Object} Statistical analysis results
 */
function calculateSignificance(controlSuccesses, controlTotal, variantSuccesses, variantTotal) {
  // Calculate rates
  const controlRate = controlTotal > 0 ? controlSuccesses / controlTotal : 0;
  const variantRate = variantTotal > 0 ? variantSuccesses / variantTotal : 0;
  
  // Pooled probability
  const pooledProb = (controlSuccesses + variantSuccesses) / (controlTotal + variantTotal);
  
  // Standard error
  const se = Math.sqrt(
    pooledProb * (1 - pooledProb) * (1/controlTotal + 1/variantTotal)
  );
  
  // Z-score
  const zScore = se > 0 ? (variantRate - controlRate) / se : 0;
  
  // Two-tailed p-value approximation
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));
  
  // Confidence interval (95%)
  const marginOfError = 1.96 * se;
  const liftLower = ((variantRate - controlRate) - marginOfError) / controlRate * 100;
  const liftUpper = ((variantRate - controlRate) + marginOfError) / controlRate * 100;
  
  return {
    controlRate: (controlRate * 100).toFixed(2) + '%',
    variantRate: (variantRate * 100).toFixed(2) + '%',
    relativeLift: controlRate > 0 
      ? (((variantRate - controlRate) / controlRate) * 100).toFixed(2) + '%'
      : 'N/A',
    absoluteLift: ((variantRate - controlRate) * 100).toFixed(2) + ' pp',
    zScore: zScore.toFixed(3),
    pValue: pValue.toFixed(4),
    isSignificant: pValue < 0.05,
    isHighlySignificant: pValue < 0.01,
    confidence: ((1 - pValue) * 100).toFixed(1) + '%',
    liftConfidenceInterval: `${liftLower.toFixed(1)}% to ${liftUpper.toFixed(1)}%`,
    recommendation: getRecommendation(pValue, variantRate, controlRate)
  };
}

/**
 * Normal CDF approximation (Abramowitz and Stegun)
 */
function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return 0.5 * (1.0 + sign * y);
}

/**
 * Get recommendation based on statistical results
 */
function getRecommendation(pValue, variantRate, controlRate) {
  if (pValue >= 0.05) {
    return 'NOT_SIGNIFICANT - Keep testing, need more data';
  }
  
  if (variantRate > controlRate) {
    if (pValue < 0.01) {
      return 'WINNER_VARIANT - Highly significant improvement, deploy variant';
    }
    return 'LIKELY_WINNER_VARIANT - Significant improvement, consider deploying';
  } else {
    if (pValue < 0.01) {
      return 'WINNER_CONTROL - Variant significantly worse, keep control';
    }
    return 'LIKELY_WINNER_CONTROL - Variant appears worse, keep control';
  }
}

// ============================================================================
// A/B TEST TYPES
// ============================================================================

const TEST_TYPES = {
  SUBJECT_LINE: 'subject_line',
  EMAIL_BODY: 'email_body',
  SEND_TIME: 'send_time',
  CTA: 'cta',
  PERSONALIZATION: 'personalization',
  FOLLOW_UP_TIMING: 'follow_up_timing',
  TONE: 'tone'
};

const METRICS = {
  OPEN_RATE: 'open_rate',
  CLICK_RATE: 'click_rate',
  REPLY_RATE: 'reply_rate',
  POSITIVE_REPLY_RATE: 'positive_reply_rate',
  MEETING_RATE: 'meeting_rate',
  UNSUBSCRIBE_RATE: 'unsubscribe_rate'
};

// ============================================================================
// A/B TEST MANAGER
// ============================================================================

class ABTestManager {
  /**
   * @param {Object} database - Database connection
   */
  constructor(database) {
    this.db = database;
  }

  /**
   * Create a new A/B test
   * @param {Object} testConfig - Test configuration
   * @returns {Object} Created test
   */
  async createTest(testConfig) {
    const test = {
      id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: testConfig.name,
      description: testConfig.description,
      type: testConfig.type,
      primaryMetric: testConfig.primaryMetric || METRICS.REPLY_RATE,
      secondaryMetrics: testConfig.secondaryMetrics || [],
      status: 'active',
      variants: testConfig.variants.map((v, i) => ({
        id: `var_${i}`,
        name: v.name,
        content: v.content,
        weight: v.weight || 1 / testConfig.variants.length,
        isControl: i === 0, // First variant is control
        stats: {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          replied: 0,
          positiveReplies: 0,
          meetings: 0,
          unsubscribed: 0
        }
      })),
      minSampleSize: testConfig.minSampleSize || 100,
      maxRunDays: testConfig.maxRunDays || 14,
      autoOptimize: testConfig.autoOptimize !== false,
      winner: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      endedAt: null
    };

    await this.db.insert('ab_tests', test);
    return test;
  }

  /**
   * Get variant for a recipient (weighted random selection)
   * @param {string} testId - Test ID
   * @param {string} recipientId - Recipient ID (for consistent assignment)
   * @returns {Object} Selected variant
   */
  async assignVariant(testId, recipientId) {
    const test = await this.db.get('ab_tests', testId);
    
    if (!test || test.status !== 'active') {
      // Return control/winner if test ended
      if (test?.winner) {
        return test.variants.find(v => v.id === test.winner);
      }
      return test?.variants[0];
    }

    // Check if recipient already assigned
    const existing = await this.db.findOne('ab_assignments', {
      testId,
      recipientId
    });
    
    if (existing) {
      return test.variants.find(v => v.id === existing.variantId);
    }

    // Weighted random selection
    const rand = this.hashToFloat(recipientId + testId); // Consistent hash
    let cumWeight = 0;
    let selectedVariant = test.variants[0];
    
    for (const variant of test.variants) {
      cumWeight += variant.weight;
      if (rand <= cumWeight) {
        selectedVariant = variant;
        break;
      }
    }

    // Record assignment
    await this.db.insert('ab_assignments', {
      testId,
      recipientId,
      variantId: selectedVariant.id,
      assignedAt: new Date()
    });

    return selectedVariant;
  }

  /**
   * Hash string to float between 0 and 1 (consistent random)
   */
  hashToFloat(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash % 10000) / 10000;
  }

  /**
   * Record an event for a variant
   * @param {string} testId - Test ID
   * @param {string} recipientId - Recipient ID
   * @param {string} eventType - Event type (sent, opened, replied, etc.)
   * @param {Object} metadata - Additional event data
   */
  async recordEvent(testId, recipientId, eventType, metadata = {}) {
    // Get assignment
    const assignment = await this.db.findOne('ab_assignments', {
      testId,
      recipientId
    });

    if (!assignment) {
      console.warn(`No assignment found for ${recipientId} in test ${testId}`);
      return;
    }

    // Record event
    await this.db.insert('ab_events', {
      testId,
      variantId: assignment.variantId,
      recipientId,
      eventType,
      metadata,
      timestamp: new Date()
    });

    // Update variant stats
    await this.updateVariantStats(testId, assignment.variantId, eventType);
    
    // Check if test should end
    await this.checkTestCompletion(testId);
  }

  /**
   * Update variant statistics
   */
  async updateVariantStats(testId, variantId, eventType) {
    const statField = this.eventToStatField(eventType);
    if (!statField) return;

    await this.db.increment('ab_tests', testId, 
      `variants.${variantId}.stats.${statField}`, 1);
  }

  /**
   * Map event type to stat field
   */
  eventToStatField(eventType) {
    const mapping = {
      'sent': 'sent',
      'delivered': 'delivered',
      'opened': 'opened',
      'clicked': 'clicked',
      'replied': 'replied',
      'positive_reply': 'positiveReplies',
      'meeting_booked': 'meetings',
      'unsubscribed': 'unsubscribed'
    };
    return mapping[eventType];
  }

  /**
   * Check if test should be completed
   */
  async checkTestCompletion(testId) {
    const test = await this.db.get('ab_tests', testId);
    if (!test || test.status !== 'active') return;

    // Check max duration
    const daysSinceStart = (Date.now() - new Date(test.createdAt)) / (1000 * 60 * 60 * 24);
    if (daysSinceStart >= test.maxRunDays) {
      await this.endTest(testId, 'max_duration_reached');
      return;
    }

    // Check sample size
    const totalSent = test.variants.reduce((sum, v) => sum + v.stats.sent, 0);
    if (totalSent < test.minSampleSize) return;

    // Check for statistical significance
    if (test.autoOptimize) {
      const analysis = await this.analyzeTest(testId);
      
      // End if we have high confidence winner
      if (analysis.hasHighConfidenceWinner) {
        await this.endTest(testId, 'significant_winner', analysis.recommendedWinner);
      }
    }
  }

  /**
   * Analyze test results
   * @param {string} testId - Test ID
   * @returns {Object} Analysis results
   */
  async analyzeTest(testId) {
    const test = await this.db.get('ab_tests', testId);
    if (!test) throw new Error(`Test ${testId} not found`);

    const control = test.variants.find(v => v.isControl);
    const analysis = {
      testId,
      testName: test.name,
      primaryMetric: test.primaryMetric,
      status: test.status,
      daysSinceStart: ((Date.now() - new Date(test.createdAt)) / (1000 * 60 * 60 * 24)).toFixed(1),
      variantResults: [],
      hasHighConfidenceWinner: false,
      recommendedWinner: null
    };

    // Analyze each variant against control
    for (const variant of test.variants) {
      const metricData = this.getMetricData(variant.stats, test.primaryMetric);
      
      let comparison = null;
      if (!variant.isControl) {
        const controlMetric = this.getMetricData(control.stats, test.primaryMetric);
        comparison = calculateSignificance(
          controlMetric.successes,
          controlMetric.total,
          metricData.successes,
          metricData.total
        );
      }

      const result = {
        variantId: variant.id,
        variantName: variant.name,
        isControl: variant.isControl,
        stats: variant.stats,
        primaryMetricRate: metricData.rate,
        vsControl: comparison
      };

      analysis.variantResults.push(result);

      // Check for high confidence winner
      if (comparison && comparison.isHighlySignificant && 
          parseFloat(comparison.variantRate) > parseFloat(comparison.controlRate)) {
        analysis.hasHighConfidenceWinner = true;
        analysis.recommendedWinner = variant.id;
      }
    }

    // Sort by primary metric performance
    analysis.variantResults.sort((a, b) => {
      return parseFloat(b.primaryMetricRate) - parseFloat(a.primaryMetricRate);
    });

    // If no high confidence winner, recommend best performer if sample is large
    if (!analysis.recommendedWinner && analysis.variantResults[0]) {
      const best = analysis.variantResults[0];
      if (best.stats.sent >= test.minSampleSize / test.variants.length) {
        analysis.recommendedWinner = best.variantId;
      }
    }

    return analysis;
  }

  /**
   * Get metric data from stats
   */
  getMetricData(stats, metric) {
    const mapping = {
      [METRICS.OPEN_RATE]: { successes: stats.opened, total: stats.delivered || stats.sent },
      [METRICS.CLICK_RATE]: { successes: stats.clicked, total: stats.delivered || stats.sent },
      [METRICS.REPLY_RATE]: { successes: stats.replied, total: stats.sent },
      [METRICS.POSITIVE_REPLY_RATE]: { successes: stats.positiveReplies, total: stats.sent },
      [METRICS.MEETING_RATE]: { successes: stats.meetings, total: stats.sent },
      [METRICS.UNSUBSCRIBE_RATE]: { successes: stats.unsubscribed, total: stats.sent }
    };

    const data = mapping[metric] || { successes: stats.replied, total: stats.sent };
    data.rate = data.total > 0 
      ? (data.successes / data.total * 100).toFixed(2) + '%'
      : '0%';

    return data;
  }

  /**
   * End a test and declare winner
   * @param {string} testId - Test ID
   * @param {string} reason - Reason for ending
   * @param {string} winnerId - Winner variant ID (optional)
   */
  async endTest(testId, reason, winnerId = null) {
    const test = await this.db.get('ab_tests', testId);
    if (!test) return;

    // Determine winner if not specified
    if (!winnerId) {
      const analysis = await this.analyzeTest(testId);
      winnerId = analysis.recommendedWinner || test.variants[0].id;
    }

    await this.db.update('ab_tests', testId, {
      status: 'completed',
      winner: winnerId,
      endReason: reason,
      endedAt: new Date(),
      updatedAt: new Date()
    });

    console.log(`Test ${testId} ended. Winner: ${winnerId}. Reason: ${reason}`);
    
    return { testId, winner: winnerId, reason };
  }

  /**
   * Get all active tests
   */
  async getActiveTests() {
    return this.db.find('ab_tests', { status: 'active' });
  }

  /**
   * Get winning content for a test type
   * @param {string} testType - Type of test
   * @param {string} campaignId - Campaign ID (for scoping)
   * @returns {Object} Winning variant content or null
   */
  async getWinningContent(testType, campaignId = null) {
    const query = { 
      type: testType, 
      status: 'completed',
      winner: { $ne: null }
    };
    
    if (campaignId) {
      query.campaignId = campaignId;
    }

    const tests = await this.db.find('ab_tests', query, { 
      sort: { endedAt: -1 }, 
      limit: 1 
    });

    if (tests.length === 0) return null;

    const test = tests[0];
    const winner = test.variants.find(v => v.id === test.winner);
    
    return winner ? winner.content : null;
  }
}

// ============================================================================
// PRE-BUILT TEST TEMPLATES
// ============================================================================

const TEST_TEMPLATES = {
  /**
   * Subject line test template
   */
  subjectLine: (variants) => ({
    name: `Subject Line Test - ${new Date().toISOString().split('T')[0]}`,
    type: TEST_TYPES.SUBJECT_LINE,
    primaryMetric: METRICS.OPEN_RATE,
    secondaryMetrics: [METRICS.REPLY_RATE],
    variants: variants.map((subject, i) => ({
      name: `Subject ${i + 1}`,
      content: { subject }
    })),
    minSampleSize: 200,
    maxRunDays: 7
  }),

  /**
   * Email body test template
   */
  emailBody: (variants) => ({
    name: `Email Body Test - ${new Date().toISOString().split('T')[0]}`,
    type: TEST_TYPES.EMAIL_BODY,
    primaryMetric: METRICS.REPLY_RATE,
    secondaryMetrics: [METRICS.POSITIVE_REPLY_RATE, METRICS.MEETING_RATE],
    variants: variants.map((body, i) => ({
      name: `Body ${i + 1}`,
      content: { body }
    })),
    minSampleSize: 100,
    maxRunDays: 14
  }),

  /**
   * CTA test template
   */
  cta: (variants) => ({
    name: `CTA Test - ${new Date().toISOString().split('T')[0]}`,
    type: TEST_TYPES.CTA,
    primaryMetric: METRICS.REPLY_RATE,
    variants: variants.map((cta, i) => ({
      name: `CTA ${i + 1}`,
      content: { cta }
    })),
    minSampleSize: 150,
    maxRunDays: 10
  }),

  /**
   * Send time test template
   */
  sendTime: (timeSlots) => ({
    name: `Send Time Test - ${new Date().toISOString().split('T')[0]}`,
    type: TEST_TYPES.SEND_TIME,
    primaryMetric: METRICS.OPEN_RATE,
    secondaryMetrics: [METRICS.REPLY_RATE],
    variants: timeSlots.map(slot => ({
      name: `${slot.day} ${slot.time}`,
      content: { sendTime: slot }
    })),
    minSampleSize: 100,
    maxRunDays: 21
  }),

  /**
   * Follow-up timing test
   */
  followUpTiming: (delays) => ({
    name: `Follow-up Timing Test - ${new Date().toISOString().split('T')[0]}`,
    type: TEST_TYPES.FOLLOW_UP_TIMING,
    primaryMetric: METRICS.REPLY_RATE,
    variants: delays.map(delay => ({
      name: `${delay} hours`,
      content: { delayHours: delay }
    })),
    minSampleSize: 200,
    maxRunDays: 30
  })
};

// ============================================================================
// SIMPLE IN-MEMORY DATABASE FOR TESTING
// ============================================================================

class InMemoryDB {
  constructor() {
    this.collections = {
      ab_tests: [],
      ab_assignments: [],
      ab_events: []
    };
  }

  async insert(collection, doc) {
    this.collections[collection] = this.collections[collection] || [];
    this.collections[collection].push(doc);
    return doc;
  }

  async get(collection, id) {
    const col = this.collections[collection] || [];
    return col.find(d => d.id === id);
  }

  async update(collection, id, updates) {
    const col = this.collections[collection] || [];
    const index = col.findIndex(d => d.id === id);
    if (index >= 0) {
      col[index] = { ...col[index], ...updates };
    }
  }

  async find(collection, query = {}, options = {}) {
    let results = this.collections[collection] || [];
    
    // Simple query matching
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'object' && value.$ne !== undefined) {
        results = results.filter(d => d[key] !== value.$ne);
      } else {
        results = results.filter(d => d[key] === value);
      }
    }

    // Sort
    if (options.sort) {
      const [field, order] = Object.entries(options.sort)[0];
      results.sort((a, b) => {
        return order === -1 ? b[field] - a[field] : a[field] - b[field];
      });
    }

    // Limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async findOne(collection, query) {
    const results = await this.find(collection, query, { limit: 1 });
    return results[0] || null;
  }

  async increment(collection, id, field, amount) {
    const doc = await this.get(collection, id);
    if (!doc) return;
    
    // Handle nested field like "variants.var_0.stats.sent"
    const parts = field.split('.');
    let obj = doc;
    for (let i = 0; i < parts.length - 1; i++) {
      if (Array.isArray(obj)) {
        obj = obj.find(v => v.id === parts[i]);
      } else {
        obj = obj[parts[i]];
      }
      if (!obj) return;
    }
    obj[parts[parts.length - 1]] = (obj[parts[parts.length - 1]] || 0) + amount;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ABTestManager,
  TEST_TYPES,
  METRICS,
  TEST_TEMPLATES,
  calculateSignificance,
  InMemoryDB
};

// ============================================================================
// USAGE EXAMPLE
// ============================================================================
/*

const { ABTestManager, TEST_TEMPLATES, InMemoryDB } = require('./ab-testing');

// Initialize
const db = new InMemoryDB(); // Or your real DB
const abTest = new ABTestManager(db);

// 1. Create a subject line test
const test = await abTest.createTest(
  TEST_TEMPLATES.subjectLine([
    "Quick question about {company}",
    "{firstName} - growth opportunity",
    "Saw {company} on LinkedIn",
    "Re: {topic}"
  ])
);

console.log('Created test:', test.id);

// 2. Assign variant to recipient
const variant = await abTest.assignVariant(test.id, 'recipient_123');
console.log('Assigned variant:', variant.name, variant.content);

// 3. Record events as they happen
await abTest.recordEvent(test.id, 'recipient_123', 'sent');
await abTest.recordEvent(test.id, 'recipient_123', 'opened');
await abTest.recordEvent(test.id, 'recipient_123', 'replied');

// 4. Check results
const analysis = await abTest.analyzeTest(test.id);
console.log('Analysis:', JSON.stringify(analysis, null, 2));

// 5. Get winning content for future campaigns
const winningSubject = await abTest.getWinningContent('subject_line');

*/
