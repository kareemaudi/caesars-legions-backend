// Reply Sentiment Analysis
// Automatically categorize prospect replies to prioritize follow-ups
// Uses OpenAI GPT-4 to classify reply sentiment and extract intent

const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Sentiment categories (in priority order)
 */
const SENTIMENTS = {
  POSITIVE: 'positive',           // Interested, wants to learn more
  QUESTION: 'question',           // Asking for clarification/info
  NEUTRAL: 'neutral',             // Acknowledged but noncommittal
  OUT_OF_OFFICE: 'out_of_office', // Auto-reply
  UNSUBSCRIBE: 'unsubscribe',     // Wants to stop receiving emails
  NEGATIVE: 'negative'            // Not interested, rude, spam complaint
};

/**
 * Action recommendations based on sentiment
 */
const ACTIONS = {
  [SENTIMENTS.POSITIVE]: {
    priority: 'high',
    action: 'immediate_response',
    suggested_delay: '2-4 hours',
    template: 'schedule_call'
  },
  [SENTIMENTS.QUESTION]: {
    priority: 'high',
    action: 'answer_question',
    suggested_delay: '4-8 hours',
    template: 'answer_and_offer_call'
  },
  [SENTIMENTS.NEUTRAL]: {
    priority: 'medium',
    action: 'soft_follow_up',
    suggested_delay: '2-3 days',
    template: 'value_add'
  },
  [SENTIMENTS.OUT_OF_OFFICE]: {
    priority: 'low',
    action: 'follow_up_after_return',
    suggested_delay: '7-14 days',
    template: 'gentle_check_in'
  },
  [SENTIMENTS.UNSUBSCRIBE]: {
    priority: 'critical',
    action: 'remove_from_list',
    suggested_delay: 'immediate',
    template: 'confirm_removal'
  },
  [SENTIMENTS.NEGATIVE]: {
    priority: 'low',
    action: 'mark_not_interested',
    suggested_delay: 'none',
    template: 'polite_exit'
  }
};

/**
 * Analyze reply sentiment using GPT-4
 * @param {string} replyText - The prospect's reply
 * @param {object} context - Original email context
 * @returns {object} - Sentiment analysis result
 */
async function analyzeReplySentiment(replyText, context = {}) {
  const prompt = buildAnalysisPrompt(replyText, context);
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert at analyzing cold email replies for sales teams. 
Classify replies into categories: positive, question, neutral, out_of_office, unsubscribe, negative.
Provide confidence score (0-100), key phrases, and detected intent.
Return JSON only.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // Low temp for consistent classification
      response_format: { type: 'json_object' }
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    
    // Add action recommendation
    const sentiment = result.sentiment || SENTIMENTS.NEUTRAL;
    const action = ACTIONS[sentiment] || ACTIONS[SENTIMENTS.NEUTRAL];
    
    return {
      sentiment,
      confidence: result.confidence || 50,
      intent: result.intent || 'unknown',
      key_phrases: result.key_phrases || [],
      action_recommendation: action,
      raw_analysis: result,
      analyzed_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Sentiment analysis failed:', error.message);
    
    // Fallback to rule-based classification
    return fallbackClassification(replyText);
  }
}

/**
 * Build prompt for GPT-4 analysis
 */
function buildAnalysisPrompt(replyText, context) {
  let prompt = `Analyze this cold email reply:\n\n"${replyText}"\n\n`;
  
  if (context.original_subject) {
    prompt += `Original subject: "${context.original_subject}"\n`;
  }
  
  if (context.original_body) {
    prompt += `Original email (first 200 chars): "${context.original_body.substring(0, 200)}..."\n`;
  }
  
  prompt += `\nClassify into one of: positive, question, neutral, out_of_office, unsubscribe, negative.
Provide:
- sentiment (category)
- confidence (0-100)
- intent (1-2 sentence summary of what they want)
- key_phrases (array of important phrases from their reply)

Return JSON format:
{
  "sentiment": "positive",
  "confidence": 85,
  "intent": "Interested in learning more, wants to schedule a call",
  "key_phrases": ["sounds interesting", "when can we talk?"]
}`;
  
  return prompt;
}

/**
 * Fallback rule-based classification (if OpenAI fails)
 */
