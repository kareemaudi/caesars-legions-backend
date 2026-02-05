/**
 * AI Email Generator - Caesar's Legions
 * Uses OpenAI to generate high-converting personalized cold emails
 * 
 * Updated: 2026-02-03
 * - Added multiple copywriting frameworks (PAS, AIDA, Question, Direct)
 * - Enhanced personalization with pain-point mapping
 * - A/B subject line generation
 * - Framework auto-selection based on prospect data
 * - Improved prompts based on market research
 */

const OpenAI = require('openai');

// ============================================================================
// EMAIL FRAMEWORKS
// ============================================================================

const FRAMEWORKS = {
  // Problem-Agitate-Solve: Best for prospects with clear pain points
  PAS: {
    name: 'Problem-Agitate-Solve',
    bestFor: 'prospects with identified pain points',
    structure: `
1. PROBLEM: State their specific pain in their words
2. AGITATE: Amplify consequences of not solving it  
3. SOLVE: Present your solution as the relief`,
    example: `
Subject: {company}'s {pain} problem?

{firstName},

Most {title}s at {industry} companies struggle with {pain}. (Problem)

And it only gets worse - {consequence1}, {consequence2}, and eventually {bigConsequence}. (Agitate)

We've helped companies like {similarCompany} solve this by {solution} - they saw {result} in {timeframe}. (Solve)

Worth 15 minutes to see if we can do the same for {company}?

{sender}`
  },

  // Attention-Interest-Desire-Action: Best for unique/novel offers
  AIDA: {
    name: 'Attention-Interest-Desire-Action',
    bestFor: 'unique value props, new approaches',
    structure: `
1. ATTENTION: Bold hook or surprising statement
2. INTEREST: Relevant fact/insight about their situation
3. DESIRE: Paint picture of improved state
4. ACTION: Single clear CTA`,
    example: `
Subject: Quick question about {company}

{firstName},

{attentionHook} (Attention)

I noticed {observation about their company}. {relevantInsight} (Interest)

Imagine if {desiredState} - that's exactly what we helped {similarCompany} achieve. (Desire)

Can I show you how in 15 minutes? (Action)

{sender}`
  },

  // Question-based: Best for sparking curiosity and engagement
  QUESTION: {
    name: 'Question-Based',
    bestFor: 'high-level executives, busy prospects',
    structure: `
1. Open with a relevant question
2. Bridge to your solution
3. Social proof
4. Easy yes/no CTA`,
    example: `
Subject: Question about {company}'s {topic}

{firstName},

{openingQuestion}

We've been helping {industry} companies {benefit} by {method}. 

{socialProof}

Worth a quick chat to see if it makes sense for {company}?

{sender}`
  },

  // Direct/Concise: Best for follow-ups and busy executives
  DIRECT: {
    name: 'Direct Value',
    bestFor: 'follow-ups, senior executives',
    structure: `
1. State exactly why you're reaching out
2. One sentence of value
3. Clear next step`,
    example: `
Subject: {valueProposition} for {company}

{firstName},

Reaching out because {reason}.

We help {ICPDescription} {benefit} — recently did this for {similarCompany} ({result}).

Worth a 15-minute call?

{sender}`
  }
};

// ============================================================================
// SUBJECT LINE FORMULAS
// ============================================================================

const SUBJECT_FORMULAS = {
  question: [
    "Quick question about {company}",
    "{firstName}, question about {topic}",
    "Can I ask about {company}'s {topic}?",
    "{topic} at {company}?"
  ],
  curiosity: [
    "Idea for {company}",
    "Thought about {company}'s {topic}",
    "Noticed something about {company}",
    "{firstName} - quick thought"
  ],
  directValue: [
    "{benefit} for {company}",
    "Re: {topic}",
    "{company} + {solution}",
    "{percentage}% {metric} improvement"
  ],
  socialProof: [
    "How {similarCompany} {achievement}",
    "{industry} companies are doing this",
    "What {similarCompany} taught us"
  ],
  personalConnection: [
    "Fellow {connection}",
    "Saw your post about {topic}",
    "Loved your take on {topic}",
    "{mutualConnection} suggested I reach out"
  ]
};

// ============================================================================
// ANTI-PATTERNS (What NOT to do)
// ============================================================================

const ANTI_PATTERNS = `
NEVER DO THESE:
- "I hope this email finds you well" (generic opener)
- "I wanted to reach out because..." (weak, passive)
- "We are a leading provider of..." (nobody cares)
- "I would love the opportunity to..." (desperate)
- Multiple CTAs (confusing)
- More than 150 words (too long)
- Talking about yourself first (selfish)
- Generic personalization (just using their name)
- Exclamation points (too eager)
- All caps ANYTHING (spammy)
- Attachments in cold emails (triggers spam filters)
- Asking "is this relevant?" (weak CTA)
- "Let me know if you have any questions" (passive)
`;

