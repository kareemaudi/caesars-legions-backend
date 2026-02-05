// ============================================================================
// REPLY CLASSIFIER - Caesar's Legions
// ============================================================================
// Purpose: Classify email replies by sentiment and intent
// Features: Pattern matching + optional LLM enhancement
// Output: Sentiment, intent, priority, suggested action
// ============================================================================

/**
 * Reply classification categories
 */
const SENTIMENT = {
  POSITIVE: 'positive',      // Interested, wants to learn more
  NEUTRAL: 'neutral',        // Asking questions, unclear intent
  NEGATIVE: 'negative',      // Not interested, objection
  UNSUBSCRIBE: 'unsubscribe' // Explicit opt-out request
};

const INTENT = {
  INTERESTED: 'interested',           // Wants demo/call/more info
  CURIOUS: 'curious',                 // Has questions
  OBJECTION: 'objection',             // Has concerns/pushback
  NOT_NOW: 'not_now',                 // Bad timing
  NOT_DECISION_MAKER: 'not_dm',       // Wrong person
  COMPETITOR: 'competitor',           // Using alternative
  UNSUBSCRIBE: 'unsubscribe',         // Remove from list
  OUT_OF_OFFICE: 'ooo',               // Auto-reply
  BOUNCE: 'bounce',                   // Delivery failure
  UNCLEAR: 'unclear'                  // Can't determine
};

const PRIORITY = {
  HOT: 'hot',       // Respond within 1 hour
  WARM: 'warm',     // Respond within 4 hours
  COOL: 'cool',     // Respond within 24 hours
  COLD: 'cold',     // Low priority / auto-handle
  NONE: 'none'      // No action needed
};

// ============================================================================
// PATTERN DEFINITIONS
// ============================================================================

