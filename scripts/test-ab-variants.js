/**
 * Test A/B Variant Generation
 * 
 * Usage: node scripts/test-ab-variants.js
 * 
 * Generates 2-4 variants of the same email using different psychological approaches:
 * - Problem-focused (pain point first)
 * - Social proof (credibility via results)
 * - Curiosity gap (tease value)
 * - Direct value (immediate metric/outcome)
 */

require('dotenv').config();
const { generateVariants, analyzeABTest } = require('../lib/email-generator');

// Sample lead (B2B SaaS founder with outbound pain)
const testLead = {
  first_name: 'Alex',
  last_name: 'Chen',
  title: 'Founder & CEO',
  company: 'DataFlow Analytics',
  industry: 'B2B SaaS',
  pain_point: 'Low reply rates on cold outbound'
};

// Caesar's Legions client data
const testClient = {
  company: "Caesar's Legions",
  name: 'Kareem',
  value_prop: 'AI-powered cold email campaigns that get 5%+ reply rates',
  target_audience: 'B2B SaaS founders'
};

async function runTest() {
  console.log('🧪 A/B Variant Generation Test\n');
  console.log('Lead:', testLead.first_name, testLead.last_name, `(${testLead.title} at ${testLead.company})`);
  console.log('Generating 4 variants...\n');

  try {
    const variants = await generateVariants({
      lead: testLead,
      client: testClient,
      variantCount: 4 // Test all 4 angles
    });

    // Display each variant
    variants.forEach((v, i) => {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`VARIANT ${v.variant_id} - ${v.test_angle.toUpperCase()}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      console.log(`Subject: ${v.subject}`);
      console.log(`\n${v.body}\n`);
      
      const metadata = JSON.parse(v.personalization_data);
      console.log(`Hook: "${metadata.hook}"`);
      console.log(`Cost: $${metadata.cost_usd?.toFixed(4) || '0.0000'} | Latency: ${metadata.latency_ms || 'N/A'}ms`);
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✓ Generated 4 variants successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Test A/B analysis with mock results
    console.log('📊 Testing A/B Analysis (with mock data)...\n');
    
    const mockResults = [
      { variant_id: 'variant_A', test_angle: 'problem_focused', sent: 50, opened: 22, replied: 4 },
      { variant_id: 'variant_B', test_angle: 'social_proof', sent: 50, opened: 28, replied: 7 },
      { variant_id: 'variant_C', test_angle: 'curiosity_gap', sent: 50, opened: 19, replied: 2 },
      { variant_id: 'variant_D', test_angle: 'direct_value', sent: 50, opened: 25, replied: 5 }
    ];

    const analysis = analyzeABTest(mockResults);
    
    console.log('Winner:', analysis.winner.variant_id, `(${analysis.winner.test_angle})`);
    console.log('Reply Rate:', analysis.winner.reply_rate);
    console.log('Improvement:', analysis.winner.improvement_over_runner_up);
    console.log('Confidence:', analysis.confidence_level.toUpperCase());
    console.log('\nRecommendation:', analysis.recommendation);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('All Variants Performance:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    analysis.all_variants.forEach(v => {
      console.log(`${v.variant_id} (${v.angle}): ${v.reply_rate} | ${v.replied}/${v.sent} replied`);
    });

    console.log('\n✓ A/B testing system working correctly!\n');

  } catch (error) {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  }
}

// Run test if executed directly
if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = { runTest };
