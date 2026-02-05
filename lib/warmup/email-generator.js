/**
 * Warm-up Email Generator - Caesar's Legions
 * Creates realistic warm-up conversations that build sender reputation
 * 
 * The key to warm-up is:
 * 1. Natural, human-like conversation patterns
 * 2. High reply rates (warm-up emails should reply to each other)
 * 3. Variety in content, length, and topics
 * 4. Moving emails from spam to inbox (positive signals)
 * 
 * This is the secret sauce that Instantly charges for.
 */

// ============================================================================
// CONVERSATION TEMPLATES
// ============================================================================

const CONVERSATION_STARTERS = {
  business: [
    {
      subject: "Quick question about {topic}",
      body: "Hey {name},\n\nI was reading about {topic} and remembered you mentioned something about it. Do you have any recommendations?\n\nThanks,\n{sender}"
    },
    {
      subject: "Thoughts on {topic}?",
      body: "Hi {name},\n\nI'm looking into {topic} for a project I'm working on. Have you had any experience with this?\n\nAppreciate any insights.\n\n{sender}"
    },
    {
      subject: "Coffee chat this week?",
      body: "Hey {name}!\n\nHope you're doing well. Been a while since we caught up. Are you free for a quick virtual coffee this week?\n\nLet me know what works.\n\n{sender}"
    },
    {
      subject: "Article you might like",
      body: "Hi {name},\n\nJust came across this article about {topic} and thought of you. It has some really interesting points about {subtopic}.\n\nWorth a read if you have a few minutes.\n\n{sender}"
    },
    {
      subject: "Quick favor?",
      body: "Hey {name},\n\nHope everything's going great! I'm putting together some research on {topic} and was wondering if you might have any contacts who'd be good to talk to.\n\nNo pressure at all, just thought I'd ask.\n\nThanks!\n{sender}"
    }
  ],
  
  casual: [
    {
      subject: "Did you see this?",
      body: "Hey {name}!\n\nCheck this out - {observation}. Thought you'd get a kick out of it.\n\n{sender}"
    },
    {
      subject: "Happy {day}!",
      body: "Hey {name}!\n\nJust wanted to say happy {day} and hope you're having a great week.\n\nCatch up soon?\n\n{sender}"
    },
    {
      subject: "Random thought",
      body: "Hi {name},\n\nWas just thinking about that conversation we had about {topic}. Still mulling over some of those ideas.\n\nHow've you been?\n\n{sender}"
    },
    {
      subject: "Plans for {occasion}?",
      body: "Hey {name}!\n\nAny big plans for {occasion}? Just trying to figure out my schedule.\n\nLet me know if you want to meet up!\n\n{sender}"
    }
  ],

  followup: [
    {
      subject: "Re: {previousSubject}",
      body: "Thanks for getting back to me, {name}!\n\n{response}\n\nReally appreciate the help.\n\n{sender}"
    },
    {
      subject: "Re: {previousSubject}",
      body: "Hey {name},\n\nThat's super helpful, thank you! {followupComment}\n\nTalk soon,\n{sender}"
    },
    {
      subject: "Re: {previousSubject}",
      body: "Perfect, that makes sense.\n\n{additionalComment}\n\nThanks again!\n{sender}"
    }
  ]
};

const REPLY_TEMPLATES = {
  helpful: [
    {
      body: "Hey {sender}!\n\nGood to hear from you. For {topic}, I'd recommend {recommendation}. It's worked well for me.\n\nLet me know if you have more questions!\n\n{replier}"
    },
    {
      body: "Hi {sender},\n\nHappy to help! {response}\n\nHope that's useful. Let me know how it goes.\n\nBest,\n{replier}"
    },
    {
      body: "{sender},\n\nGreat question. In my experience, {insight}. Might be worth exploring.\n\nCheers,\n{replier}"
    }
  ],
  
  positive: [
    {
      body: "Hey {sender}!\n\nAbsolutely, let's do it! {confirmation}\n\nLooking forward to it.\n\n{replier}"
    },
    {
      body: "Hi {sender},\n\nSounds great! {agreement}\n\nTalk soon,\n{replier}"
    },
    {
      body: "{sender},\n\nYes, definitely interested! {enthusiasm}\n\nThanks for thinking of me.\n\n{replier}"
    }
  ],

  curious: [
    {
      body: "Hey {sender},\n\nInteresting! {question}\n\nWould love to hear more about it.\n\n{replier}"
    },
    {
      body: "Hi {sender},\n\nThat's cool. {curiousComment}\n\nKeep me posted!\n\n{replier}"
    }
  ]
};

