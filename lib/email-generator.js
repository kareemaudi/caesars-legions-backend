const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Performance tracking
const performanceLog = {
  totalCalls: 0,
  totalTokens: 0,
  totalCost: 0,
  avgLatencyMs: 0,
  errors: 0
};

/**
 * Retry wrapper for OpenAI API calls
 * Handles rate limits and transient errors
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelayMs = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const isRetriable = 
        error.status === 429 || // Rate limit
        error.status === 503 || // Service unavailable
        error.status >= 500;    // Server errors

      if (!isRetriable || isLastAttempt) {
        throw error;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`[Email Gen] Retry ${attempt}/${maxRetries} after ${delayMs}ms (${error.message})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Track API call performance and cost
 */
function trackPerformance(latencyMs, tokens, cost) {
  performanceLog.totalCalls++;
  performanceLog.totalTokens += tokens;
  performanceLog.totalCost += cost;
  performanceLog.avgLatencyMs = 
    (performanceLog.avgLatencyMs * (performanceLog.totalCalls - 1) + latencyMs) / 
    performanceLog.totalCalls;
}

/**
 * Get performance stats
 */
function getStats() {
  return {
    ...performanceLog,
    avgCostPerEmail: performanceLog.totalCalls > 0 ? 
      performanceLog.totalCost / performanceLog.totalCalls : 0,
    errorRate: performanceLog.totalCalls > 0 ? 
      performanceLog.errors / performanceLog.totalCalls : 0
  };
}

/**
 * Generate a personalized cold email using GPT-4
 * @param {Object} params
 * @param {Object} params.lead - Lead data (name, company, title)
 * @param {Object} params.client - Client data (company, value_prop)
 * @param {string} params.template - Optional template to use
 * @returns {Promise<Object>} - {subject, body, personalization_data}
 */
async function generateEmail({ lead, client, template }) {
  // Enhanced prompt based on cold email best practices
  // Key improvements:
  // 1. Pattern interrupt in subject (not generic)
  // 2. Specific compliment (not generic praise)
  // 3. One clear value prop
  // 4. Soft CTA (permission-based)
  // 5. No hype, no BS
  const prompt = `You are a top cold email copywriter (5%+ reply rates). Write a personalized email:

**Sender:**
- Company: ${client.company}
- Value Prop: ${client.value_prop}
- Target: ${client.target_audience}

**Recipient:**
- Name: ${lead.first_name} ${lead.last_name}
- Title: ${lead.title}
- Company: ${lead.company}

**Framework (120 words max):**

1. SUBJECT (40 chars max):
   - Specific to their company/role (NOT "Quick question")
   - Pattern interrupt or genuine curiosity
   - Examples: "${lead.company}'s outbound strategy", "noticed your Series A", "${lead.title} tech stack"

2. OPENING (1 line):
   - Specific compliment or observation about ${lead.company}
   - NOT generic ("I love what you're building")
   - BE SPECIFIC (product feature, recent news, hiring for X role)

3. BRIDGE (1 line):
   - "That's why I thought..." or "Given you're scaling..."
   - Connect their context to your value prop

4. VALUE (2 lines):
   - ONE clear benefit for ${lead.title} specifically
   - Concrete outcome (not "help you succeed")
   - Example: "3x your reply rates" or "cut setup from 3 weeks to 48 hours"

5. SOFT CTA (1 line):
   - Permission-based: "Worth exploring?" or "Curious?"
   - NOT "Book a demo" or "Let's chat"

**AVOID:**
- Generic praise ("great work!", "congrats!")
- Multiple CTAs
- Feature lists
- Hype words ("game-changer", "revolutionary")
- Long paragraphs

Return ONLY this JSON:
{
  "subject": "...",
  "body": "...",
  "hook": "specific observation used"
}`;

  const startTime = Date.now();

  try {
    const completion = await retryWithBackoff(async () => {
      return await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a cold email expert. Your emails get 5%+ reply rates. Always return valid JSON. Be specific, not generic.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8, // Higher temp for more creative hooks
        max_tokens: 400,
        response_format: { type: "json_object" } // Force JSON response
      });
    });

    const latencyMs = Date.now() - startTime;
    const tokens = completion.usage.total_tokens;
    const cost = (completion.usage.prompt_tokens * 0.03 + completion.usage.completion_tokens * 0.06) / 1000;
    
    trackPerformance(latencyMs, tokens, cost);

    const content = completion.choices[0].message.content.trim();
    
    // Parse JSON (now guaranteed by response_format)
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.warn('[Email Gen] JSON parse failed despite format enforcement');
      performanceLog.errors++;
      result = {
        subject: 'Quick question',
        body: content,
        hook: 'Parse error'
      };
    }

    console.log(`[Email Gen] ✓ Generated in ${latencyMs}ms (${tokens} tokens, $${cost.toFixed(4)})`);

    return {
      subject: result.subject,
      body: result.body,
      personalization_data: JSON.stringify({
        hook: result.hook,
        lead_company: lead.company,
        lead_title: lead.title,
        tokens_used: tokens,
        cost_usd: cost,
        latency_ms: latencyMs,
        generated_at: new Date().toISOString()
      })
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    performanceLog.errors++;
    
    console.error(`[Email Gen] ✗ Error after ${latencyMs}ms:`, error.message);
    
    // Improved fallback template (still better than generic)
    return {
      subject: `${lead.company}'s ${client.target_audience} strategy`,
      body: `Hi ${lead.first_name},\n\nI noticed ${lead.company} is in the ${client.target_audience} space.\n\n${client.value_prop}\n\nWorth a quick conversation to see if we're a fit?\n\nBest,\n${client.name}`,
      personalization_data: JSON.stringify({
        hook: 'Fallback (API error)',
        error: error.message,
        error_code: error.status || 'unknown',
        latency_ms: latencyMs,
        generated_at: new Date().toISOString()
      })
    };
  }
}

