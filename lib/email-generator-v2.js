const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * IMPROVED Email Generator v2
 * Based on research insights from qualified leads (Jan 30, 2026)
 * 
 * Key improvements:
 * 1. Pattern interrupt hooks (avoid generic "I noticed your company...")
 * 2. Specific social proof (not vague "we help companies like you")
 * 3. Multi-channel approach (mention LinkedIn + email)
 * 4. Transparent deliverability focus (our differentiator)
 * 5. Easy out + specific CTA (not just "worth a chat?")
 */

/**
 * Generate a personalized cold email using GPT-4o
 * @param {Object} params
 * @param {Object} params.lead - Lead data (name, company, title, linkedin_url, recent_activity)
 * @param {Object} params.client - Client data (company, value_prop, case_studies)
 * @param {string} params.campaign_type - 'founder_outreach' | 'agency_outreach' | 'enterprise_outreach'
 * @returns {Promise<Object>} - {subject, body, personalization_data}
 */
async function generateEmail({ lead, client, campaign_type = 'founder_outreach' }) {
  // Research-backed insights about what works
  const insights = {
    founder_outreach: {
      hook_style: 'Reference their recent post, product launch, or milestone',
      tone: 'Founder-to-founder, respectful peer',
      proof_type: 'Specific metrics from similar bootstrapped companies',
      cta: 'Quick Loom video walkthrough or 15-min call'
    },
    agency_outreach: {
      hook_style: 'Mention their client portfolio or specialization',
      tone: 'Professional partnership opportunity',
      proof_type: 'White-label pricing and case studies',
      cta: 'Partnership deck or demo for their team'
    },
    enterprise_outreach: {
      hook_style: 'Industry challenge or competitor mention',
      tone: 'Enterprise-ready, risk-aware',
      proof_type: 'Enterprise clients, security, SLA',
      cta: 'Formal demo or pilot program'
    }
  };

  const campaignInsights = insights[campaign_type] || insights.founder_outreach;

  const prompt = `You are a top-performing cold email copywriter. Your emails get 30%+ reply rates.

**RESEARCH INSIGHTS (What founders hate):**
- Generic AI personalization ("I noticed your company...")
- Vague claims ("We help companies like yours...")
- Email-only tools that land in spam
- Black box deliverability (Apollo problem)
- Expensive tools with no ROI clarity

**RESEARCH INSIGHTS (What founders want):**
- Deep, specific research (not lazy shortcuts)
- Real social proof with metrics
- Transparent deliverability
- Multi-channel approach (email + LinkedIn)
- Fair pricing (between DIY tools and agencies)

**SENDER (Your Client):**
- Company: ${client.company}
- Value Proposition: ${client.value_prop}
- Proof Points: ${client.case_studies || 'Helping B2B SaaS founders get 3-5 qualified demos per week'}
- Target Audience: ${client.target_audience}

**RECIPIENT (Lead):**
- Name: ${lead.first_name} ${lead.last_name}
- Title: ${lead.title}
- Company: ${lead.company}
${lead.linkedin_url ? `- LinkedIn: ${lead.linkedin_url}` : ''}
${lead.recent_activity ? `- Recent Activity: ${lead.recent_activity}` : ''}

**CAMPAIGN TYPE:** ${campaign_type}
**Hook Style:** ${campaignInsights.hook_style}
**Tone:** ${campaignInsights.tone}
**Proof Type:** ${campaignInsights.proof_type}
**CTA:** ${campaignInsights.cta}

**STRICT RULES:**
1. **Subject:** 4-6 words max. No hype, no "Quick question", no emojis. Reference their recent activity or a specific pain point.
2. **Hook (Line 1):** Pattern interrupt. NOT "I noticed your company". Instead: reference recent post, product launch, specific pain point they mentioned.
3. **Value (Line 2-3):** ONE specific benefit with a number. Not "we help you grow" but "Get 3-5 qualified demos per week".
4. **Proof (Line 4-5):** Specific case study. Not "companies like you" but "Helped [Company] go from 0 → 5 meetings/week in 14 days".
5. **Transparency (Line 6):** Mention our differentiator: "Unlike mass tools, we focus on deliverability and multi-channel (email + LinkedIn)".
6. **CTA (Last line):** Specific and low-commitment. "${campaignInsights.cta}".
7. **Length:** 120-150 words MAX. Shorter is better.
8. **Signature:** Just first name (no title, no company in body)

**EXAMPLE STRUCTURE (DO NOT COPY, USE AS PATTERN):**
Subject: Your Apollo spam issue
Body:
${lead.first_name},

Saw your post about Apollo landing in spam - we've heard that from 3 other founders this month.

We get B2B SaaS founders 3-5 qualified demos/week using AI agents (not templates).

Recent: Helped Acme SaaS go from 0 → 5 meetings/week in 14 days. $10K MRR bump in 30 days.

Unlike mass tools, we combine deep research + LinkedIn + email (not just blasting). Transparent deliverability tracking (no black box).

Worth a 15-min call this week? I'll show you our campaign strategy + real results.

Caesar

P.S. - If timing's bad, no worries. Happy to send over a quick Loom instead.

**NOW GENERATE THE ACTUAL EMAIL:**

Return ONLY valid JSON:
{
  "subject": "Subject line here",
  "body": "Full email body here",
  "hook": "The specific hook you used",
  "proof_point": "The case study or metric you mentioned"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Cheaper + faster than gpt-4
      messages: [
        {
          role: 'system',
          content: 'You write high-converting cold emails based on proven patterns. You ALWAYS return valid JSON. You never use generic personalization or hype.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8, // Slightly higher for creativity in hooks
      max_tokens: 600,
      response_format: { type: "json_object" } // Force JSON response
    });

    const content = completion.choices[0].message.content.trim();
    const result = JSON.parse(content);

    return {
      subject: result.subject,
      body: result.body,
      personalization_data: JSON.stringify({
        hook: result.hook,
        proof_point: result.proof_point,
        campaign_type: campaign_type,
        lead_company: lead.company,
        lead_title: lead.title,
        recent_activity: lead.recent_activity || null,
        generated_at: new Date().toISOString(),
        model: 'gpt-4o',
        version: 'v2'
      })
    };
  } catch (error) {
    console.error('Email generation error:', error.message);
    throw error; // Don't silently fail with fallback - we want to know if API is broken
  }
}

/**
 * Generate follow-up email (IMPROVED)
 */
async function generateFollowUp({ lead, client, previousEmail, daysSince, sequence_position = 1 }) {
  // Follow-up strategy based on research
  const followUpStrategies = {
    1: { // Day 3: Add new value
      approach: 'Share a relevant insight, article, or quick win they can implement',
      tone: 'Helpful, not pushy'
    },
    2: { // Day 7: Permission to close loop
      approach: 'Acknowledge they\'re busy, offer to close the loop',
      tone: 'Respectful, easy out'
    },
    3: { // Day 14: Last attempt with breakup
      approach: 'Final valuable resource + explicit close',
      tone: 'Professional breakup'
    }
  };

  const strategy = followUpStrategies[sequence_position] || followUpStrategies[1];

  const prompt = `Write a follow-up email.

**Context:**
- Sent email ${daysSince} days ago to ${lead.first_name} ${lead.last_name} (${lead.title} at ${lead.company})
- Original subject: "${previousEmail.subject}"
- No reply yet (common - people are busy!)
- This is follow-up #${sequence_position}

**Strategy:**
- Approach: ${strategy.approach}
- Tone: ${strategy.tone}

**Rules:**
1. DO NOT just bump the original email
2. Add NEW value (insight, case study, quick tip)
3. Max 80 words
4. Always include easy out ("No worries if timing's bad")
5. ${sequence_position >= 2 ? 'Ask permission to close the loop' : 'Provide additional proof point'}

Return JSON: {"subject": "...", "body": "..."}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: 'You write non-pushy follow-ups that add value. Always return valid JSON.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content.trim());
    return {
      subject: result.subject,
      body: result.body,
      sequence_position,
      days_since_last: daysSince
    };
  } catch (error) {
    console.error('Follow-up generation error:', error.message);
    throw error;
  }
}

/**
 * Generate A/B test variants (NEW FEATURE)
 * @param {Object} params - Same as generateEmail
 * @param {number} variant_count - Number of variants to generate (default: 2)
 * @returns {Promise<Array>} - Array of email variants
 */
async function generateABVariants({ lead, client, campaign_type, variant_count = 2 }) {
  const variants = [];
  
  // Generate multiple variants with different hooks/angles
  for (let i = 0; i < variant_count; i++) {
    const email = await generateEmail({ lead, client, campaign_type });
    variants.push({
      variant_id: String.fromCharCode(65 + i), // A, B, C...
      ...email
    });
    
    // Small delay to ensure different outputs
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return variants;
}

module.exports = {
  generateEmail,
  generateFollowUp,
  generateABVariants
};
