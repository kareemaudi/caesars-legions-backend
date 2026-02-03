#!/usr/bin/env node
// ============================================================================
// EMAIL SEQUENCE GENERATOR - Caesar's Legions
// ============================================================================
// Purpose: Generate complete 5-7 email sequences for cold outreach campaigns
// Usage: node scripts/generate-email-sequence.js --prospect <data> --campaign <type>
// Output: JSON file with personalized email sequence ready for sending
// ============================================================================

const { FOLLOW_UP_TEMPLATES } = require('../lib/follow-ups');

/**
 * Initial Email Templates
 * First touch in the sequence - must hook attention immediately
 */
const INITIAL_EMAIL_TEMPLATES = {
  // Template 1: Problem-Solution-CTA
  problemSolution: {
    subject_variants: [
      "{firstName}, quick question about {pain_point}",
      "Noticed {company} is growing - {pain_point}?",
      "{specific_observation} at {company}",
      "{firstName} - {pain_point} taking too much time?"
    ],
    body_template: `Hi {firstName},

I saw {specific_observation} and wanted to reach out.

Most {industry} companies I work with struggle with {pain_point} - it usually means:
• {consequence_1}
• {consequence_2}
• {consequence_3}

We help {industry} companies {solution_one_liner} so they can {outcome}.

{social_proof_sentence}

Worth a 15-min call to see if this applies to {company}?

Best,
{sender_name}
{sender_title}

P.S. {value_add_ps}`
  },

  // Template 2: Curiosity-based
  curiosity: {
    subject_variants: [
      "{firstName}, saw your {recent_activity}",
      "Quick thought on {company}'s {area}",
      "{firstName} - {interesting_data_point}",
      "This might interest you ({company})"
    ],
    body_template: `{firstName},

I came across {specific_observation} and had a thought.

{industry} companies like {company} typically spend {time_or_money_stat} on {task} - but {contrarian_insight}.

What if you could {alternative_approach}?

That's what we built for {similar_company}: {specific_result}.

{firstName}, would a quick call make sense to explore this for {company}?

{sender_name}
{sender_title}

P.S. No pressure - if this isn't relevant, let me know and I'll stop emailing.`
  },

  // Template 3: Social Proof First
  socialProof: {
    subject_variants: [
      "{similar_company} increased {metric} by {percent}",
      "{firstName}, we did this for {competitor}",
      "How {similar_company} solved {pain_point}",
      "{firstName} - case study you might find interesting"
    ],
    body_template: `Hi {firstName},

{similar_company} was facing {pain_point} - their {metric} was stuck at {baseline}.

After working with us for {timeframe}, they:
• {result_1}
• {result_2}
• {result_3}

The approach: {solution_summary}

{firstName}, could this work for {company}?

15-minute call to walk through the approach?

{sender_name}
{sender_title}

P.S. Happy to send over the full case study if you'd like to review first.`
  },

  // Template 4: Direct Value Offer
  directValue: {
    subject_variants: [
      "{firstName}, free {deliverable} for {company}",
      "Quick win for {company}'s {area}",
      "{firstName} - spotted 3 quick wins",
      "Free {deliverable} (no strings attached)"
    ],
    body_template: `{firstName},

I spent 15 minutes analyzing {company}'s {area} and found {number} quick wins:

1. {quick_win_1}
2. {quick_win_2}
3. {quick_win_3}

I put together a {deliverable} showing exactly how to implement these.

Want me to send it over? (No strings, no calls required.)

If it's useful and you want to go deeper, we can talk.

{sender_name}
{sender_title}

P.S. This usually takes our clients from {baseline} → {target} in {timeframe}.`
  }
};

/**
 * Email Sequence Generator
 * Creates complete personalized sequences from prospect data
 */
class EmailSequenceGenerator {
  /**
   * @param {Object} prospect - Prospect information
   * @param {Object} campaign - Campaign configuration
   * @param {Object} options - Generation options
   */
  constructor(prospect, campaign, options = {}) {
    this.prospect = prospect;
    this.campaign = campaign;
    this.options = {
      sequenceLength: options.sequenceLength || 5, // 5 or 7
      templateStyle: options.templateStyle || 'problemSolution',
      personalizationLevel: options.personalizationLevel || 'high',
      ...options
    };
  }

  /**
   * Generate complete email sequence
   * @returns {Array} Sequence of emails with timing and content
   */
  generateSequence() {
    const sequence = [];

    // Email 1: Initial outreach
    sequence.push(this.generateInitialEmail());

    // Email 2: Day 3 follow-up
    sequence.push(this.generateFollowUp('day3', 3));

    // Email 3: Day 5 follow-up
    sequence.push(this.generateFollowUp('day5', 5));

    // Email 4: Day 7 follow-up
    sequence.push(this.generateFollowUp('day7', 7));

    // Email 5: Day 10 breakup (if 5+ sequence)
    if (this.options.sequenceLength >= 5) {
      sequence.push(this.generateBreakupEmail(10));
    }

    // Email 6: Day 14 resurrection (if 7 sequence)
    if (this.options.sequenceLength >= 7) {
      sequence.push(this.generateResurrectionEmail(14));
    }

    // Email 7: Day 30 check-in (if 7 sequence)
    if (this.options.sequenceLength === 7) {
      sequence.push(this.generateCheckInEmail(30));
    }

    return sequence;
  }

