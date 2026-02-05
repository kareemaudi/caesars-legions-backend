// ============================================================================
// TESTS - Reply Classifier
// ============================================================================

const path = require('path');
const { ReplyClassifier, SENTIMENT, INTENT, PRIORITY } = require('../lib/reply-classifier');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`✅ ${message}`);
  } else {
    failed++;
    console.log(`❌ ${message}`);
  }
}

function assertEquals(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log(`✅ ${message}`);
  } else {
    failed++;
    console.log(`❌ ${message} (expected: ${expected}, got: ${actual})`);
  }
}

async function runTests() {
  console.log('\n🧪 REPLY CLASSIFIER TESTS\n');
  console.log('='.repeat(60));
  
  const classifier = new ReplyClassifier();
  
  // ============================================================================
  // POSITIVE INTENT TESTS
  // ============================================================================
  console.log('\n📗 POSITIVE / INTERESTED TESTS\n');
  
  // Test 1: Direct interest
  const interested1 = await classifier.classify("This sounds interesting! I'd love to learn more.");
  assertEquals(interested1.sentiment, SENTIMENT.POSITIVE, 'Direct interest - sentiment');
  assertEquals(interested1.intent, INTENT.INTERESTED, 'Direct interest - intent');
  assertEquals(interested1.priority, PRIORITY.HOT, 'Direct interest - priority');
  
  // Test 2: Request for call
  const interested2 = await classifier.classify("Let's schedule a call to discuss further.");
  assertEquals(interested2.sentiment, SENTIMENT.POSITIVE, 'Schedule call - sentiment');
  assertEquals(interested2.intent, INTENT.INTERESTED, 'Schedule call - intent');
  
  // Test 3: Availability shared
  const interested3 = await classifier.classify("I'm available next Tuesday at 2pm. Does that work?");
  assertEquals(interested3.sentiment, SENTIMENT.POSITIVE, 'Availability - sentiment');
  assertEquals(interested3.intent, INTENT.INTERESTED, 'Availability - intent');
  
  // Test 4: Request for more info
  const interested4 = await classifier.classify("Can you send me more details about pricing?");
  assertEquals(interested4.sentiment, SENTIMENT.POSITIVE, 'Request info - sentiment');
  
  // Test 5: Enthusiastic yes
  const interested5 = await classifier.classify("Yes, absolutely! Let's do it.");
  assertEquals(interested5.sentiment, SENTIMENT.POSITIVE, 'Enthusiastic yes - sentiment');
  assertEquals(interested5.priority, PRIORITY.HOT, 'Enthusiastic yes - priority');
  
  // ============================================================================
  // NEGATIVE INTENT TESTS
  // ============================================================================
  console.log('\n📕 NEGATIVE / OBJECTION TESTS\n');
  
  // Test 6: Direct rejection
  const negative1 = await classifier.classify("Not interested, thanks.");
  assertEquals(negative1.sentiment, SENTIMENT.NEGATIVE, 'Direct rejection - sentiment');
  assertEquals(negative1.intent, INTENT.OBJECTION, 'Direct rejection - intent');
  
  // Test 7: Already have solution
  const negative2 = await classifier.classify("We're already using a similar tool and we're happy with it.");
  assertEquals(negative2.sentiment, SENTIMENT.NEGATIVE, 'Has solution - sentiment');
  
  // Test 8: Budget objection
  const negative3 = await classifier.classify("We don't have budget for this right now.");
  assertEquals(negative3.sentiment, SENTIMENT.NEGATIVE, 'Budget objection - sentiment');
  
  // Test 9: Not a fit
  const negative4 = await classifier.classify("This doesn't fit our needs.");
  assertEquals(negative4.sentiment, SENTIMENT.NEGATIVE, 'Not a fit - sentiment');
  
  // ============================================================================
  // COMPETITOR TESTS
  // ============================================================================
  console.log('\n🏢 COMPETITOR TESTS\n');
  
  // Test 10: Using competitor
  const competitor1 = await classifier.classify("We're already using Instantly and quite happy with it.");
  assertEquals(competitor1.intent, INTENT.COMPETITOR, 'Using Instantly - intent');
  assertEquals(competitor1.priority, PRIORITY.NONE, 'Using competitor - priority');
  
  // Test 11: Using Lemlist
  const competitor2 = await classifier.classify("Thanks but we just signed up with Lemlist last month.");
  assertEquals(competitor2.intent, INTENT.COMPETITOR, 'Using Lemlist - intent');
  
  // ============================================================================
  // UNSUBSCRIBE TESTS
  // ============================================================================
  console.log('\n⛔ UNSUBSCRIBE TESTS\n');
  
  // Test 12: Direct unsubscribe
  const unsub1 = await classifier.classify("Please unsubscribe me from this list.");
  assertEquals(unsub1.sentiment, SENTIMENT.UNSUBSCRIBE, 'Unsubscribe - sentiment');
  assertEquals(unsub1.intent, INTENT.UNSUBSCRIBE, 'Unsubscribe - intent');
  assertEquals(unsub1.priority, PRIORITY.NONE, 'Unsubscribe - priority');
  
  // Test 13: Remove request
  const unsub2 = await classifier.classify("Remove me from your mailing list immediately.");
  assertEquals(unsub2.intent, INTENT.UNSUBSCRIBE, 'Remove request - intent');
  
  // Test 14: Stop emailing
  const unsub3 = await classifier.classify("Stop sending me emails. I never signed up for this.");
  assertEquals(unsub3.intent, INTENT.UNSUBSCRIBE, 'Stop emails - intent');
  
  // Test 15: Spam threat
  const unsub4 = await classifier.classify("I've reported this as spam. Don't contact me again.");
  assertEquals(unsub4.intent, INTENT.UNSUBSCRIBE, 'Spam threat - intent');
  
  // ============================================================================
  // OUT OF OFFICE TESTS
  // ============================================================================
  console.log('\n📅 OUT OF OFFICE TESTS\n');
  
  // Test 16: OOO message
  const ooo1 = await classifier.classify("I'm out of the office until January 15th with limited email access.");
  assertEquals(ooo1.intent, INTENT.OUT_OF_OFFICE, 'OOO - intent');
  assertEquals(ooo1.priority, PRIORITY.NONE, 'OOO - priority');
  
  // Test 17: Vacation
  const ooo2 = await classifier.classify("Thanks for reaching out. I'm on vacation until next week.");
  assertEquals(ooo2.intent, INTENT.OUT_OF_OFFICE, 'Vacation - intent');
  
  // Test 18: Auto-reply
  const ooo3 = await classifier.classify("This is an auto-reply. I'll respond when I return on Monday.");
  assertEquals(ooo3.intent, INTENT.OUT_OF_OFFICE, 'Auto-reply - intent');
  
  // ============================================================================
  // NOT DECISION MAKER TESTS
  // ============================================================================
  console.log('\n👤 NOT DECISION MAKER TESTS\n');
  
  // Test 19: Wrong person
  const notDM1 = await classifier.classify("I'm not the right person for this. You should reach out to John in marketing.");
  assertEquals(notDM1.intent, INTENT.NOT_DECISION_MAKER, 'Wrong person - intent');
  assertEquals(notDM1.priority, PRIORITY.WARM, 'Wrong person - priority (referral opportunity)');
  
  // Test 20: Forwarding
  const notDM2 = await classifier.classify("Forwarding this to our sales team who handles these requests.");
  assertEquals(notDM2.intent, INTENT.NOT_DECISION_MAKER, 'Forwarding - intent');
  
  // ============================================================================
  // NOT NOW / TIMING TESTS
  // ============================================================================
  console.log('\n⏰ NOT NOW / TIMING TESTS\n');
  
  // Test 21: Bad timing
  const notNow1 = await classifier.classify("Not now, but check back with me next quarter.");
  assertEquals(notNow1.intent, INTENT.NOT_NOW, 'Bad timing - intent');
  assertEquals(notNow1.priority, PRIORITY.COOL, 'Bad timing - priority');
  
  // Test 22: Busy period
  const notNow2 = await classifier.classify("We're in our busy season right now. Can you follow up in March?");
  assertEquals(notNow2.intent, INTENT.NOT_NOW, 'Busy season - intent');
  
  // Test 23: Keep in mind
  const notNow3 = await classifier.classify("Keep me posted. This could be interesting in the future.");
  assertEquals(notNow3.intent, INTENT.NOT_NOW, 'Keep posted - intent');
  
  // ============================================================================
  // BOUNCE TESTS
  // ============================================================================
  console.log('\n❌ BOUNCE TESTS\n');
  
  // Test 24: Delivery failure
  const bounce1 = await classifier.classify("Delivery failed: mailbox not found.");
  assertEquals(bounce1.intent, INTENT.BOUNCE, 'Delivery failed - intent');
  assertEquals(bounce1.priority, PRIORITY.NONE, 'Bounce - priority');
  
  // Test 25: Undeliverable
  const bounce2 = await classifier.classify("Message undeliverable - user unknown at this domain.");
  assertEquals(bounce2.intent, INTENT.BOUNCE, 'Undeliverable - intent');
  
  // Test 26: Mailer daemon
  const bounce3 = await classifier.classify("From: MAILER-DAEMON\nSubject: Mail delivery failed");
  assertEquals(bounce3.intent, INTENT.BOUNCE, 'Mailer daemon - intent');
  
  // ============================================================================
  // CURIOUS / QUESTIONS TESTS
  // ============================================================================
  console.log('\n❓ CURIOUS / QUESTIONS TESTS\n');
  
  // Test 27: General question
  const curious1 = await classifier.classify("How does your service work exactly?");
  assertEquals(curious1.intent, INTENT.CURIOUS, 'Question - intent');
  assertEquals(curious1.priority, PRIORITY.WARM, 'Question - priority');
  
  // Test 28: Multiple questions
  const curious2 = await classifier.classify("What's the pricing? And do you integrate with Salesforce?");
  // Note: Could be curious or interested depending on confidence
  assert(curious2.sentiment === SENTIMENT.NEUTRAL || curious2.sentiment === SENTIMENT.POSITIVE, 'Multiple questions - sentiment');
  
  // ============================================================================
  // UNCLEAR / AMBIGUOUS TESTS
  // ============================================================================
  console.log('\n🤷 UNCLEAR / AMBIGUOUS TESTS\n');
  
  // Test 29: Short reply
  const unclear1 = await classifier.classify("ok");
  assertEquals(unclear1.intent, INTENT.UNCLEAR, 'Short reply - intent');
  assert(unclear1.confidence < 0.7, 'Short reply - low confidence');
  
  // Test 30: Vague response
  const unclear2 = await classifier.classify("Thanks for the email.");
  assertEquals(unclear2.intent, INTENT.UNCLEAR, 'Vague response - intent');
  
  // ============================================================================
  // SUGGESTED ACTION TESTS
  // ============================================================================
  console.log('\n🎯 SUGGESTED ACTION TESTS\n');
  
  // Test 31: Hot lead action
  const action1 = await classifier.classify("Yes, let's talk! When are you free?");
  assert(action1.suggestedAction.includes('CALENDAR'), 'Hot lead - calendar action');
  
  // Test 32: Unsubscribe action
  const action2 = await classifier.classify("Unsubscribe me please");
  assert(action2.suggestedAction.includes('REMOVE'), 'Unsubscribe - remove action');
  
  // Test 33: OOO action
  const action3 = await classifier.classify("Out of office until Monday");
  assert(action3.suggestedAction.includes('WAIT') || action3.suggestedAction.includes('RETRY'), 'OOO - wait action');
  
  // ============================================================================
  // HUMAN REVIEW FLAGS
  // ============================================================================
  console.log('\n👁️ HUMAN REVIEW TESTS\n');
  
  // Test 34: Low confidence needs review
  const review1 = await classifier.classify("Hmm.");
  assert(review1.requiresHumanReview === true, 'Low confidence - needs review');
  
  // Test 35: Objections need review
  const review2 = await classifier.classify("I'm not interested in this.");
  assert(review2.requiresHumanReview === true, 'Objection - needs review');
  
  // Test 36: High confidence positive - no review
  const review3 = await classifier.classify("Yes! Let's schedule a demo call this week.");
  assert(review3.requiresHumanReview === false, 'High confidence positive - no review');
  
  // ============================================================================
  // BATCH CLASSIFICATION
  // ============================================================================
  console.log('\n📦 BATCH CLASSIFICATION TESTS\n');
  
  // Test 37: Batch classify
  const batch = await classifier.classifyBatch([
    { body: "Sounds great, let's talk!", metadata: { from: 'hot@example.com' } },
    { body: "Not interested", metadata: { from: 'cold@example.com' } },
    { body: "I'm out of office", metadata: { from: 'ooo@example.com' } },
    { body: "Please unsubscribe me", metadata: { from: 'unsub@example.com' } }
  ]);
  
  assertEquals(batch.results.length, 4, 'Batch - correct count');
  assertEquals(batch.stats.total, 4, 'Batch stats - total');
  assert(batch.stats.byPriority.hot >= 1, 'Batch stats - has hot lead');
  assert(batch.stats.bySentiment.positive >= 1, 'Batch stats - has positive');
  
  // ============================================================================
  // TEXT NORMALIZATION
  // ============================================================================
  console.log('\n🧹 TEXT NORMALIZATION TESTS\n');
  
  // Test 38: HTML removal
  const html = await classifier.classify("<p>I'm <b>interested</b>! Let's talk.</p>");
  assertEquals(html.sentiment, SENTIMENT.POSITIVE, 'HTML removed - sentiment detected');
  
  // Test 39: Quoted text removal
  const quoted = await classifier.classify(`Sure, let's talk!
  
> On Jan 1, John wrote:
> Previous email content here`);
  assertEquals(quoted.sentiment, SENTIMENT.POSITIVE, 'Quoted text removed - sentiment detected');
  
  // Test 40: Signature removal
  const signature = await classifier.classify(`Yes, I'm interested!
  
---
John Smith
CEO, Acme Inc
john@acme.com`);
  assertEquals(signature.sentiment, SENTIMENT.POSITIVE, 'Signature removed - sentiment detected');
  
  // ============================================================================
  // EDGE CASES
  // ============================================================================
  console.log('\n🔧 EDGE CASE TESTS\n');
  
  // Test 41: Empty string
  const empty = await classifier.classify("");
  assertEquals(empty.intent, INTENT.UNCLEAR, 'Empty string - unclear');
  
  // Test 42: Very long email
  const longEmail = "This is a very long email. ".repeat(100) + "Let's schedule a call.";
  const long = await classifier.classify(longEmail);
  assert(long.sentiment !== undefined, 'Long email - classification works');
  
  // Test 43: Mixed signals (positive + negative)
  const mixed = await classifier.classify("I'm interested but we don't have budget right now. Maybe later?");
  // Mixed signals = should flag for human review OR classify as timing/objection issue
  assert(
    [INTENT.NOT_NOW, INTENT.CURIOUS, INTENT.UNCLEAR, INTENT.OBJECTION].includes(mixed.intent) || 
    mixed.requiresHumanReview === true, 
    'Mixed signals - appropriate intent or flagged for review'
  );
  
  // ============================================================================
  // METADATA HANDLING
  // ============================================================================
  console.log('\n📎 METADATA TESTS\n');
  
  // Test 44: Metadata passed through
  const withMeta = await classifier.classify("Let's talk!", { 
    from: 'test@example.com', 
    subject: 'Re: Partnership', 
    campaignId: 'camp_123' 
  });
  assertEquals(withMeta.from, 'test@example.com', 'Metadata - from preserved');
  assertEquals(withMeta.subject, 'Re: Partnership', 'Metadata - subject preserved');
  assertEquals(withMeta.campaignId, 'camp_123', 'Metadata - campaignId preserved');
  
  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`   Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);
  
  if (failed > 0) {
    console.log('❌ Some tests failed!\n');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
  }
}

// Run tests
runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