// ============================================================================
// EMAIL GENERATOR CLASS
// ============================================================================

class EmailGenerator {
  constructor(options = {}) {
    this.openai = new OpenAI({
      apiKey: options.openaiApiKey || process.env.OPENAI_API_KEY
    });
    this.defaultModel = options.model || 'gpt-4o-mini';
  }

  /**
   * Generate a single email with A/B subject variants
   */
  async generate(prospect, campaign = {}, options = {}) {
    const framework = options.framework || this.selectFramework(prospect);
    const prompt = this.buildPrompt(prospect, campaign, framework);
    
    const startTime = Date.now();
    const response = await this.openai.chat.completions.create({
      model: options.model || this.defaultModel,
      messages: [
        { role: 'system', content: this.getSystemPrompt(framework) },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 600
    });

    const content = response.choices[0].message.content;
    const parsed = this.parseResponse(content);
    
    // Generate A/B subject variants
    const subjectVariants = await this.generateSubjectVariants(prospect, campaign, parsed.subject);
    
    return {
      ...parsed,
      subjectVariants,
      framework: framework.name,
      tokensUsed: response.usage?.total_tokens || 0,
      generationTimeMs: Date.now() - startTime,
      model: options.model || this.defaultModel
    };
  }

  /**
   * Select best framework based on prospect data
   */
  selectFramework(prospect) {
    // If we have clear pain point info, use PAS
    if (prospect.pain && prospect.pain.length > 20) {
      return FRAMEWORKS.PAS;
    }
    
    // If executive level, use DIRECT
    if (prospect.title && /CEO|CTO|VP|Director|Head of|Founder/i.test(prospect.title)) {
      return FRAMEWORKS.DIRECT;
    }
    
    // If we have unique value prop or novel approach
    if (prospect.uniqueAngle || prospect.novelApproach) {
      return FRAMEWORKS.AIDA;
    }
    
    // Default to question-based (highest reply rates)
    return FRAMEWORKS.QUESTION;
  }

  /**
   * Enhanced system prompt with framework guidance
   */
  getSystemPrompt(framework) {
    return `You are an elite cold email copywriter who writes emails that get 40%+ open rates and 10%+ reply rates.

FRAMEWORK: ${framework.name}
${framework.structure}

RULES:
- Maximum 150 words (shorter is better)
- Sound like a human, not a marketer
- First line must earn the second line
- Focus 80% on THEM, 20% on you
- Single, clear CTA (yes/no question works best)
- Use their actual words if we have them (pain points, goals)
- Specific > generic (numbers, company names, real details)
- No fluff, no filler, every word earns its place
- THIS IS A COLD EMAIL — the prospect does NOT know you. Do NOT say "you mentioned", "as you said", or reference any prior conversation
- Sign off with your REAL name (provided in SENDER section below), never use [Your Name] or [Name]

${ANTI_PATTERNS}

OUTPUT FORMAT (exactly):
SUBJECT: [compelling subject line]
BODY:
[email body - conversational, specific, max 150 words]
PREVIEW_TEXT: [first 40 chars optimized for inbox preview]`;
  }

  /**
   * Build detailed prompt with prospect context
   */
  buildPrompt(prospect, campaign, framework) {
    const personalizationHooks = this.getPersonalizationHooks(prospect);
    
    return `Write a cold email using the ${framework.name} framework.

PROSPECT PROFILE:
- Name: ${prospect.firstName || prospect.name?.split(' ')[0] || 'there'}
- Full Name: ${prospect.name || 'Unknown'}
- Title: ${prospect.title || 'Unknown'}
- Company: ${prospect.company}
- Industry: ${prospect.industry || 'B2B SaaS'}
- Company Size: ${prospect.companySize || 'Unknown'}
${prospect.pain ? `- Their Pain (in their words): "${prospect.pain}"` : ''}
${prospect.goals ? `- Their Goals: ${prospect.goals}` : ''}
${prospect.recentActivity ? `- Recent Activity: ${prospect.recentActivity}` : ''}
${prospect.techStack ? `- Tech Stack: ${prospect.techStack}` : ''}
${prospect.funding ? `- Funding Stage: ${prospect.funding}` : ''}

PERSONALIZATION HOOKS (use at least one):
${personalizationHooks}

OUR OFFER:
${campaign.offer || `Done-for-you cold email outreach that books qualified meetings.
- 100 personalized emails/week
- AI-written, human-reviewed
- We handle data, copy, and infrastructure
- $497/mo founder pricing`}

PROOF POINTS (use if relevant):
${campaign.socialProof || `- 40%+ average open rates
- 10%+ reply rates
- Clients typically book 5-10 meetings/month
- Saved one client $17,500/mo vs their agency`}

SIMILAR COMPANIES WE'VE HELPED:
${campaign.similarCompanies || 'B2B SaaS companies doing $1M-10M ARR'}

SENDER:
${campaign.senderName || 'Caesar'}
${campaign.senderTitle || 'Founder, Caesar\'s Legions'}
${campaign.senderEmail || ''}

TONE: ${campaign.tone || 'Confident but not arrogant. Friendly but professional. Direct but not pushy.'}

Write ONE email. Be specific. Sound human.`;
  }

  /**
   * Extract personalization hooks from prospect data
   */
  getPersonalizationHooks(prospect) {
    const hooks = [];
    
    if (prospect.recentPost) {
      hooks.push(`- Recent post/content: "${prospect.recentPost}"`);
    }
    if (prospect.companyNews) {
      hooks.push(`- Company news: ${prospect.companyNews}`);
    }
    if (prospect.mutualConnection) {
      hooks.push(`- Mutual connection: ${prospect.mutualConnection}`);
    }
    if (prospect.sharedBackground) {
      hooks.push(`- Shared background: ${prospect.sharedBackground}`);
    }
    if (prospect.websiteObservation) {
      hooks.push(`- Website observation: ${prospect.websiteObservation}`);
    }
    if (prospect.linkedinHeadline) {
      hooks.push(`- LinkedIn headline: "${prospect.linkedinHeadline}"`);
    }
    if (prospect.podcast || prospect.interview) {
      hooks.push(`- Appeared on: ${prospect.podcast || prospect.interview}`);
    }
    
    if (hooks.length === 0) {
      hooks.push('- Use company name and industry-specific insight');
      hooks.push('- Reference their likely pain based on their role');
    }
    
    return hooks.join('\n');
  }

  /**
   * Generate A/B subject line variants
   */
  async generateSubjectVariants(prospect, campaign, primarySubject) {
    const variants = [primarySubject];
    
    // Add formula-based variants
    const formulas = this.selectSubjectFormulas(prospect);
    
    for (const formula of formulas.slice(0, 2)) {
      const variant = this.applySubjectFormula(formula, prospect, campaign);
      if (variant && variant !== primarySubject) {
        variants.push(variant);
      }
    }
    
    return variants.slice(0, 3); // Max 3 variants
  }

  /**
   * Select relevant subject formulas based on prospect data
   */
  selectSubjectFormulas(prospect) {
    const formulas = [];
    
    // Always include question-based (highest open rates)
    formulas.push(...SUBJECT_FORMULAS.question);
    
    // If we have social proof
    if (prospect.similarCompany) {
      formulas.push(...SUBJECT_FORMULAS.socialProof);
    }
    
    // If we have content/personal hook
    if (prospect.recentPost || prospect.linkedinHeadline) {
      formulas.push(...SUBJECT_FORMULAS.personalConnection);
    }
    
    // Add curiosity for variety
    formulas.push(...SUBJECT_FORMULAS.curiosity);
    
    // Shuffle to get variety
    return formulas.sort(() => Math.random() - 0.5);
  }

  /**
   * Apply subject formula with prospect data
   */
  applySubjectFormula(formula, prospect, campaign) {
    const replacements = {
      '{company}': prospect.company,
      '{firstName}': prospect.firstName || prospect.name?.split(' ')[0] || '',
      '{topic}': prospect.pain?.split(' ').slice(0, 3).join(' ') || campaign.topic || 'outbound',
      '{benefit}': campaign.mainBenefit || 'Book more meetings',
      '{solution}': 'AI cold email',
      '{industry}': prospect.industry || 'B2B',
      '{similarCompany}': campaign.similarCompany || 'similar companies',
      '{percentage}': '40',
      '{metric}': 'reply rate',
      '{achievement}': '10x\'d their pipeline',
      '{connection}': prospect.sharedBackground || 'founder'
    };
    
    let result = formula;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(key, value || '');
    }
    
    // Don't return if too many unfilled placeholders
    if (result.includes('{')) return null;
    
    return result.trim();
  }

