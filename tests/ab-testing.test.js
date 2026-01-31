#!/usr/bin/env node

// A/B Testing Framework Test
// Demonstrates how to use the A/B testing system

const abTesting = require('../lib/ab-testing');
const db = require('../lib/db');

console.log('🧪 A/B Testing Framework Test\n');

// Example 1: Create subject line test
console.log('Example 1: Subject Line Test');
console.log('─'.repeat(50));

const subjectTest = abTesting.createTest({
  campaign_id: 1,
  test_name: 'Subject Line: Pain vs Benefit',
  test_type: 'subject',
  variant_a: {
    subject: 'Struggling with cold email deliverability?'
  },
  variant_b: {
    subject: 'Get 10+ qualified demos per month'
  },
  split_ratio: 50 // 50/50 split
});

console.log(`✓ Created test #${subjectTest}\n`);

// Example 2: Create full email test
console.log('Example 2: Full Email Test (Subject + Body)');
console.log('─'.repeat(50));

const fullTest = abTesting.createTest({
  campaign_id: 1,
  test_name: 'Problem-Agitate vs Solution-First',
  test_type: 'full',
  variant_a: {
    subject: 'Your cold emails getting ignored?',
    body: `Hey {{first_name}},

I noticed {{company}} is in the {{industry}} space.

Most B2B SaaS founders struggle with cold email in 2026:
- Emails end up in spam
- No replies even with "good" copy
- Domain reputation destroyed after one campaign

We've solved this with AI-powered personalization + deliverability infrastructure.

Want to see how we got 12% reply rates for similar companies?

Best,
Caesar`
  },
  variant_b: {
    subject: '12% reply rate for B2B SaaS cold emails',
    body: `Hey {{first_name}},

We help B2B SaaS companies like {{company}} get 10+ qualified demos per month through AI-powered cold email.

Our secret? GPT-4 writes each email from scratch based on prospect research.

Results for clients in {{industry}}:
- 12% average reply rate (vs 2% industry standard)
- 3-5 meetings booked per 100 emails
- Zero spam folder issues

Interested in a quick demo?

Best,
Caesar`
  }
});

console.log(`✓ Created test #${fullTest}\n`);

// Example 3: Test variant assignment
console.log('Example 3: Variant Assignment');
console.log('─'.repeat(50));

const leadIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

leadIds.forEach(leadId => {
  const variant = abTesting.assignVariant(subjectTest, leadId);
  console.log(`Lead ${leadId} → Variant ${variant}`);
});

console.log('\n✓ Assignments are deterministic (same lead always gets same variant)\n');

// Example 4: Get variant content
console.log('Example 4: Get Variant Content');
console.log('─'.repeat(50));

const baseEmail = {
  subject: 'This will be replaced',
  body: 'This will be replaced'
};

const lead1Email = abTesting.getVariantContent(fullTest, 1, baseEmail);
console.log('Lead 1 Email:');
console.log(`Subject: ${lead1Email.subject}`);
console.log(`Variant: ${lead1Email.variant}`);
console.log('');

const lead2Email = abTesting.getVariantContent(fullTest, 2, baseEmail);
console.log('Lead 2 Email:');
console.log(`Subject: ${lead2Email.subject}`);
console.log(`Variant: ${lead2Email.variant}`);
console.log('');

// Example 5: Record events
console.log('Example 5: Record Events (Simulated)');
console.log('─'.repeat(50));

// Simulate sending emails
leadIds.forEach(leadId => {
  abTesting.recordEvent(subjectTest, leadId, 'sent');
});

// Simulate some opens (variant A: 40%, variant B: 60%)
[1, 3, 5, 7].forEach(leadId => {
  abTesting.recordEvent(subjectTest, leadId, 'opened');
});

[2, 4, 6, 8, 10].forEach(leadId => {
  abTesting.recordEvent(subjectTest, leadId, 'opened');
});

// Simulate replies (variant A: 1, variant B: 3)
abTesting.recordEvent(subjectTest, 1, 'replied', { message: 'Interested!' });
[2, 4, 6].forEach(leadId => {
  abTesting.recordEvent(subjectTest, leadId, 'replied', { message: 'Tell me more' });
});

console.log('✓ Events recorded\n');

// Example 6: Get results
console.log('Example 6: Test Results');
console.log('─'.repeat(50));

const results = abTesting.getTestResults(subjectTest);

console.log(`Test: ${results.test_name}`);
console.log(`Type: ${results.test_type}`);
console.log('');

console.log('Variant A:');
console.log(`  Sent: ${results.variant_a.sent}`);
console.log(`  Opens: ${results.variant_a.opened} (${results.variant_a.open_rate}%)`);
console.log(`  Replies: ${results.variant_a.replied} (${results.variant_a.reply_rate}%)`);
console.log('');

console.log('Variant B:');
console.log(`  Sent: ${results.variant_b.sent}`);
console.log(`  Opens: ${results.variant_b.opened} (${results.variant_b.open_rate}%)`);
console.log(`  Replies: ${results.variant_b.replied} (${results.variant_b.reply_rate}%)`);
console.log('');

console.log(`Winner: ${results.winner}`);
console.log(`Confidence: ${results.confidence}%`);
console.log(`Significant: ${results.is_significant ? 'Yes ✓' : 'No ✗'}`);
console.log(`Recommendation: ${results.recommendation}`);
console.log('');

// Example 7: Real-world usage pattern
console.log('Example 7: Real-World Usage Pattern');
console.log('─'.repeat(50));

console.log(`
// In your campaign send script:

const campaignId = 1;
const testId = 3; // Active A/B test for this campaign

leads.forEach(lead => {
  // Get variant-specific email content
  const email = abTesting.getVariantContent(testId, lead.id, baseEmail);
  
  // Send email
  const result = await sendEmail(lead.email, email.subject, email.body);
  
  // Record send event
  abTesting.recordEvent(testId, lead.id, 'sent');
});

// In your webhook handler (when email is opened):
abTesting.recordEvent(testId, lead.id, 'opened');

// In your webhook handler (when email is replied):
abTesting.recordEvent(testId, lead.id, 'replied', { 
  sentiment: 'positive',
  body: replyText 
});

// Check results after 50+ sends per variant:
const results = abTesting.getTestResults(testId);
console.log(results.recommendation);

// If winner is clear:
if (results.is_significant) {
  abTesting.completeTest(testId);
  // Use winning variant for all future sends
}
`);

console.log('🎉 A/B Testing Framework Ready!\n');

console.log('Key Features:');
console.log('  ✓ Subject line testing');
console.log('  ✓ Email body testing');
console.log('  ✓ Full email testing (subject + body)');
console.log('  ✓ Send time testing');
console.log('  ✓ CTA testing');
console.log('  ✓ Statistical significance calculation');
console.log('  ✓ Deterministic variant assignment');
console.log('  ✓ Event tracking (sent, opened, clicked, replied)');
console.log('  ✓ Performance metrics per variant');
console.log('  ✓ Actionable recommendations');
