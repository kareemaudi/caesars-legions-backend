// Test Reply Sentiment Analysis
// Demonstrates sentiment classification on sample replies

const { analyzeReplySentiment, batchAnalyzeReplies, prioritizeReplies } = require('../lib/reply-sentiment');

// Sample replies (real-world examples)
const sampleReplies = [
  {
    id: 1,
    text: "Hey, this sounds interesting! I'd love to hear more. When can we hop on a quick call?",
    context: {
      original_subject: "Quick question about outbound",
      original_body: "Hi John, saw you're building a B2B SaaS..."
    }
  },
  {
    id: 2,
    text: "Thanks for reaching out. Can you send me more info about pricing and how this works?",
    context: {}
  },
  {
    id: 3,
    text: "Not interested. Please remove me from your list.",
    context: {}
  },
  {
    id: 4,
    text: "I'm currently out of the office until Feb 10th. I'll respond when I'm back.",
    context: {}
  },
  {
    id: 5,
    text: "Appreciate the email but we're already working with another vendor. Best of luck!",
    context: {}
  },
  {
    id: 6,
    text: "Interesting timing - we were just discussing this yesterday. What's your availability next week?",
    context: {
      original_subject: "Cold email automation"
    }
  },
  {
    id: 7,
    text: "How does this compare to Instantly or Lemlist? What makes you different?",
    context: {}
  },
  {
    id: 8,
    text: "ok",
    context: {}
  },
  {
    id: 9,
    text: "This is SPAM. Stop emailing me immediately or I'll report you.",
    context: {}
  },
  {
    id: 10,
    text: "We don't need this right now, but maybe in Q3. Mind following up in a few months?",
    context: {}
  }
];

async function testSentimentAnalysis() {
  console.log('🧪 Testing Reply Sentiment Analysis\n');
  console.log('=' .repeat(80));
  
  // Test individual analysis
  console.log('\n📧 Individual Reply Analysis:\n');
  
  for (const reply of sampleReplies.slice(0, 3)) {
    console.log(`\nReply #${reply.id}: "${reply.text.substring(0, 60)}..."`);
    console.log('-'.repeat(80));
    
    const analysis = await analyzeReplySentiment(reply.text, reply.context);
    
    console.log(`Sentiment: ${analysis.sentiment.toUpperCase()}`);
    console.log(`Confidence: ${analysis.confidence}%`);
    console.log(`Intent: ${analysis.intent}`);
    console.log(`Key Phrases: ${analysis.key_phrases.join(', ')}`);
    console.log(`\nRecommended Action:`);
    console.log(`  Priority: ${analysis.action_recommendation.priority}`);
    console.log(`  Action: ${analysis.action_recommendation.action}`);
    console.log(`  Delay: ${analysis.action_recommendation.suggested_delay}`);
    console.log(`  Template: ${analysis.action_recommendation.template}`);
    
    // Rate limit pause
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Test batch analysis
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 Batch Analysis (All 10 Replies):\n');
  
  const { results, stats } = await batchAnalyzeReplies(sampleReplies, {
    maxConcurrent: 3,
    delayMs: 500
  });
  
  // Show priority inbox
  console.log('\n' + '='.repeat(80));
  console.log('🎯 Priority Inbox (High Priority First):\n');
  
  const prioritized = prioritizeReplies(results);
  
  prioritized.slice(0, 5).forEach((reply, index) => {
    const original = sampleReplies.find(r => r.id === reply.id);
    console.log(`${index + 1}. [${reply.action_recommendation.priority.toUpperCase()}] ${original.text.substring(0, 50)}...`);
    console.log(`   → ${reply.sentiment} (${reply.confidence}% confidence)`);
    console.log(`   → Action: ${reply.action_recommendation.action}\n`);
  });
  
  // Calculate response rate potential
  console.log('='.repeat(80));
  console.log('💡 Insights:\n');
  
  const positiveRate = Math.round((stats.positive / stats.total) * 100);
  const engagementRate = Math.round(((stats.positive + stats.question) / stats.total) * 100);
  
  console.log(`Response Rate: ${stats.total - stats.out_of_office}/${stats.total} (${Math.round((stats.total - stats.out_of_office)/stats.total*100)}%)`);
  console.log(`Positive Rate: ${stats.positive}/${stats.total} (${positiveRate}%)`);
  console.log(`Engagement Rate: ${stats.positive + stats.question}/${stats.total} (${engagementRate}%)`);
  console.log(`Unsubscribe Rate: ${stats.unsubscribe}/${stats.total} (${Math.round(stats.unsubscribe/stats.total*100)}%)`);
  
  console.log('\n✅ Test complete!\n');
}

// Run test
if (require.main === module) {
  testSentimentAnalysis().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
}

module.exports = { testSentimentAnalysis };