  /**
   * Parse AI response into structured email
   */
  parseResponse(content) {
    const subjectMatch = content.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
    const bodyMatch = content.match(/BODY:\s*([\s\S]+?)(?:PREVIEW_TEXT:|$)/i);
    const previewMatch = content.match(/PREVIEW_TEXT:\s*(.+?)(?:\n|$)/i);

    let body = bodyMatch ? bodyMatch[1].trim() : content;
    
    // Post-process: replace any [Your Name] / [Name] slips with Caesar
    body = body.replace(/\[Your Name\]/gi, 'Caesar');
    body = body.replace(/\[Name\]/gi, 'Caesar');
    body = body.replace(/\[Sender Name\]/gi, 'Caesar');
    
    return {
      subject: subjectMatch ? subjectMatch[1].trim() : 'Quick question',
      body: body,
      previewText: previewMatch ? previewMatch[1].trim() : body.slice(0, 40),
      wordCount: body.split(/\s+/).length
    };
  }

  /**
   * Generate a full email sequence (initial + follow-ups)
   */
  async generateSequence(prospect, campaign = {}, options = {}) {
    const sequenceLength = options.sequenceLength || 3;
    const emails = [];
    
    // Initial email - use best framework
    const initialEmail = await this.generate(prospect, campaign, {
      framework: options.framework || this.selectFramework(prospect)
    });
    emails.push({
      step: 1,
      type: 'initial',
      dayOffset: 0,
      ...initialEmail
    });

    // Follow-ups - progressively more direct
    const followUpFrameworks = [FRAMEWORKS.QUESTION, FRAMEWORKS.DIRECT, FRAMEWORKS.DIRECT];
    
    for (let i = 1; i < sequenceLength; i++) {
      const followUp = await this.generateFollowUp(
        prospect, 
        campaign, 
        emails[0], // Reference initial email
        i,
        followUpFrameworks[i - 1]
      );
      
      emails.push({
        step: i + 1,
        type: 'follow-up',
        dayOffset: i === 1 ? 3 : (i === 2 ? 5 : 7),
        ...followUp
      });
    }

    return emails;
  }

