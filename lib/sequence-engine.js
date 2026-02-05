/**
 * Multi-Channel Sequence Engine
 * Coordinates outreach across Email, LinkedIn, Twitter, Reddit
 * 
 * Example sequence:
 * Day 0: LinkedIn connection request
 * Day 1: View Twitter profile, like recent tweet
 * Day 2: Send email if LinkedIn not accepted
 * Day 4: LinkedIn message if connected, else email follow-up
 * Day 7: Final email + Twitter DM
 */

const EmailSender = require('./email-sender');
const LinkedInOutreach = require('./linkedin-outreach');
const TwitterOutreach = require('./twitter-outreach');

class SequenceEngine {
  constructor(options = {}) {
    this.email = options.emailSender || new EmailSender();
    this.linkedin = options.linkedinOutreach || new LinkedInOutreach();
    this.twitter = options.twitterOutreach || new TwitterOutreach();
    
    this.sequences = new Map(); // Active sequences
    this.completedSteps = new Map(); // Tracking completed steps
  }

  /**
   * Define a multi-channel sequence
   * @param {string} name - Sequence name
   * @param {Array} steps - Array of step definitions
   */
  defineSequence(name, steps) {
    this.sequences.set(name, steps);
    return this;
  }

  /**
   * Get default multi-channel sequence
   */
  getDefaultSequence() {
    return [
      {
        day: 0,
        channel: 'linkedin',
        action: 'connection_request',
        template: 'linkedin_connect_v1'
      },
      {
        day: 1,
        channel: 'twitter',
        action: 'engage',
        template: 'twitter_like_recent'
      },
      {
        day: 2,
        channel: 'email',
        action: 'send',
        condition: 'linkedin_not_accepted',
        template: 'email_v2_psychology'
      },
      {
        day: 4,
        channel: 'linkedin',
        action: 'message',
        condition: 'linkedin_connected',
        template: 'linkedin_message_v1',
        fallback: {
          channel: 'email',
          action: 'send',
          template: 'email_followup_v1'
        }
      },
      {
        day: 7,
        channel: 'email',
        action: 'send',
        template: 'email_breakup_v1'
      },
      {
        day: 7,
        channel: 'twitter',
        action: 'dm',
        condition: 'no_response',
        template: 'twitter_dm_final'
      }
    ];
  }

  /**
   * Start a prospect on a sequence
   * @param {Object} prospect - Full prospect data
   * @param {string} sequenceName - Sequence to use
   */
  async startSequence(prospect, sequenceName = 'default') {
    const sequence = sequenceName === 'default' 
      ? this.getDefaultSequence() 
      : this.sequences.get(sequenceName);
    
    if (!sequence) {
      throw new Error(`Sequence '${sequenceName}' not found`);
    }

    const prospectId = prospect.id || prospect.email;
    
    // Store sequence state
    this.completedSteps.set(prospectId, {
      prospect,
      sequence: sequenceName,
      startedAt: new Date(),
      steps: [],
      currentDay: 0,
      status: 'active'
    });

    // Execute day 0 steps immediately
    return this.executeDay(prospectId, 0);
  }

  /**
   * Execute all steps for a given day
   * @param {string} prospectId 
   * @param {number} day 
   */
  async executeDay(prospectId, day) {
    const state = this.completedSteps.get(prospectId);
    if (!state || state.status !== 'active') {
      return { success: false, error: 'Sequence not active' };
    }

    const sequence = state.sequence === 'default'
      ? this.getDefaultSequence()
      : this.sequences.get(state.sequence);

    const daySteps = sequence.filter(s => s.day === day);
    const results = [];

    for (const step of daySteps) {
      // Check conditions
      if (step.condition && !this.checkCondition(step.condition, state)) {
        // Try fallback if available
        if (step.fallback) {
          const fallbackResult = await this.executeStep(step.fallback, state.prospect);
          results.push({ ...fallbackResult, wasFallback: true });
        }
        continue;
      }

      const result = await this.executeStep(step, state.prospect);
      results.push(result);

      // Record completed step
      state.steps.push({
        day,
        step,
        result,
        executedAt: new Date()
      });
    }

    state.currentDay = day;
    return { success: true, day, results };
  }

  /**
   * Execute a single step
   * @param {Object} step 
   * @param {Object} prospect 
   */
  async executeStep(step, prospect) {
    const { channel, action, template } = step;

    switch (channel) {
      case 'email':
        return this.executeEmailStep(action, prospect, template);
      case 'linkedin':
        return this.executeLinkedInStep(action, prospect, template);
      case 'twitter':
        return this.executeTwitterStep(action, prospect, template);
      default:
        return { success: false, error: `Unknown channel: ${channel}` };
    }
  }

  /**
   * Execute email step
   */
  async executeEmailStep(action, prospect, template) {
    if (action === 'send') {
      // Generate email from template
      const emailContent = this.getTemplate(template, prospect);
      
      return this.email.send({
        to: prospect.email,
        subject: emailContent.subject,
        body: emailContent.body
      });
    }
    return { success: false, error: `Unknown email action: ${action}` };
  }

  /**
   * Execute LinkedIn step
   */
  async executeLinkedInStep(action, prospect, template) {
    switch (action) {
      case 'connection_request':
        const note = this.linkedin.generateConnectionNote(prospect);
        return this.linkedin.sendConnectionRequest({ ...prospect, note });
      case 'message':
        const message = this.getTemplate(template, prospect);
        return this.linkedin.sendMessage({ ...prospect, message: message.body });
      case 'view_profile':
        return this.linkedin.viewProfile(prospect.linkedinUrl);
      default:
        return { success: false, error: `Unknown LinkedIn action: ${action}` };
    }
  }

  /**
   * Execute Twitter step
   */
  async executeTwitterStep(action, prospect, template) {
    switch (action) {
      case 'dm':
        const message = this.getTemplate(template, prospect);
        return this.twitter.sendDM({
          username: prospect.twitterHandle,
          message: message.body
        });
      case 'engage':
        // Like recent tweet
        return this.twitter.like(prospect.recentTweetId || 'placeholder');
      case 'follow':
        return this.twitter.follow(prospect.twitterHandle);
      default:
        return { success: false, error: `Unknown Twitter action: ${action}` };
    }
  }

  /**
   * Check if condition is met
   */
  checkCondition(condition, state) {
    switch (condition) {
      case 'linkedin_not_accepted':
        return !state.linkedinConnected;
      case 'linkedin_connected':
        return state.linkedinConnected === true;
      case 'no_response':
        return !state.hasReplied;
      case 'has_responded':
        return state.hasReplied === true;
      default:
        return true;
    }
  }

  /**
   * Get template content
   */
  getTemplate(templateId, prospect) {
    // TODO: Load from template library
    // For now, return placeholder
    return {
      subject: `Quick question for ${prospect.firstName || prospect.company}`,
      body: `Hi ${prospect.firstName || 'there'},\n\nPlaceholder template content for ${templateId}.\n\n— Caesar`
    };
  }

  /**
   * Get sequence stats
   */
  getStats() {
    const active = [...this.completedSteps.values()].filter(s => s.status === 'active').length;
    const completed = [...this.completedSteps.values()].filter(s => s.status === 'completed').length;
    
    return {
      activeSequences: active,
      completedSequences: completed,
      totalProspects: this.completedSteps.size,
      emailStats: this.email.getStats?.() || {},
      linkedinStats: this.linkedin.getStats(),
      twitterStats: this.twitter.getStats()
    };
  }
}

module.exports = SequenceEngine;