/**
 * Generate follow-up email
 * Best practices for follow-ups:
 * - Add NEW value (case study, insight, data point)
 * - Different angle than original email
 * - Easy out (permission to decline)
 * - NOT "just checking in" or "bumping this up"
 */
async function generateFollowUp({ lead, client, previousEmail, daysSince }) {
  const followUpStrategy = daysSince <= 4 ? 'value_add' : 'permission_close';
  
  const prompt = `Write a follow-up email (80 words max).

**Context:**
- Sent ${daysSince} days ago to ${lead.first_name} (${lead.title} at ${lead.company})
- Original subject: "${previousEmail.subject}"
- No reply yet

**Strategy: ${followUpStrategy}**
${followUpStrategy === 'value_add' ? `
- Day 3 follow-up = ADD NEW VALUE
- Share quick insight, stat, or case study
- Different angle than original email
- Example: "Saw this worked for [similar company]..." or "Quick stat: ${client.target_audience} see X% improvement..."
` : `
- Day 7 follow-up = PERMISSION TO CLOSE
- Acknowledge they're busy
- Give easy out
- Final nudge: "Should I close this loop?"
`}

**AVOID:**
- "Just checking in" / "circling back" / "bumping this"
- Repeating original email
- Multiple CTAs

Return JSON: {"subject": "...", "body": "..."}`;

  const startTime = Date.now();

  try {
    const completion = await retryWithBackoff(async () => {
      return await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { 
            role: 'system', 
            content: 'You write non-pushy follow-ups that add value. Never "just checking in". Always return valid JSON.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 250,
        response_format: { type: "json_object" }
      });
    });

    const latencyMs = Date.now() - startTime;
    const tokens = completion.usage.total_tokens;
    const cost = (completion.usage.prompt_tokens * 0.03 + completion.usage.completion_tokens * 0.06) / 1000;
    
    trackPerformance(latencyMs, tokens, cost);

    const result = JSON.parse(completion.choices[0].message.content.trim());
    
    console.log(`[Follow-up Gen] ✓ Day ${daysSince} follow-up in ${latencyMs}ms`);

    return {
      subject: result.subject,
      body: result.body,
      metadata: {
        strategy: followUpStrategy,
        days_since: daysSince,
        tokens_used: tokens,
        cost_usd: cost,
        latency_ms: latencyMs
      }
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    performanceLog.errors++;
    
    console.error(`[Follow-up Gen] ✗ Error after ${latencyMs}ms:`, error.message);
    
    // Improved fallback based on day
    const fallbackBody = daysSince <= 4 
      ? `Hi ${lead.first_name},\n\nQuick follow-up: We've helped similar ${client.target_audience} companies ${client.value_prop.toLowerCase()}.\n\nWorth exploring for ${lead.company}?\n\nBest,\n${client.name}`
      : `Hi ${lead.first_name},\n\nI know you're busy. Should I close this loop, or is there a better time to revisit?\n\nNo worries either way.\n\nBest,\n${client.name}`;

    return {
      subject: `Re: ${previousEmail.subject}`,
      body: fallbackBody,
      metadata: {
        strategy: 'fallback',
        error: error.message,
        latency_ms: latencyMs
      }
    };
  }
}