function fallbackClassification(replyText) {
  const text = replyText.toLowerCase();
  
  // Out of office patterns
  if (text.includes('out of office') || 
      text.includes('away from my desk') ||
      text.includes('automatic reply') ||
      text.includes('autoreply')) {
    return {
      sentiment: SENTIMENTS.OUT_OF_OFFICE,
      confidence: 95,
      intent: 'Automatic out-of-office reply',
      key_phrases: ['out of office'],
      action_recommendation: ACTIONS[SENTIMENTS.OUT_OF_OFFICE],
      analyzed_at: new Date().toISOString(),
      method: 'fallback_rules'
    };
  }
  
  // Unsubscribe patterns
  if (text.includes('unsubscribe') || 
      text.includes('remove me') ||
      text.includes('stop emailing') ||
      text.includes('not interested') && text.includes('please')) {
    return {
      sentiment: SENTIMENTS.UNSUBSCRIBE,
      confidence: 90,
      intent: 'Wants to unsubscribe',
      key_phrases: extractKeyPhrases(text, ['unsubscribe', 'remove', 'stop']),
      action_recommendation: ACTIONS[SENTIMENTS.UNSUBSCRIBE],
      analyzed_at: new Date().toISOString(),
      method: 'fallback_rules'
    };
  }
  
  // Positive patterns
  const positiveWords = ['interested', 'yes', 'sounds good', 'tell me more', 
                         'schedule', 'call me', 'let\'s talk', 'demo'];
  if (positiveWords.some(word => text.includes(word))) {
    return {
      sentiment: SENTIMENTS.POSITIVE,
      confidence: 70,
      intent: 'Shows interest',
      key_phrases: extractKeyPhrases(text, positiveWords),
      action_recommendation: ACTIONS[SENTIMENTS.POSITIVE],
      analyzed_at: new Date().toISOString(),
      method: 'fallback_rules'
    };
  }
  
  // Question patterns
  if (text.includes('?') || text.includes('how') || text.includes('what') || 
      text.includes('when') || text.includes('why')) {
    return {
      sentiment: SENTIMENTS.QUESTION,
      confidence: 65,
      intent: 'Has questions',
      key_phrases: ['question detected'],
      action_recommendation: ACTIONS[SENTIMENTS.QUESTION],
      analyzed_at: new Date().toISOString(),
      method: 'fallback_rules'
    };
  }
  
  // Negative patterns
  const negativeWords = ['not interested', 'no thanks', 'spam', 'don\'t contact'];
  if (negativeWords.some(word => text.includes(word))) {
    return {
      sentiment: SENTIMENTS.NEGATIVE,
      confidence: 75,
      intent: 'Not interested',
      key_phrases: extractKeyPhrases(text, negativeWords),
      action_recommendation: ACTIONS[SENTIMENTS.NEGATIVE],
      analyzed_at: new Date().toISOString(),
      method: 'fallback_rules'
    };
  }
  
  // Default: neutral
  return {
    sentiment: SENTIMENTS.NEUTRAL,
    confidence: 50,
    intent: 'Unclear intent',
    key_phrases: [],
    action_recommendation: ACTIONS[SENTIMENTS.NEUTRAL],
    analyzed_at: new Date().toISOString(),
    method: 'fallback_rules'
  };
}

/**
 * Extract key phrases that match given keywords
 */
function extractKeyPhrases(text, keywords) {
  const found = [];
  keywords.forEach(keyword => {
    if (text.includes(keyword)) {
      found.push(keyword);
    }
  });
  return found;
}

/**
 * Batch analyze multiple replies
 * @param {array} replies - Array of reply objects with { id, text, context }
 * @returns {array} - Array of analysis results
 */
async function batchAnalyzeReplies(replies, options = {}) {
  const { maxConcurrent = 5, delayMs = 1000 } = options;
  
  const results = [];
  
  // Process in batches to avoid rate limits
  for (let i = 0; i < replies.length; i += maxConcurrent) {
    const batch = replies.slice(i, i + maxConcurrent);
    
    console.log(`📊 Analyzing batch ${Math.floor(i / maxConcurrent) + 1}/${Math.ceil(replies.length / maxConcurrent)}`);
    
    const batchResults = await Promise.all(
      batch.map(reply => 
        analyzeReplySentiment(reply.text, reply.context)
          .then(analysis => ({ id: reply.id, ...analysis }))
          .catch(error => ({
            id: reply.id,
            error: error.message,
            sentiment: SENTIMENTS.NEUTRAL,
            confidence: 0
          }))
      )
    );
    
    results.push(...batchResults);
    
    // Rate limiting delay between batches
    if (i + maxConcurrent < replies.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // Summary stats
  const stats = {
    total: results.length,
    positive: results.filter(r => r.sentiment === SENTIMENTS.POSITIVE).length,
    question: results.filter(r => r.sentiment === SENTIMENTS.QUESTION).length,
    neutral: results.filter(r => r.sentiment === SENTIMENTS.NEUTRAL).length,
    negative: results.filter(r => r.sentiment === SENTIMENTS.NEGATIVE).length,
    unsubscribe: results.filter(r => r.sentiment === SENTIMENTS.UNSUBSCRIBE).length,
    out_of_office: results.filter(r => r.sentiment === SENTIMENTS.OUT_OF_OFFICE).length,
    avg_confidence: Math.round(
      results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length
    )
  };
  
  console.log('\n📊 Sentiment Analysis Summary:');
  console.log(`   ✅ Positive: ${stats.positive} (${Math.round(stats.positive/stats.total*100)}%)`);
  console.log(`   ❓ Question: ${stats.question} (${Math.round(stats.question/stats.total*100)}%)`);
  console.log(`   ➖ Neutral: ${stats.neutral} (${Math.round(stats.neutral/stats.total*100)}%)`);
  console.log(`   ❌ Negative: ${stats.negative} (${Math.round(stats.negative/stats.total*100)}%)`);
  console.log(`   🚫 Unsubscribe: ${stats.unsubscribe}`);
  console.log(`   📧 Out of Office: ${stats.out_of_office}`);
  console.log(`   Avg Confidence: ${stats.avg_confidence}%\n`);
  
  return {
    results,
    stats
  };
}

/**
 * Get priority inbox (replies sorted by priority)
 */
function prioritizeReplies(analyzedReplies) {
  const priorityOrder = {
    'high': 1,
    'critical': 2,
    'medium': 3,
    'low': 4
  };
  
  return analyzedReplies
    .filter(r => r.sentiment !== SENTIMENTS.OUT_OF_OFFICE) // Filter out OOO
    .sort((a, b) => {
      const aPriority = a.action_recommendation?.priority || 'medium';
      const bPriority = b.action_recommendation?.priority || 'medium';
      return (priorityOrder[aPriority] || 3) - (priorityOrder[bPriority] || 3);
    });
}

module.exports = {
  analyzeReplySentiment,
  batchAnalyzeReplies,
  prioritizeReplies,
  SENTIMENTS,
  ACTIONS
};