  /**
   * Generate initial cold email
   * @returns {Object} Email with subject, body, timing
   */
  generateInitialEmail() {
    const template = INITIAL_EMAIL_TEMPLATES[this.options.templateStyle];
    const variables = this.buildVariables();

    return {
      sequence_number: 1,
      type: 'initial',
      send_delay_days: 0,
      subject: this.selectAndPersonalize(template.subject_variants, variables),
      body: this.personalize(template.body_template, variables),
      personalization_tokens: Object.keys(variables),
      created_at: new Date().toISOString()
    };
  }

  /**
   * Generate follow-up email
   * @param {string} type - day3, day5, or day7
   * @param {number} delayDays - Days after initial email
   * @returns {Object} Follow-up email
   */
  generateFollowUp(type, delayDays) {
    const template = FOLLOW_UP_TEMPLATES[type];
    const variables = this.buildVariables();

    const sequenceNumbers = { day3: 2, day5: 3, day7: 4 };

    return {
      sequence_number: sequenceNumbers[type],
      type: `followup_${type}`,
      send_delay_days: delayDays,
      subject: this.selectAndPersonalize(template.subject_variants, variables),
      body: this.selectAndPersonalize(template.body_templates, variables),
      personalization_tokens: Object.keys(variables),
      created_at: new Date().toISOString()
    };
  }

  /**
   * Generate breakup email (Day 10)
   * @param {number} delayDays - Days after initial
   * @returns {Object} Breakup email
   */
  generateBreakupEmail(delayDays) {
    const variables = this.buildVariables();

    const breakupTemplates = [
      `{firstName},

I'll stop emailing now - clearly not the right time.

But if {pain_point} becomes urgent, you know where to find me.

Best of luck with {company}.

{sender_name}`,

      `{firstName},

Taking the silence as a "not interested" and removing you from my list.

If I'm wrong and you'd like to chat, just reply.

Otherwise, all the best.

{sender_name}`,

      `{firstName},

Last email, I promise.

If {pain_point} matters to {company}, let's talk.

If not, no worries - I'll move on.

{sender_name}`
    ];

    return {
      sequence_number: 5,
      type: 'breakup',
      send_delay_days: delayDays,
      subject: this.selectAndPersonalize([
        "Moving on - {firstName}",
        "Last email from me",
        "{firstName}, closing the loop"
      ], variables),
      body: this.selectAndPersonalize(breakupTemplates, variables),
      personalization_tokens: Object.keys(variables),
      created_at: new Date().toISOString()
    };
  }

  /**
   * Generate resurrection email (Day 14)
   * @param {number} delayDays - Days after initial
   * @returns {Object} Resurrection email
   */
  generateResurrectionEmail(delayDays) {
    const variables = this.buildVariables();

    const resurrectionTemplates = [
      `{firstName},

One more thing before I close your file:

{recent_industry_news} - does this change anything for {company}?

If {pain_point} is suddenly more urgent, let's talk.

If not, I'll truly stop emailing now.

{sender_name}`,

      `{firstName},

I promised I'd stop, but then I saw {trigger_event}.

Made me think of our conversation about {pain_point}.

Still relevant? Or should I actually close your file this time?

{sender_name}`
    ];

    return {
      sequence_number: 6,
      type: 'resurrection',
      send_delay_days: delayDays,
      subject: this.selectAndPersonalize([
        "{firstName}, one more thing",
        "Actually... (last email, really)",
        "{firstName} - {recent_news} changes things?"
      ], variables),
      body: this.selectAndPersonalize(resurrectionTemplates, variables),
      personalization_tokens: Object.keys(variables),
      created_at: new Date().toISOString()
    };
  }

  /**
   * Generate long-term check-in (Day 30)
   * @param {number} delayDays - Days after initial
   * @returns {Object} Check-in email
   */
  generateCheckInEmail(delayDays) {
    const variables = this.buildVariables();

    const checkInTemplates = [
      `{firstName},

It's been a month since I first reached out about {pain_point}.

Things change fast in {industry} - is {pain_point} still on your radar?

If yes: {value_prop_one_liner}
If no: I'll stop emailing for good.

{sender_name}`,

      `{firstName},

Circling back one final time.

Has anything changed with {pain_point} at {company}?

We just helped {recent_client} achieve {recent_result}.

If relevant: Let's talk.
If not: You won't hear from me again.

{sender_name}`
    ];

    return {
      sequence_number: 7,
      type: 'checkin',
      send_delay_days: delayDays,
      subject: this.selectAndPersonalize([
        "{firstName}, checking back in",
        "30 days later - {firstName}",
        "Final check: {pain_point} still relevant?"
      ], variables),
      body: this.selectAndPersonalize(checkInTemplates, variables),
      personalization_tokens: Object.keys(variables),
      created_at: new Date().toISOString()
    };
  }

