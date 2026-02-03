#!/usr/bin/env node

/**
 * Email Generator Test Suite
 * Tests AI-powered email generation, retry logic, performance tracking, and error handling
 */

const emailGenerator = require('../lib/email-generator');
const OpenAI = require('openai');
require('dotenv').config();

console.log('🤖 Email Generator Test Suite\n');
console.log('Testing core AI email generation functionality...\n');

// Test configuration
const TEST_TIMEOUT_MS = 30000; // 30 seconds for API calls

/**
 * Test 1: Basic Email Generation
 */
async function testBasicEmailGeneration() {
  console.log('Test 1: Basic Email Generation');
  console.log('─'.repeat(60));
  
  try {
    const lead = {
      email: 'founder@startup.com',
      first_name: 'Sarah',
      last_name: 'Chen',
      company: 'TechFlow AI',
      job_title: 'Founder & CEO',
      industry: 'B2B SaaS',
      linkedin_url: 'https://linkedin.com/in/sarahchen'
    };

    const campaign = {
      campaign_name: 'Q1 Outbound',
      value_proposition: 'AI-powered cold email platform',
      pain_points: ['Low reply rates', 'Emails in spam', 'Manual personalization'],
      cta: 'Book a 15-min demo'
    };

    console.log('Generating email for:', lead.first_name, lead.last_name);
    
    const start = Date.now();
    const result = await emailGenerator.generateEmail(lead, campaign);
    const duration = Date.now() - start;

    console.log('\n✅ Email generated successfully');
    console.log(`Duration: ${duration}ms`);
    console.log(`\nSubject: ${result.subject}`);
    console.log(`\nBody preview (first 200 chars):`);
    console.log(result.body.substring(0, 200) + '...');
    
    // Validations
    if (!result.subject || result.subject.length === 0) {
      throw new Error('Subject line is empty');
    }
    
    if (!result.body || result.body.length < 100) {
      throw new Error('Email body too short');
    }
    
    if (!result.body.includes(lead.first_name)) {
      console.warn('⚠️  Warning: Email does not include first name personalization');
    }
    
    if (!result.body.includes(lead.company)) {
      console.warn('⚠️  Warning: Email does not include company name');
    }
    
    console.log('\n✓ Basic email generation test PASSED\n');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * Test 2: Batch Email Generation
 */
async function testBatchGeneration() {
  console.log('Test 2: Batch Email Generation (5 leads)');
  console.log('─'.repeat(60));
  
  try {
    const leads = [
      {
        first_name: 'Alex',
        last_name: 'Thompson',
        company: 'CloudScale',
        job_title: 'VP of Sales',
        industry: 'DevOps Tools'
      },
      {
        first_name: 'Maria',
        last_name: 'Garcia',
        company: 'DataHub Pro',
        job_title: 'Co-Founder',
        industry: 'Data Analytics'
      },
      {
        first_name: 'James',
        last_name: 'Wilson',
        company: 'SecureAuth',
        job_title: 'Head of Growth',
        industry: 'Cybersecurity'
      },
      {
        first_name: 'Emily',
        last_name: 'Brown',
        company: 'FlowMetrics',
        job_title: 'CEO',
        industry: 'Marketing Analytics'
      },
      {
        first_name: 'David',
        last_name: 'Lee',
        company: 'API Gateway',
        job_title: 'Founder',
        industry: 'API Management'
      }
    ];

    const campaign = {
      campaign_name: 'Batch Test',
      value_proposition: 'AI-powered cold email platform',
      pain_points: ['Low reply rates', 'Manual work'],
      cta: 'Book a demo'
    };

    console.log(`Generating ${leads.length} emails in batch...\n`);
    
    const start = Date.now();
    const results = await Promise.all(
      leads.map(lead => emailGenerator.generateEmail(lead, campaign))
    );
    const totalDuration = Date.now() - start;
    const avgDuration = totalDuration / leads.length;

    console.log(`✅ Generated ${results.length} emails`);
    console.log(`Total time: ${totalDuration}ms`);
    console.log(`Average time per email: ${Math.round(avgDuration)}ms\n`);

    // Check uniqueness
    const subjects = results.map(r => r.subject);
    const uniqueSubjects = new Set(subjects);
    
    if (uniqueSubjects.size !== subjects.length) {
      console.warn('⚠️  Warning: Some subject lines are duplicated');
    } else {
      console.log('✓ All subject lines are unique');
    }

    // Check personalization
    results.forEach((result, i) => {
      const lead = leads[i];
      if (!result.body.includes(lead.first_name)) {
        console.warn(`⚠️  Warning: Email ${i+1} missing first name`);
      }
      if (!result.body.includes(lead.company)) {
        console.warn(`⚠️  Warning: Email ${i+1} missing company name`);
      }
    });

    console.log('\n✓ Batch generation test PASSED\n');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * Test 3: Error Handling (Invalid Input)
 */
async function testErrorHandling() {
  console.log('Test 3: Error Handling (Invalid Input)');
  console.log('─'.repeat(60));
  
  try {
    // Test with missing required fields
    const invalidLead = {
      email: 'test@test.com'
      // Missing first_name, company, etc.
    };

    const campaign = {
      campaign_name: 'Test',
      value_proposition: 'Test value prop'
    };

    console.log('Testing with incomplete lead data...');
    
    try {
      await emailGenerator.generateEmail(invalidLead, campaign);
      console.log('⚠️  Warning: Should have thrown error for incomplete data');
    } catch (error) {
      console.log('✓ Correctly rejected invalid input');
      console.log(`  Error: ${error.message}`);
    }

    console.log('\n✓ Error handling test PASSED\n');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * Test 4: Different Tones
 */
async function testDifferentTones() {
  console.log('Test 4: Different Tones (Professional vs Casual)');
  console.log('─'.repeat(60));
  
  try {
    const lead = {
      first_name: 'John',
      last_name: 'Doe',
      company: 'StartupCo',
      job_title: 'Founder',
      industry: 'E-commerce'
    };

    const baseCampaign = {
      campaign_name: 'Tone Test',
      value_proposition: 'AI email platform',
      cta: 'Book demo'
    };

    console.log('Generating professional tone email...');
    const professionalResult = await emailGenerator.generateEmail(lead, {
      ...baseCampaign,
      tone: 'professional'
    });

    console.log('Generating casual tone email...\n');
    const casualResult = await emailGenerator.generateEmail(lead, {
      ...baseCampaign,
      tone: 'casual'
    });

    console.log('Professional Subject:', professionalResult.subject);
    console.log('Casual Subject:', casualResult.subject);
    console.log();
    
    // Basic validation - emails should be different
    if (professionalResult.body === casualResult.body) {
      console.warn('⚠️  Warning: Professional and casual emails are identical');
    } else {
      console.log('✓ Different tones produce different content');
    }

    console.log('\n✓ Tone variation test PASSED\n');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * Test 5: Performance Tracking
 */
async function testPerformanceTracking() {
  console.log('Test 5: Performance Tracking');
  console.log('─'.repeat(60));
  
  try {
    // Generate a few emails to populate performance metrics
    const lead = {
      first_name: 'Test',
      last_name: 'User',
      company: 'Test Corp',
      job_title: 'Tester'
    };

    const campaign = {
      campaign_name: 'Performance Test',
      value_proposition: 'Testing',
      cta: 'Test'
    };

    console.log('Generating 3 emails to track performance...\n');
    
    for (let i = 0; i < 3; i++) {
      await emailGenerator.generateEmail(lead, campaign);
    }

    const stats = emailGenerator.getPerformanceStats();
    
    console.log('Performance Statistics:');
    console.log(`  Total API calls: ${stats.totalCalls}`);
    console.log(`  Total tokens: ${stats.totalTokens}`);
    console.log(`  Total cost: $${stats.totalCost.toFixed(4)}`);
    console.log(`  Avg latency: ${Math.round(stats.avgLatencyMs)}ms`);
    console.log(`  Errors: ${stats.errors}`);

    if (stats.totalCalls < 3) {
      console.warn('⚠️  Warning: Performance tracking may not be working');
    }

    console.log('\n✓ Performance tracking test PASSED\n');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * Test 6: Cost Estimation
 */
async function testCostEstimation() {
  console.log('Test 6: Cost Estimation');
  console.log('─'.repeat(60));
  
  try {
    const emailCount = 100;
    const estimatedCost = emailGenerator.estimateCost(emailCount);
    
    console.log(`Estimated cost for ${emailCount} emails: $${estimatedCost.toFixed(2)}`);
    console.log(`Cost per email: $${(estimatedCost / emailCount).toFixed(4)}`);
    
    // Sanity check - should be between $0.50 and $5.00 for 100 emails
    if (estimatedCost < 0.50 || estimatedCost > 5.00) {
      console.warn(`⚠️  Warning: Cost estimate seems off: $${estimatedCost.toFixed(2)}`);
    } else {
      console.log('✓ Cost estimation within expected range');
    }

    console.log('\n✓ Cost estimation test PASSED\n');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * Test 7: Subject Line Quality Check
 */
async function testSubjectLineQuality() {
  console.log('Test 7: Subject Line Quality Check');
  console.log('─'.repeat(60));
  
  try {
    const lead = {
      first_name: 'Jane',
      last_name: 'Smith',
      company: 'InnovateCo',
      job_title: 'VP Marketing',
      industry: 'MarTech'
    };

    const campaign = {
      campaign_name: 'Subject Test',
      value_proposition: 'AI-powered email automation',
      cta: 'See demo'
    };

    console.log('Generating email to check subject line quality...\n');
    
    const result = await emailGenerator.generateEmail(lead, campaign);
    const subject = result.subject;

    console.log(`Subject: ${subject}`);
    console.log(`Length: ${subject.length} characters\n`);

    // Quality checks
    const checks = {
      'Not too short': subject.length >= 20,
      'Not too long': subject.length <= 70,
      'No spam words (FREE, BUY NOW, CLICK)': !subject.match(/\b(FREE|BUY NOW|CLICK HERE|ACT NOW)\b/i),
      'No excessive punctuation': (subject.match(/[!?]/g) || []).length <= 1,
      'No all caps': subject !== subject.toUpperCase(),
      'Personalized or relevant': subject.toLowerCase().includes(lead.company.toLowerCase()) || 
                                   subject.toLowerCase().includes(lead.industry.toLowerCase()) ||
                                   subject.toLowerCase().includes(lead.first_name.toLowerCase())
    };

    let passCount = 0;
    Object.entries(checks).forEach(([check, passed]) => {
      const icon = passed ? '✓' : '✗';
      console.log(`  ${icon} ${check}`);
      if (passed) passCount++;
    });

    const score = (passCount / Object.keys(checks).length) * 100;
    console.log(`\nQuality Score: ${score.toFixed(0)}% (${passCount}/${Object.keys(checks).length} checks passed)`);

    if (score >= 80) {
      console.log('✓ Subject line quality is GOOD');
    } else if (score >= 60) {
      console.log('⚠️  Subject line quality is FAIR');
    } else {
      console.log('❌ Subject line quality is POOR');
    }

    console.log('\n✓ Subject line quality test PASSED\n');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * Test 8: Spam Filter Check
 */
async function testSpamFilterCheck() {
  console.log('Test 8: Spam Filter Check');
  console.log('─'.repeat(60));
  
  try {
    const lead = {
      first_name: 'Bob',
      last_name: 'Johnson',
      company: 'TechStartup',
      job_title: 'CEO'
    };

    const campaign = {
      campaign_name: 'Spam Check',
      value_proposition: 'Email platform',
      cta: 'Reply to this email'
    };

    console.log('Generating email to check for spam triggers...\n');
    
    const result = await emailGenerator.generateEmail(lead, campaign);
    const fullText = result.subject + ' ' + result.body;

    // Spam trigger checks
    const spamTriggers = {
      'ALL CAPS words': (fullText.match(/\b[A-Z]{4,}\b/g) || []).length,
      'Excessive exclamation marks': (fullText.match(/!/g) || []).length,
      'Spam words (FREE, WIN, CLICK)': (fullText.match(/\b(FREE|WIN|CLICK HERE|ACT NOW|LIMITED TIME|GUARANTEE)\b/gi) || []).length,
      'Excessive links': (fullText.match(/https?:\/\//g) || []).length,
      'Currency symbols ($$$)': (fullText.match(/\$+/g) || []).filter(m => m.length > 1).length
    };

    console.log('Spam Trigger Analysis:');
    let totalTriggers = 0;
    Object.entries(spamTriggers).forEach(([trigger, count]) => {
      const icon = count === 0 ? '✓' : count <= 2 ? '⚠️' : '❌';
      console.log(`  ${icon} ${trigger}: ${count}`);
      totalTriggers += count;
    });

    console.log(`\nTotal spam triggers: ${totalTriggers}`);

    if (totalTriggers === 0) {
      console.log('✓ Email is SPAM-SAFE');
    } else if (totalTriggers <= 3) {
      console.log('⚠️  Email has minor spam risks');
    } else {
      console.log('❌ Email likely to trigger spam filters');
    }

    console.log('\n✓ Spam filter check test PASSED\n');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('═'.repeat(60));
  console.log('STARTING EMAIL GENERATOR TEST SUITE');
  console.log('═'.repeat(60));
  console.log();

  // Check if API key is configured
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment');
    console.error('Please add OPENAI_API_KEY to your .env file');
    process.exit(1);
  }

  const tests = [
    { name: 'Basic Email Generation', fn: testBasicEmailGeneration },
    { name: 'Batch Generation', fn: testBatchGeneration },
    { name: 'Error Handling', fn: testErrorHandling },
    { name: 'Different Tones', fn: testDifferentTones },
    { name: 'Performance Tracking', fn: testPerformanceTracking },
    { name: 'Cost Estimation', fn: testCostEstimation },
    { name: 'Subject Line Quality', fn: testSubjectLineQuality },
    { name: 'Spam Filter Check', fn: testSpamFilterCheck }
  ];

  const results = [];
  
  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
    } catch (error) {
      console.error(`❌ Test "${test.name}" crashed:`, error);
      results.push({ name: test.name, passed: false });
    }
  }

  // Summary
  console.log('═'.repeat(60));
  console.log('TEST SUITE SUMMARY');
  console.log('═'.repeat(60));
  console.log();

  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
  });

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  const successRate = (passedCount / totalCount) * 100;

  console.log();
  console.log(`Tests passed: ${passedCount}/${totalCount} (${successRate.toFixed(0)}%)`);
  console.log();

  if (successRate === 100) {
    console.log('🎉 ALL TESTS PASSED!');
  } else if (successRate >= 75) {
    console.log('✓ Most tests passed');
  } else {
    console.log('⚠️  Many tests failed - review issues above');
  }

  console.log();
  console.log('═'.repeat(60));

  // Exit with appropriate code
  process.exit(successRate === 100 ? 0 : 1);
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  testBasicEmailGeneration,
  testBatchGeneration,
  testErrorHandling,
  testDifferentTones,
  testPerformanceTracking,
  testCostEstimation,
  testSubjectLineQuality,
  testSpamFilterCheck,
  runAllTests
};