/**
 * Generate A/B test variants for cold emails
 * Tests different angles to optimize reply rates
 * @param {Object} params - Same as generateEmail
 * @param {number} variantCount - Number of variants to generate (2-4)
 * @returns {Promise<Array>} - Array of email variants with test labels
 */
async function generateVariants({ lead, client, variantCount = 2 }) {
  if (variantCount < 2 || variantCount > 4) {
    throw new Error('Variant count must be between 2-4');
  }

  // Define different angles to test
  const testAngles = [
    {
      name: 'problem_focused',
      instruction: 'Lead with the pain point they likely have. Make them feel the problem before offering solution.'
    },
    {
      name: 'social_proof',
      instruction: 'Open with success story or stat from similar company. Build credibility first.'
    },
    {
      name: 'curiosity_gap',
      instruction: 'Tease an insight or opportunity without revealing it. Make them curious to learn more.'
    },
    {
      name: 'direct_value',
      instruction: 'Immediately state the concrete outcome (number/metric). No buildup, straight value.'
    }
  ];

  // Select angles for this test
  const selectedAngles = testAngles.slice(0, variantCount);

  const variants = await Promise.all(
    selectedAngles.map(async (angle, index) => {
      const enhancedPrompt = `You are a top cold email copywriter (5%+ reply rates). Write a personalized email using the **${angle.name.toUpperCase()}** approach:

${angle.instruction}

**Sender:**
- Company: ${client.company}
- Value Prop: ${client.value_prop}
- Target: ${client.target_audience}

**Recipient:**
- Name: ${lead.first_name} ${lead.last_name}
- Title: ${lead.title}
- Company: ${lead.company}

**Framework (120 words max):**

1. SUBJECT (40 chars max):
   - Align with ${angle.name} strategy
   - Specific to their company/role
   - Pattern interrupt

2. BODY (follow ${angle.name} approach):
   - Opening: ${angle.instruction}
   - Keep total under 120 words
   - One clear value prop
   - Soft CTA (permission-based)

**AVOID:**
- Generic praise
- Multiple CTAs
- Feature lists
- Hype words

Return ONLY this JSON:
{
  "subject": "...",
  "body": "...",
  "hook": "specific observation used",
  "angle": "${angle.name}"
}`;

      const startTime = Date.now();

      try {
        const completion = await retryWithBackoff(async () => {
          return await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: `You are a cold email A/B testing expert. Write variant ${index + 1} using ${angle.name} approach. Always return valid JSON.`
              },
              {
                role: 'user',
                content: enhancedPrompt
              }
            ],
            temperature: 0.9, // Higher temp for more variation
            max_tokens: 400,
            response_format: { type: "json_object" }
          });
        });

        const latencyMs = Date.now() - startTime;
        const tokens = completion.usage.total_tokens;
        const cost = (completion.usage.prompt_tokens * 0.03 + completion.usage.completion_tokens * 0.06) / 1000;
        
        trackPerformance(latencyMs, tokens, cost);

        const result = JSON.parse(completion.choices[0].message.content.trim());
        
        console.log(`[A/B Variant ${index + 1}] ✓ ${angle.name} in ${latencyMs}ms`);

        return {
          variant_id: `variant_${String.fromCharCode(65 + index)}`, // A, B, C, D
          test_angle: angle.name,
          subject: result.subject,
          body: result.body,
          personalization_data: JSON.stringify({
            hook: result.hook,
            angle: angle.name,
            lead_company: lead.company,
            lead_title: lead.title,
            tokens_used: tokens,
            cost_usd: cost,
            latency_ms: latencyMs,
            generated_at: new Date().toISOString()
          })
        };
      } catch (error) {
        performanceLog.errors++;
        console.error(`[A/B Variant ${index + 1}] ✗ Error:`, error.message);
        
        // Return fallback variant
        return {
          variant_id: `variant_${String.fromCharCode(65 + index)}`,
          test_angle: angle.name,
          subject: `${lead.company} + ${client.company}`,
          body: `Hi ${lead.first_name},\n\n${client.value_prop}\n\nWorth a conversation?\n\nBest,\n${client.name}`,
          personalization_data: JSON.stringify({
            hook: 'Fallback (API error)',
            angle: angle.name,
            error: error.message
          })
        };
      }
    })
  );

  console.log(`[A/B Test] Generated ${variants.length} variants for ${lead.company}`);
  
  return variants;
}