const POSITIVE_PATTERNS = [
  // Direct interest (but NOT "not interested" - handled by negative pattern check first)
  /\b(?<!not\s)interested\b/i,
  /\b(intrigued|tell me more|learn more)\b/i,
  /\b(sounds? (good|great|interesting)|i('m| am) open)\b/i,
  /\b(let'?s? (talk|chat|connect|schedule|meet))\b/i,
  /\b(send (me )?(more )?(info|details|information))\b/i,
  /\b(book(ing)?|schedule|set up) (a )?(call|meeting|demo|time)\b/i,
  /\b(available|free) (this|next) (week|monday|tuesday|wednesday|thursday|friday)\b/i,
  /\b(what('s| is) your (availability|calendar))\b/i,
  /\b(yes|yeah|sure|absolutely|definitely)\b/i,
  /\bI('d| would) (like|love|be happy) to\b/i,
  /\bthis (could|might) (work|help|be useful)\b/i,
  
  // Pricing/timing interest
  /\b(how much|what('s| is) (the )?(price|cost|pricing))\b/i,
  /\b(send (me )?a? ?quote|get (a )?quote)\b/i,
  /\bwhat (are|do) you (offer|charge)\b/i,
  
  // Referral interest
  /\b(connect|introduce) (me )?with\b/i,
  /\b(forward|share) this (to|with)\b/i
];

// Negation patterns that CANCEL positive signals
const NEGATION_PATTERNS = [
  /\bnot interested\b/i,
  /\b(no|not) thanks?\b/i,
  /\bnot (right )?now\b/i,
  /\bdon'?t have\b/i,
  /\bcan'?t afford\b/i
];

const NEGATIVE_PATTERNS = [
  // Direct rejection
  /\b(not interested|no thanks?|pass|no thank you)\b/i,
  /\b(don'?t (need|want)|we'?re? (good|fine|set))\b/i,
  /\b(stop (contacting|emailing)|don'?t (contact|email) (me|us))\b/i,
  /\b(doesn'?t (fit|work)|not a (good )?fit)\b/i,
  /\b(waste of time)\b/i,
  
  // Budget/timing objections
  /\b(no budget|don'?t have budget|can'?t afford|too expensive)\b/i,
  /\b(not (the )?right time|bad timing|maybe (later|next (year|quarter)))\b/i,
  /\b(not (looking|in the market)|not a priority)\b/i
];

const UNSUBSCRIBE_PATTERNS = [
  /\b(unsubscribe|opt[- ]?out|remove (me|us))\b/i,
  /\b(take (me|us) off|stop (sending|emailing))\b/i,
  /\b(don'?t (ever )?email|never (contact|email))\b/i,
  /\b(gdpr|data protection|right to be forgotten)\b/i,
  /\b(legal action|lawyer|attorney|sue)\b/i,
  /\b(reported?|report(ing)?) (this )?(as |to )?spam\b/i,
  /\b(mark(ed|ing)|flagged?) (this )?(as )?spam\b/i,
  /\b(spam|scam)\b.*\b(don'?t|stop|never)\b/i,
  /\b(don'?t|stop|never)\b.*\b(again|me)\b/i
];

const NOT_DECISION_MAKER_PATTERNS = [
  /\b(wrong person|not (the )?right person)\b/i,
  /\b(i('m| am) not (the )?(one|person)|not my (area|department))\b/i,
  /\b(try (contacting|reaching)|reach out to|contact)\s+\w+/i,
  /\b(forward(ed|ing)? (this )?to|pass(ed|ing)? (this )?(to|along))\b/i,
  /\b(cc'?d|copied|adding)\s+\w+\s+(who|from)\b/i
];

const COMPETITOR_PATTERNS = [
  /\b(already (using|use|have)|we (use|have|got))\s+(instantly|lemlist|smartlead|reply\.io|mailshake|woodpecker|apollo|outreach|salesloft)\b/i,
  /\b(using|use|have)\s+(instantly|lemlist|smartlead|reply\.io|mailshake|woodpecker|apollo|outreach|salesloft)\b/i,
  /\b(happy|satisfied|quite happy) with\b/i,
  /\b(built|have|using) (our )?(own|in-?house)\b/i,
  /\b(just (signed|started)|recently (switched|moved))\b/i,
  /\balready\b.*\b(instantly|lemlist|smartlead)\b/i
];

const OUT_OF_OFFICE_PATTERNS = [
  /\b(out of (the )?office|ooo|away from (my )?(desk|email))\b/i,
  /\b(on (vacation|holiday|leave|pto))\b/i,
  /\b(return(ing)? on|back (on|in)|will (respond|reply) when)\b/i,
  /\b(limited (access|availability)|checking email (intermittently|occasionally))\b/i,
  /\b(auto[- ]?reply|automatic (reply|response))\b/i
];

const BOUNCE_PATTERNS = [
  /\b(undeliverable|delivery (failed|failure)|could not (be )?deliver)\b/i,
  /\b(mailbox (full|not found)|user (unknown|not found))\b/i,
  /\b(address (rejected|not found)|invalid (address|recipient))\b/i,
  /\b(permanent (error|failure)|550|554|5\.\d\.\d)\b/i,
  /\b(mailer[- ]daemon|postmaster)\b/i
];

const NOT_NOW_PATTERNS = [
  /\b(not (right )?now|bad time|busy (period|season))\b/i,
  /\b(check back|reach out|follow up).*(later|next|in \d+)\b/i,
  /\b(next (month|quarter|year)|after (q\d|the holidays))\b/i,
  /\b(get back to you|circle back|reconnect).*(later|soon|when)\b/i,
  /\b(on my radar|keep (me|us) (in mind|posted))\b/i
];

const QUESTION_PATTERNS = [
  /\b(what|how|who|when|where|why|which|can you|could you|do you|does|is it)\b.*\?/i,
  /\b(tell me (more )?about|explain|clarify)\b/i,
  /\b(wondering|curious) (about|if|whether)\b/i
];

// ============================================================================
// REPLY CLASSIFIER CLASS
// ============================================================================

class ReplyClassifier {
  /**
   * @param {Object} options - Configuration options
   * @param {Function} options.llmClassifier - Optional async LLM function for enhanced classification
   * @param {boolean} options.useLLM - Whether to use LLM for ambiguous cases (default: false)
   */
  constructor(options = {}) {
    this.llmClassifier = options.llmClassifier || null;
    this.useLLM = options.useLLM !== false && !!this.llmClassifier;
    this.confidenceThreshold = options.confidenceThreshold || 0.7;
  }

  /**
   * Classify an email reply
   * @param {string} body - Reply body text
   * @param {Object} metadata - Optional metadata (subject, from, etc.)
   * @returns {Object} Classification result
   */
  async classify(body, metadata = {}) {
    // Normalize text
    const text = this.normalizeText(body);
    
    // Quick pattern-based classification
    const patternResult = this.classifyByPatterns(text);
    
    // If high confidence or LLM disabled, return pattern result
    if (patternResult.confidence >= this.confidenceThreshold || !this.useLLM) {
      return this.buildResult(patternResult, text, metadata);
    }
    
    // Use LLM for ambiguous cases
    try {
      const llmResult = await this.classifyWithLLM(text, metadata);
      return this.mergeResults(patternResult, llmResult, text, metadata);
    } catch (err) {
      console.warn('LLM classification failed, using pattern result:', err.message);
      return this.buildResult(patternResult, text, metadata);
    }
  }

  /**
   * Normalize text for classification
   */
  normalizeText(text) {
    return text
      .replace(/<[^>]+>/g, ' ')           // Remove HTML tags
      .replace(/\s+/g, ' ')                // Normalize whitespace
      .replace(/^>.*$/gm, '')              // Remove quoted text
      .replace(/^On .* wrote:$/gm, '')     // Remove reply headers
      .replace(/-{3,}.*$/s, '')            // Remove signature (--- and after)
      .replace(/^Sent from .*/gm, '')      // Remove mobile signatures
      .trim();
  }

  /**
   * Classify using pattern matching
   */
  classifyByPatterns(text) {
    // Check for bounces first (highest priority)
    if (this.matchesAny(text, BOUNCE_PATTERNS)) {
      return { sentiment: SENTIMENT.NEGATIVE, intent: INTENT.BOUNCE, confidence: 0.95 };
    }
    
    // Check for out of office
    if (this.matchesAny(text, OUT_OF_OFFICE_PATTERNS)) {
      return { sentiment: SENTIMENT.NEUTRAL, intent: INTENT.OUT_OF_OFFICE, confidence: 0.9 };
    }
    
    // Check for unsubscribe (high priority)
    if (this.matchesAny(text, UNSUBSCRIBE_PATTERNS)) {
      return { sentiment: SENTIMENT.UNSUBSCRIBE, intent: INTENT.UNSUBSCRIBE, confidence: 0.95 };
    }
    
    // Check for competitors explicitly (before scoring)
    if (this.matchesAny(text, COMPETITOR_PATTERNS)) {
      return { sentiment: SENTIMENT.NEGATIVE, intent: INTENT.COMPETITOR, confidence: 0.85 };
    }
    
    // Check for explicit negations first (these override positive signals)
    const hasNegation = this.matchesAny(text, NEGATION_PATTERNS);
    
    // Score each category
    let scores = {
      positive: this.scorePatterns(text, POSITIVE_PATTERNS),
      negative: this.scorePatterns(text, NEGATIVE_PATTERNS),
      not_dm: this.scorePatterns(text, NOT_DECISION_MAKER_PATTERNS),
      competitor: this.scorePatterns(text, COMPETITOR_PATTERNS),
      not_now: this.scorePatterns(text, NOT_NOW_PATTERNS),
      question: this.scorePatterns(text, QUESTION_PATTERNS)
    };
    
    // If negation detected, reduce positive score significantly
    if (hasNegation) {
      scores.positive = Math.max(0, scores.positive - 3);
      scores.negative += 2;
    }
    
    // Find dominant category
    const maxScore = Math.max(...Object.values(scores));
    const dominantCategory = Object.keys(scores).find(k => scores[k] === maxScore);
    
    // Determine result based on scores
    if (maxScore === 0) {
      // No patterns matched
      return { sentiment: SENTIMENT.NEUTRAL, intent: INTENT.UNCLEAR, confidence: 0.3 };
    }
    
    // Map category to sentiment/intent
    const mapping = {
      positive: { sentiment: SENTIMENT.POSITIVE, intent: INTENT.INTERESTED },
      negative: { sentiment: SENTIMENT.NEGATIVE, intent: INTENT.OBJECTION },
      not_dm: { sentiment: SENTIMENT.NEUTRAL, intent: INTENT.NOT_DECISION_MAKER },
      competitor: { sentiment: SENTIMENT.NEGATIVE, intent: INTENT.COMPETITOR },
      not_now: { sentiment: SENTIMENT.NEUTRAL, intent: INTENT.NOT_NOW },
      question: { sentiment: SENTIMENT.NEUTRAL, intent: INTENT.CURIOUS }
    };
    
    const result = mapping[dominantCategory];
    
    // Calculate confidence based on score difference and match count
    const secondHighest = Object.values(scores)
      .filter(s => s !== maxScore)
      .sort((a, b) => b - a)[0] || 0;
    
    const scoreDiff = maxScore - secondHighest;
    const confidence = Math.min(0.95, 0.5 + (maxScore * 0.1) + (scoreDiff * 0.15));
    
    return { ...result, confidence, scores };
  }

  /**
   * Check if text matches any pattern
   */
  matchesAny(text, patterns) {
    return patterns.some(p => p.test(text));
  }

  /**
   * Score text against patterns (count matches)
   */
  scorePatterns(text, patterns) {
    return patterns.filter(p => p.test(text)).length;
  }

  /**
   * Classify using LLM (for ambiguous cases)
   */
  async classifyWithLLM(text, metadata) {
    const prompt = `Classify this email reply. Return JSON only.

Email: "${text.substring(0, 500)}"

Categories:
- sentiment: positive/neutral/negative/unsubscribe
- intent: interested/curious/objection/not_now/not_dm/competitor/unsubscribe/ooo/unclear
- confidence: 0.0-1.0

JSON:`;

    const response = await this.llmClassifier(prompt);
    
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('Failed to parse LLM response:', e);
    }
    
    return null;
  }

  /**
   * Merge pattern and LLM results
   */
  mergeResults(patternResult, llmResult, text, metadata) {
    if (!llmResult) {
      return this.buildResult(patternResult, text, metadata);
    }
    
    // If LLM has higher confidence, prefer it
    if (llmResult.confidence > patternResult.confidence) {
      return this.buildResult(llmResult, text, metadata);
    }
    
    // Otherwise use pattern result
    return this.buildResult(patternResult, text, metadata);
  }

  /**
   * Build final classification result
   */
  buildResult(classification, text, metadata) {
    const result = {
      sentiment: classification.sentiment,
      intent: classification.intent,
      confidence: classification.confidence,
      priority: this.getPriority(classification),
      suggestedAction: this.getSuggestedAction(classification),
      requiresHumanReview: this.needsHumanReview(classification),
      summary: this.generateSummary(classification, text),
      timestamp: new Date().toISOString()
    };
    
    // Add metadata if provided
    if (metadata.from) result.from = metadata.from;
    if (metadata.subject) result.subject = metadata.subject;
    if (metadata.campaignId) result.campaignId = metadata.campaignId;
    
    // Add scores for debugging if available
    if (classification.scores) {
      result.debug = { scores: classification.scores };
    }
    
    return result;
  }

  /**
   * Determine priority based on classification
   */
  getPriority(classification) {
    const { sentiment, intent } = classification;
    
    // Hot: Direct interest
    if (sentiment === SENTIMENT.POSITIVE && intent === INTENT.INTERESTED) {
      return PRIORITY.HOT;
    }
    
    // Warm: Questions or referrals
    if (intent === INTENT.CURIOUS || intent === INTENT.NOT_DECISION_MAKER) {
      return PRIORITY.WARM;
    }
    
    // Cool: Not now / needs nurturing
    if (intent === INTENT.NOT_NOW) {
      return PRIORITY.COOL;
    }
    
    // Cold: Objections (might be salvageable)
    if (sentiment === SENTIMENT.NEGATIVE && intent === INTENT.OBJECTION) {
      return PRIORITY.COLD;
    }
    
    // None: Unsubscribe, bounce, OOO, competitor
    if ([INTENT.UNSUBSCRIBE, INTENT.BOUNCE, INTENT.OUT_OF_OFFICE, INTENT.COMPETITOR].includes(intent)) {
      return PRIORITY.NONE;
    }
    
    // Default: Warm (unclear = potential opportunity)
    return PRIORITY.WARM;
  }

  /**
   * Get suggested action based on classification
   */
  getSuggestedAction(classification) {
    const { sentiment, intent } = classification;
    
    const actions = {
      [INTENT.INTERESTED]: 'SEND_CALENDAR_LINK - Strike while hot, send availability',
      [INTENT.CURIOUS]: 'ANSWER_QUESTIONS - Address their questions, then soft close',
      [INTENT.OBJECTION]: 'HANDLE_OBJECTION - Acknowledge concern, provide counter-point',
      [INTENT.NOT_NOW]: 'SCHEDULE_FOLLOWUP - Add to nurture sequence, follow up in 30-60 days',
      [INTENT.NOT_DECISION_MAKER]: 'ASK_FOR_REFERRAL - Thank them, ask for correct contact',
      [INTENT.COMPETITOR]: 'DIFFERENTIATE - Highlight unique value vs competitor',
      [INTENT.UNSUBSCRIBE]: 'REMOVE_FROM_LIST - Immediately unsubscribe, confirm removal',
      [INTENT.OUT_OF_OFFICE]: 'WAIT_AND_RETRY - Schedule follow-up for after return date',
      [INTENT.BOUNCE]: 'VERIFY_EMAIL - Remove or find alternative contact',
      [INTENT.UNCLEAR]: 'HUMAN_REVIEW - Review manually before responding'
    };
    
    return actions[intent] || 'HUMAN_REVIEW - Classification unclear';
  }

  /**
   * Determine if human review is needed
   */
  needsHumanReview(classification) {
    // Always review low confidence
    if (classification.confidence < 0.6) return true;
    
    // Review objections (might be salvageable with right response)
    if (classification.intent === INTENT.OBJECTION) return true;
    
    // Review unclear intent
    if (classification.intent === INTENT.UNCLEAR) return true;
    
    return false;
  }

  /**
   * Generate a brief summary
   */
  generateSummary(classification, text) {
    const { sentiment, intent } = classification;
    
    const summaries = {
      [INTENT.INTERESTED]: '🟢 Interested - wants to talk',
      [INTENT.CURIOUS]: '🟡 Has questions',
      [INTENT.OBJECTION]: '🔴 Has objections',
      [INTENT.NOT_NOW]: '🟡 Bad timing - follow up later',
      [INTENT.NOT_DECISION_MAKER]: '🟡 Wrong person - get referral',
      [INTENT.COMPETITOR]: '🔴 Using competitor',
      [INTENT.UNSUBSCRIBE]: '⛔ Unsubscribe request',
      [INTENT.OUT_OF_OFFICE]: '📅 Out of office',
      [INTENT.BOUNCE]: '❌ Email bounced',
      [INTENT.UNCLEAR]: '❓ Needs review'
    };
    
    return summaries[intent] || '❓ Unknown';
  }

  /**
   * Batch classify multiple replies
   */
  async classifyBatch(replies) {
    const results = await Promise.all(
      replies.map(r => this.classify(r.body, r.metadata))
    );
    
    // Add stats
    const stats = {
      total: results.length,
      byPriority: {},
      bySentiment: {},
      byIntent: {},
      needsReview: results.filter(r => r.requiresHumanReview).length
    };
    
    for (const r of results) {
      stats.byPriority[r.priority] = (stats.byPriority[r.priority] || 0) + 1;
      stats.bySentiment[r.sentiment] = (stats.bySentiment[r.sentiment] || 0) + 1;
      stats.byIntent[r.intent] = (stats.byIntent[r.intent] || 0) + 1;
    }
    
    return { results, stats };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ReplyClassifier,
  SENTIMENT,
  INTENT,
  PRIORITY
};

// ============================================================================
// USAGE EXAMPLE
// ============================================================================
/*

const { ReplyClassifier, PRIORITY } = require('./reply-classifier');

// Basic usage
const classifier = new ReplyClassifier();

// Classify a reply
const result = await classifier.classify(`
  Hi there,
  
  This sounds interesting! I'd love to learn more about how this works.
  Are you free for a call next Tuesday?
  
  Best,
  John
`);

console.log(result);
// {
//   sentiment: 'positive',
//   intent: 'interested',
//   confidence: 0.85,
//   priority: 'hot',
//   suggestedAction: 'SEND_CALENDAR_LINK - Strike while hot, send availability',
//   requiresHumanReview: false,
//   summary: '🟢 Interested - wants to talk'
// }

// With LLM enhancement
const enhancedClassifier = new ReplyClassifier({
  useLLM: true,
  llmClassifier: async (prompt) => {
    // Call your LLM here (OpenAI, Claude, etc.)
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    });
    return response.choices[0].message.content;
  }
});

// Batch classify
const { results, stats } = await classifier.classifyBatch([
  { body: 'Sounds great, let\'s talk!', metadata: { from: 'john@example.com' } },
  { body: 'Not interested, please remove me', metadata: { from: 'jane@example.com' } },
  { body: 'I\'m out of office until Monday', metadata: { from: 'bob@example.com' } }
]);

console.log(stats);
// {
//   total: 3,
//   byPriority: { hot: 1, none: 2 },
//   bySentiment: { positive: 1, unsubscribe: 1, neutral: 1 },
//   byIntent: { interested: 1, unsubscribe: 1, ooo: 1 },
//   needsReview: 0
// }

// Filter hot leads
const hotLeads = results.filter(r => r.priority === PRIORITY.HOT);

*/