// ============================================================================
// CONTENT VARIATIONS
// ============================================================================

const TOPICS = {
  business: [
    'remote work strategies',
    'team productivity tools',
    'project management',
    'the startup ecosystem',
    'industry trends',
    'networking events',
    'professional development',
    'work-life balance',
    'hiring and recruiting',
    'market research',
    'customer feedback',
    'product launches',
    'quarterly planning',
    'conference highlights',
    'mentorship programs'
  ],
  
  tech: [
    'new software releases',
    'AI developments',
    'cloud solutions',
    'automation tools',
    'cybersecurity',
    'mobile apps',
    'no-code platforms',
    'data analytics',
    'SaaS trends',
    'developer tools'
  ],
  
  general: [
    'podcasts',
    'books',
    'travel plans',
    'industry news',
    'interesting articles',
    'upcoming events',
    'mutual connections',
    'weekend activities',
    'learning new skills',
    'career moves'
  ]
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const OCCASIONS = [
  'the weekend', 'the holidays', 'next week', 'the conference', 
  'the meetup', 'the quarter end', 'spring', 'summer'
];

const OBSERVATIONS = [
  'this new coffee shop just opened nearby',
  'the weather has been perfect lately',
  'found a great podcast episode',
  'that article you shared was spot on',
  'the market is doing interesting things'
];

const RECOMMENDATIONS = [
  'starting small and iterating',
  'getting input from a few trusted sources first',
  'checking out some case studies',
  'talking to people who have done it before',
  'testing with a small group first'
];

const INSIGHTS = [
  'it really comes down to consistency',
  'the key is finding the right balance',
  'what worked for me was keeping it simple',
  'patience and persistence made the difference',
  'having a clear goal helped a lot'
];

const RESPONSES = [
  'I actually just went through something similar',
  'Great timing - I was thinking about this too',
  'Happy to share what I learned',
  'Let me dig into my notes on this'
];

const FOLLOW_UP_COMMENTS = [
  'I\'ll definitely try that approach.',
  'Makes total sense now.',
  'Going to look into that today.',
  'Exactly what I needed to hear.'
];

const ADDITIONAL_COMMENTS = [
  'By the way, I found a few more resources I can share if helpful.',
  'Also, feel free to reach out if you think of anything else.',
  'If I learn anything new, I\'ll pass it along.',
  'Maybe we can discuss more over coffee sometime.'
];

const ENTHUSIASMS = [
  'This is right up my alley.',
  'I\'ve been wanting to explore this more.',
  'Count me in!',
  'This sounds like a great opportunity.'
];

const AGREEMENTS = [
  'Works for me!',
  'That timing is perfect.',
  'I\'m on board.',
  'Let\'s make it happen.'
];

const CONFIRMATIONS = [
  'How about Thursday afternoon?',
  'I\'ll send a calendar invite.',
  'Same time as last time works.',
  'Looking at my calendar now.'
];

const CURIOUS_COMMENTS = [
  'I hadn\'t thought about it that way.',
  'Tell me more when you have a chance.',
  'That\'s a fresh perspective.',
  'I\'d love to dig deeper into this.'
];

const QUESTIONS = [
  'What made you go in that direction?',
  'How did you get started with that?',
  'Any early results to share?',
  'What\'s the timeline looking like?'
];

// ============================================================================
// WARM-UP EMAIL GENERATOR
// ============================================================================

class WarmupEmailGenerator {
  constructor(options = {}) {
    this.senderNames = options.senderNames || ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley'];
    this.recentSubjects = []; // Avoid repetition
    this.conversationId = 0;
  }

  /**
   * Generate a new conversation starter
   */
  generateStarter(options = {}) {
    const type = options.type || this.randomChoice(['business', 'casual']);
    const templates = CONVERSATION_STARTERS[type];
    const template = this.randomChoice(templates);
    
    const senderName = options.senderName || this.randomChoice(this.senderNames);
    const recipientName = options.recipientName || this.randomChoice(this.senderNames.filter(n => n !== senderName));
    
    const topic = this.randomChoice(TOPICS[type === 'business' ? 'business' : 'general']);
    const subtopic = this.randomChoice(TOPICS.general);
    const day = this.randomChoice(DAYS);
    const occasion = this.randomChoice(OCCASIONS);
    const observation = this.randomChoice(OBSERVATIONS);

    let subject = this.interpolate(template.subject, {
      topic,
      subtopic,
      day,
      occasion
    });

    let body = this.interpolate(template.body, {
      name: recipientName,
      sender: senderName,
      topic,
      subtopic,
      day,
      occasion,
      observation
    });

    // Apply natural variations
    subject = this.addSubjectVariation(subject);
    body = this.addBodyVariation(body);

    return {
      conversationId: `conv_${++this.conversationId}_${Date.now()}`,
      type: 'starter',
      subject,
      body,
      senderName,
      recipientName,
      topic,
      metadata: {
        templateType: type,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Generate a reply to a conversation
   */
  generateReply(conversation, options = {}) {
    const replyType = options.replyType || this.randomChoice(['helpful', 'positive', 'curious']);
    const templates = REPLY_TEMPLATES[replyType];
    const template = this.randomChoice(templates);

    const topic = conversation.topic || this.randomChoice(TOPICS.general);
    
    let body = this.interpolate(template.body, {
      sender: conversation.senderName,
      replier: conversation.recipientName,
      topic,
      recommendation: this.randomChoice(RECOMMENDATIONS),
      response: this.randomChoice(RESPONSES),
      insight: this.randomChoice(INSIGHTS),
      confirmation: this.randomChoice(CONFIRMATIONS),
      agreement: this.randomChoice(AGREEMENTS),
      enthusiasm: this.randomChoice(ENTHUSIASMS),
      question: this.randomChoice(QUESTIONS),
      curiousComment: this.randomChoice(CURIOUS_COMMENTS)
    });

    body = this.addBodyVariation(body);

    return {
      conversationId: conversation.conversationId,
      type: 'reply',
      subject: `Re: ${conversation.subject}`,
      body,
      senderName: conversation.recipientName,
      recipientName: conversation.senderName,
      inReplyTo: conversation.messageId,
      metadata: {
        replyType,
        originalSubject: conversation.subject,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Generate a follow-up (reply to a reply)
   */
  generateFollowup(conversation, reply, options = {}) {
    const templates = CONVERSATION_STARTERS.followup;
    const template = this.randomChoice(templates);

    let body = this.interpolate(template.body, {
      name: reply.senderName,
      sender: conversation.senderName,
      previousSubject: conversation.subject,
      response: this.randomChoice(RESPONSES),
      followupComment: this.randomChoice(FOLLOW_UP_COMMENTS),
      additionalComment: this.randomChoice(ADDITIONAL_COMMENTS)
    });

    let subject = this.interpolate(template.subject, {
      previousSubject: conversation.subject
    });

    body = this.addBodyVariation(body);

    return {
      conversationId: conversation.conversationId,
      type: 'followup',
      subject,
      body,
      senderName: conversation.senderName,
      recipientName: reply.senderName,
      inReplyTo: reply.messageId,
      metadata: {
        originalSubject: conversation.subject,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Generate a complete conversation (starter + reply + optional followup)
   */
  generateConversation(options = {}) {
    const includeFollowup = options.includeFollowup !== false && Math.random() > 0.3;
    
    const starter = this.generateStarter(options);
    const reply = this.generateReply(starter, options);
    
    const conversation = {
      id: starter.conversationId,
      emails: [starter, reply],
      participants: [starter.senderName, starter.recipientName]
    };

    if (includeFollowup) {
      const followup = this.generateFollowup(starter, reply, options);
      conversation.emails.push(followup);
    }

    return conversation;
  }

  /**
   * Generate a batch of emails for warm-up
   * @param {number} count - Number of emails to generate
   * @param {Object} options - Generation options
   */
  generateBatch(count, options = {}) {
    const emails = [];
    const conversations = [];
    
    // Aim for mix of starters and replies
    const conversationCount = Math.ceil(count / 2.5); // Avg 2-3 emails per conversation
    
    for (let i = 0; i < conversationCount && emails.length < count; i++) {
      const convo = this.generateConversation({
        ...options,
        includeFollowup: Math.random() > 0.4
      });
      
      conversations.push(convo);
      
      for (const email of convo.emails) {
        if (emails.length < count) {
          emails.push(email);
        }
      }
    }

    return {
      emails,
      conversations,
      stats: {
        totalEmails: emails.length,
        conversationCount: conversations.length,
        starters: emails.filter(e => e.type === 'starter').length,
        replies: emails.filter(e => e.type === 'reply').length,
        followups: emails.filter(e => e.type === 'followup').length
      }
    };
  }

  /**
   * Generate warmup email pair (for inbox-to-inbox warm-up)
   * Returns two emails that should be sent between warm-up inboxes
   */
  generateWarmupPair(inbox1, inbox2, options = {}) {
    const conversation = this.generateConversation({
      senderName: this.extractNameFromEmail(inbox1),
      recipientName: this.extractNameFromEmail(inbox2),
      ...options
    });

    return {
      outbound: {
        from: inbox1,
        to: inbox2,
        subject: conversation.emails[0].subject,
        body: conversation.emails[0].body,
        conversationId: conversation.id
      },
      reply: {
        from: inbox2,
        to: inbox1,
        subject: conversation.emails[1].subject,
        body: conversation.emails[1].body,
        conversationId: conversation.id,
        delayMinutes: this.randomBetween(5, 120) // Random delay for reply
      }
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Interpolate template with values
   */
  interpolate(template, values) {
    let result = template;
    for (const [key, value] of Object.entries(values)) {
      result = result.replace(new RegExp(`{${key}}`, 'g'), value || '');
    }
    return result;
  }

  /**
   * Add natural variations to subject
   */
  addSubjectVariation(subject) {
    // Sometimes lowercase
    if (Math.random() > 0.7) {
      subject = subject.charAt(0).toLowerCase() + subject.slice(1);
    }
    
    // Sometimes remove punctuation
    if (Math.random() > 0.8) {
      subject = subject.replace(/[?!]$/, '');
    }
    
    return subject;
  }

  /**
   * Add natural variations to body
   */
  addBodyVariation(body) {
    // Sometimes add typo (makes it look human)
    if (Math.random() > 0.9) {
      const typos = [
        ['the', 'teh'],
        ['and', 'adn'],
        ['you', 'yuo'],
        ['just', 'jsut']
      ];
      const typo = this.randomChoice(typos);
      body = body.replace(typo[0], typo[1]);
    }

    // Vary greeting capitalization
    if (Math.random() > 0.5) {
      body = body.replace(/^Hey /i, 'hey ');
    }

    // Sometimes add extra newline
    if (Math.random() > 0.7) {
      body = body.replace(/\n\n/g, '\n\n\n');
    }

    return body;
  }

  /**
   * Extract name from email
   */
  extractNameFromEmail(email) {
    const local = email.split('@')[0];
    // Try to extract a name-like part
    const namePart = local.replace(/[0-9._-]/g, ' ').trim().split(' ')[0];
    return this.capitalizeFirst(namePart) || this.randomChoice(this.senderNames);
  }

  /**
   * Capitalize first letter
   */
  capitalizeFirst(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Random choice from array
   */
  randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Random number between min and max
   */
  randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Get available topics
   */
  static getTopics() {
    return TOPICS;
  }

  /**
   * Get template types
   */
  static getTemplateTypes() {
    return {
      starters: Object.keys(CONVERSATION_STARTERS),
      replies: Object.keys(REPLY_TEMPLATES)
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  WarmupEmailGenerator,
  CONVERSATION_STARTERS,
  REPLY_TEMPLATES,
  TOPICS
};
