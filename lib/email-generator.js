const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate a personalized cold email using GPT-4
 * @param {Object} params
 * @param {Object} params.lead - Lead data (name, company, title)
 * @param {Object} params.client - Client data (company, value_prop)
 * @param {string} params.template - Optional template to use
 * @returns {Promise<Object>} - {subject, body, personalization_data}
 */
async function generateEmail({ lead, client, template }) {
  const prompt = `You are an expert cold email copywriter. Write a personalized cold email for the following:

**Sender (Your Client):**
- Company: ${client.company}
- Value Proposition: ${client.value_prop}
- Target Audience: ${client.target_audience}

**Recipient (Lead):**
- Name: ${lead.first_name} ${lead.last_name}
- Title: ${lead.title}
- Company: ${lead.company}

**Instructions:**
1. Write a SHORT, personalized email (max 150 words)
2. Hook: Start with something specific about their company or role
3. Value: Clearly state how you help (1 sentence)
4. Proof: Brief credibility signal (e.g., "We helped similar companies...")
5. CTA: Simple ask (e.g., "Worth a quick chat?")
6. Tone: Conversational, respectful, not salesy

Return ONLY valid JSON with this structure:
{
  "subject": "Subject line (max 50 chars, no hype)",
  "body": "Email body",
  "hook": "The personalization hook used"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You write high-converting cold emails. Always return valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const content = completion.choices[0].message.content.trim();
    
    // Try to parse JSON
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      // If not valid JSON, extract manually
      console.warn('GPT did not return valid JSON. Parsing manually...');
      result = {
        subject: 'Quick question',
        body: content,
        hook: 'Generic'
      };
    }

    return {
      subject: result.subject,
      body: result.body,
      personalization_data: JSON.stringify({
        hook: result.hook,
        lead_company: lead.company,
        lead_title: lead.title,
        generated_at: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Email generation error:', error.message);
    
    // Fallback template
    return {
      subject: `Quick question, ${lead.first_name}`,
      body: `Hi ${lead.first_name},\n\nI noticed ${lead.company} and thought you might be interested in how we help ${client.target_audience}.\n\n${client.value_prop}\n\nWorth a quick chat?\n\nBest,\n${client.name}`,
      personalization_data: JSON.stringify({
        hook: 'Fallback template',
        error: error.message
      })
    };
  }
}

/**
 * Generate follow-up email
 */
async function generateFollowUp({ lead, client, previousEmail, daysSince }) {
  const prompt = `Write a brief follow-up email (max 100 words).

**Context:**
- You sent an email ${daysSince} days ago to ${lead.first_name} ${lead.last_name} (${lead.title} at ${lead.company})
- Subject was: "${previousEmail.subject}"
- They haven't replied yet

**Instructions:**
1. Brief, humble bump
2. Add NEW value or insight (don't just resend)
3. Easy out ("If timing's bad, no worries")

Return JSON: {"subject": "...", "body": "..."}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You write non-pushy follow-up emails. Always return valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    const result = JSON.parse(completion.choices[0].message.content.trim());
    return result;
  } catch (error) {
    console.error('Follow-up generation error:', error.message);
    return {
      subject: `Re: ${previousEmail.subject}`,
      body: `Hi ${lead.first_name},\n\nJust following up on my last email. Still interested in chatting?\n\nNo worries if timing's bad.\n\nBest,\n${client.name}`
    };
  }
}

module.exports = {
  generateEmail,
  generateFollowUp
};