  /**
   * Generate a follow-up email
   */
  async generateFollowUp(prospect, campaign, initialEmail, followUpNumber, framework) {
    const prompt = `Write follow-up #${followUpNumber} for this prospect.

PROSPECT: ${prospect.firstName || prospect.name} at ${prospect.company}
ORIGINAL EMAIL SUBJECT: ${initialEmail.subject}
ORIGINAL EMAIL (summary): ${initialEmail.body.slice(0, 200)}...

FOLLOW-UP RULES:
- Reference the previous email naturally (you sent it, they haven't replied yet)
- THIS IS A COLD EMAIL — do NOT claim they "mentioned" or "said" anything
- Shorter than initial (max 100 words)
- ${followUpNumber === 1 ? 'Provide additional value or social proof' : ''}
- ${followUpNumber === 2 ? 'Be more direct, hint this is last try' : ''}
- ${followUpNumber >= 3 ? 'Final email - breakup/permission to close file' : ''}
- New angle, don't just repeat
- Easy yes/no CTA
- Sign off as: ${campaign.senderName || 'Caesar'}, ${campaign.senderTitle || 'Founder, Caesar\'s Legions'}
- NEVER use [Your Name] — always sign as ${campaign.senderName || 'Caesar'}

Write the follow-up email.`;

    const response = await this.openai.chat.completions.create({
      model: this.defaultModel,
      messages: [
        { role: 'system', content: this.getSystemPrompt(framework) },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 400
    });

    const content = response.choices[0].message.content;
    return {
      ...this.parseResponse(content),
      framework: framework.name,
      tokensUsed: response.usage?.total_tokens || 0,
      model: this.defaultModel
    };
  }

  /**
   * Validate email quality
   */
  validateEmail(email) {
    const issues = [];
    
    // Word count
    if (email.wordCount > 150) {
      issues.push(`Too long: ${email.wordCount} words (max 150)`);
    }
    
    // Check for anti-patterns
    const antiPatternChecks = [
      { pattern: /hope this email finds you/i, issue: 'Generic opener' },
      { pattern: /I wanted to reach out/i, issue: 'Weak opener' },
      { pattern: /leading provider/i, issue: 'Corporate speak' },
      { pattern: /would love the opportunity/i, issue: 'Desperate tone' },
      { pattern: /!/g, issue: 'Exclamation points (count: $count)' },
      { pattern: /\?\s*\?/g, issue: 'Multiple question marks' }
    ];
    
    for (const check of antiPatternChecks) {
      const matches = email.body.match(check.pattern);
      if (matches) {
        issues.push(check.issue.replace('$count', matches.length));
      }
    }
    
    // Check subject line length
    if (email.subject.length > 60) {
      issues.push(`Subject too long: ${email.subject.length} chars (max 60)`);
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      score: Math.max(0, 100 - (issues.length * 15))
    };
  }

  /**
   * Get available frameworks
   */
  static getFrameworks() {
    return Object.keys(FRAMEWORKS).map(key => ({
      id: key,
      ...FRAMEWORKS[key]
    }));
  }

  /**
   * Get subject line formulas
   */
  static getSubjectFormulas() {
    return SUBJECT_FORMULAS;
  }
}

module.exports = EmailGenerator;
module.exports.FRAMEWORKS = FRAMEWORKS;
module.exports.SUBJECT_FORMULAS = SUBJECT_FORMULAS;