/**
 * Analyze A/B test results and recommend winning variant
 * @param {Array} results - Array of {variant_id, sent, opened, replied}
 * @returns {Object} - {winner, analysis, confidence_level}
 */
function analyzeABTest(results) {
  if (!results || results.length < 2) {
    throw new Error('Need at least 2 variants to analyze');
  }

  // Calculate reply rate for each variant
  const analyzed = results.map(v => ({
    ...v,
    reply_rate: v.sent > 0 ? (v.replied / v.sent) * 100 : 0,
    open_rate: v.sent > 0 ? (v.opened / v.sent) * 100 : 0
  })).sort((a, b) => b.reply_rate - a.reply_rate);

  const winner = analyzed[0];
  const runnerUp = analyzed[1];

  // Statistical significance (simplified chi-square test)
  const totalReplies = analyzed.reduce((sum, v) => sum + v.replied, 0);
  const totalSent = analyzed.reduce((sum, v) => sum + v.sent, 0);
  const expectedReplies = totalReplies / analyzed.length;
  
  const chiSquare = analyzed.reduce((sum, v) => {
    const expected = (v.sent / totalSent) * totalReplies;
    return sum + Math.pow(v.replied - expected, 2) / expected;
  }, 0);

  // Confidence levels (df = variants - 1)
  // Chi-square critical values: 3.84 (95%), 6.63 (99%)
  let confidence_level = 'low';
  if (chiSquare > 6.63) confidence_level = 'high';
  else if (chiSquare > 3.84) confidence_level = 'medium';

  // Minimum sample size check
  const minSampleSize = 30;
  const hasEnoughData = analyzed.every(v => v.sent >= minSampleSize);

  return {
    winner: {
      variant_id: winner.variant_id,
      test_angle: winner.test_angle,
      reply_rate: winner.reply_rate.toFixed(2) + '%',
      open_rate: winner.open_rate.toFixed(2) + '%',
      improvement_over_runner_up: 
        runnerUp.reply_rate > 0 
          ? `+${((winner.reply_rate - runnerUp.reply_rate) / runnerUp.reply_rate * 100).toFixed(1)}%`
          : 'N/A'
    },
    all_variants: analyzed.map(v => ({
      variant_id: v.variant_id,
      angle: v.test_angle,
      reply_rate: v.reply_rate.toFixed(2) + '%',
      sent: v.sent,
      replied: v.replied
    })),
    confidence_level,
    has_enough_data: hasEnoughData,
    recommendation: confidence_level === 'high' 
      ? `Use ${winner.variant_id} (${winner.test_angle}) for future campaigns. Statistically significant winner.`
      : confidence_level === 'medium'
      ? `${winner.variant_id} (${winner.test_angle}) is likely better, but continue testing to confirm.`
      : `Insufficient data. Send ${minSampleSize - Math.min(...analyzed.map(v => v.sent))} more emails per variant to reach significance.`,
    chi_square_score: chiSquare.toFixed(2)
  };
}

module.exports = {
  generateEmail,
  generateFollowUp,
  generateVariants,    // NEW: A/B testing support
  analyzeABTest,       // NEW: Statistical analysis
  getStats             // Export performance stats
};
