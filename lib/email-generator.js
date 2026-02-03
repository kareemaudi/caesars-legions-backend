/**
 * AI Email Generator
 * Uses OpenAI to generate personalized cold emails
 */

const OpenAI = require('openai');

class EmailGenerator {
  constructor(options = {}) {
    this.openai = new OpenAI({
      apiKey: options.openaiApiKey || process.env.OPENAI_API_KEY
    });
  }

  async generate(prospect, campaign = {}) {
    const prompt = this.buildPrompt(prospect, campaign);
    
    const startTime = Date.now();
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: this.getSystemPrompt() },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const content = response.choices[0].message.content;
    const parsed = this.parseResponse(content);
    
    return {
      ...parsed,
      tokensUsed: response.usage?.total_tokens || 0,
      generationTimeMs: Date.now() - startTime,
      model: 'gpt-4o-mini'
    };
  }

  getSystemPrompt() {
    return `You are an expert cold email copywriter. Write emails that:
- Sound human and conversational (not salesy)
- Are short (under 150 words)
- Focus on the prospect's pain, not your features
- Have a single, clear CTA
- Don't use buzzwords or hype

Output format (exactly):
SUBJECT: [subject line]
BODY:
[email body]`;
  }

  buildPrompt(prospect, campaign) {
    return `Write a cold email for:

PROSPECT:
- Name: ${prospect.name}
- Title: ${prospect.title || 'Unknown'}
- Company: ${prospect.company}
- Industry: ${prospect.industry || 'B2B'}
${prospect.pain ? `- Pain point: ${prospect.pain}` : ''}
${prospect.website ? `- Website: ${prospect.website}` : ''}

OFFER:
${campaign.offer || 'Done-for-you cold email outreach that books meetings. 100 personalized emails/week, $497/mo.'}

SENDER:
${campaign.sender || 'Caesar from Caesar\'s Legions - AI-powered cold email agency'}

Write ONE email. Be specific and human.`;
  }

  parseResponse(content) {
    const subjectMatch = content.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
    const bodyMatch = content.match(/BODY:\s*([\s\S]+)/i);

    return {
      subject: subjectMatch ? subjectMatch[1].trim() : 'Quick question',
      body: bodyMatch ? bodyMatch[1].trim() : content
    };
  }

  async generateSequence(prospect, campaign = {}, emailCount = 3) {
    const emails = [];
    
    for (let i = 0; i < emailCount; i++) {
      const sequencePrompt = i === 0 
        ? 'initial outreach' 
        : `follow-up #${i} (shorter, more direct)`;
      
      const email = await this.generate(
        { ...prospect, sequenceContext: sequencePrompt },
        campaign
      );
      
      emails.push({
        step: i + 1,
        dayOffset: i === 0 ? 0 : (i === 1 ? 3 : 7),
        ...email
      });
    }

    return emails;
  }
}

module.exports = EmailGenerator;