  /**
   * Build personalization variables from prospect and campaign data
   * @returns {Object} Variables for template replacement
   */
  buildVariables() {
    return {
      // Prospect info
      firstName: this.prospect.firstName || 'there',
      lastName: this.prospect.lastName || '',
      company: this.prospect.company || 'your company',
      title: this.prospect.title || '',
      industry: this.prospect.industry || 'your industry',
      
      // Campaign messaging
      pain_point: this.campaign.painPoint || 'cold email outreach',
      solution_one_liner: this.campaign.solutionOneLiner || 'book more meetings',
      value_prop_one_liner: this.campaign.valueProposition || 'we help you book more meetings',
      
      // Personalization (from research)
      specific_observation: this.prospect.observation || 'you are hiring for sales roles',
      recent_activity: this.prospect.recentActivity || 'LinkedIn post about growth',
      
      // Sender info
      sender_name: this.campaign.senderName || 'Caesar',
      sender_title: this.campaign.senderTitle || 'Founder, Caesar\'s Legions',
      sender_email: this.campaign.senderEmail || 'caesar@caesarslegions.com',
      
      // Social proof
      similar_company: this.campaign.socialProof?.similarCompany || 'a similar company',
      social_proof_stat: this.campaign.socialProof?.stat || 'increased reply rates by 300%',
      
      // CTA
      calendar_link: this.campaign.calendarLink || '',
      
      // Placeholders (replace with real data in production)
      consequence_1: 'Wasted time on unqualified leads',
      consequence_2: 'Low reply rates (<1%)',
      consequence_3: 'Inconsistent pipeline',
      result_1: 'Increased reply rate to 8%',
      result_2: 'Booked 15 meetings in first month',
      result_3: 'Generated $50k in pipeline',
      
      ...this.prospect.customVariables
    };
  }

  /**
   * Select random variant and personalize
   * @param {Array} variants - Template variants
   * @param {Object} variables - Personalization variables
   * @returns {string} Personalized text
   */
  selectAndPersonalize(variants, variables) {
    const selected = variants[Math.floor(Math.random() * variants.length)];
    return this.personalize(selected, variables);
  }

  /**
   * Replace template variables with actual values
   * @param {string} template - Template string
   * @param {Object} variables - Variable values
   * @returns {string} Personalized text
   */
  personalize(template, variables) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return variables[key] || match;
    });
  }
}

/**
 * Export sequence to file
 * @param {Array} sequence - Generated email sequence
 * @param {string} outputPath - Output file path
 */
function exportSequence(sequence, outputPath) {
  const fs = require('fs');
  const output = {
    generated_at: new Date().toISOString(),
    sequence_length: sequence.length,
    emails: sequence
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`✅ Sequence exported to: ${outputPath}`);
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const index = args.indexOf(flag);
    return index !== -1 && args[index + 1] ? args[index + 1] : null;
  };

  const prospectFile = getArg('--prospect');
  const campaignFile = getArg('--campaign');
  const outputPath = getArg('--output') || './email-sequence.json';
  const sequenceLength = parseInt(getArg('--length')) || 5;
  const templateStyle = getArg('--style') || 'problemSolution';

  if (!prospectFile || !campaignFile) {
    console.log(`
📧 EMAIL SEQUENCE GENERATOR

Usage:
  node scripts/generate-email-sequence.js --prospect <file> --campaign <file> [options]

Options:
  --prospect <file>   JSON file with prospect data
  --campaign <file>   JSON file with campaign config
  --output <file>     Output file path (default: ./email-sequence.json)
  --length <number>   Sequence length: 5 or 7 (default: 5)
  --style <type>      Template style: problemSolution, curiosity, socialProof, directValue

Example:
  node scripts/generate-email-sequence.js \\
    --prospect prospect.json \\
    --campaign campaign.json \\
    --length 5 \\
    --style problemSolution
    `);
    process.exit(1);
  }

  try {
    // Load data
    const prospect = JSON.parse(fs.readFileSync(prospectFile, 'utf8'));
    const campaign = JSON.parse(fs.readFileSync(campaignFile, 'utf8'));

    // Generate sequence
    const generator = new EmailSequenceGenerator(prospect, campaign, {
      sequenceLength,
      templateStyle
    });
    
    const sequence = generator.generateSequence();

    // Export
    exportSequence(sequence, outputPath);

    // Display preview
    console.log('\n📧 SEQUENCE PREVIEW:\n');
    sequence.forEach((email, index) => {
      console.log(`Email ${index + 1} (Day ${email.send_delay_days}):`);
      console.log(`Subject: ${email.subject}`);
      console.log(`Type: ${email.type}`);
      console.log('---');
    });

    console.log(`\n✅ Full sequence saved to: ${outputPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  EmailSequenceGenerator,
  INITIAL_EMAIL_TEMPLATES,
  exportSequence
};
