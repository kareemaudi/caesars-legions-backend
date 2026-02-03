// ============================================================================
// FOLLOW-UP AUTOMATION - Caesar's Legions
// ============================================================================
// Purpose: Automatically send 3-5 day follow-up email sequences
// Priority: #1 Product Development Task
// Status: Production Ready
// ============================================================================

/**
 * Follow-up Sequence Configuration
 * 
 * Timing: Day 3, Day 5, Day 7 (progressive delays)
 * Tone: Progressively more direct/value-driven
 * Strategy: Question → Value → Final CTA
 */

const FOLLOW_UP_TEMPLATES = {
  day3: {
    delay_hours: 72,
    subject_variants: [
      "Quick follow-up on {topic}",
      "Thoughts on {topic}?",
      "{firstName} - following up",
      "Re: {original_subject}"
    ],
    body_templates: [
      // Template 1: Question-based
      `Hi {firstName},

I sent you an email about {topic} a few days ago and wanted to check if it caught your attention.

{original_value_prop}

Worth a quick chat?

Best,
{sender}`,
      
      // Template 2: Assumption close
      `{firstName},

Haven't heard back, so I'm assuming one of:
• Wrong timing
• Not a priority right now
• Didn't see the original email

If it's the third one: {value_prop_one_liner}

Let me know if worth exploring.

{sender}`,
      
      // Template 3: Social proof
      `Hi {firstName},

Following up on my email about {topic}.

Since I reached out, we've helped {social_proof_stat} achieve {result}.

{firstName}, could this work for {company}?

{sender}`
    ]
  },

  day5: {
    delay_hours: 120,
    subject_variants: [
      "Last try - {topic}",
      "{firstName}, worth 5 minutes?",
      "Quick question about {company}",
      "Closing the loop"
    ],
    body_templates: [
      // Template 1: Direct value
      `{firstName},

One more try before I close the loop.

{company} + {our_solution} could mean:
• {benefit_1}
• {benefit_2}
• {benefit_3}

15-minute call this week to explore?

{sender}`,
      
      // Template 2: FOMO
      `Hi {firstName},

I know you're busy, so I'll keep this short.

{competitor_or_similar_company} saw {specific_result} in {timeframe} using {our_solution}.

If {pain_point} is still an issue, let's talk.

Otherwise, I'll close your file.

{sender}`,
      
      // Template 3: Breakup
      `{firstName},

I'll take the silence as a "not now" and stop bothering you.

But if {pain_point} becomes urgent, you have my info.

All the best,
{sender}`
    ]
  },

  day7: {
    delay_hours: 168,
    subject_variants: [
      "Moving on - {firstName}",
      "Last email from me",
      "Permission to close your file?",
      "{firstName}, final follow-up"
    ],
    body_templates: [
      // Template 1: Permission-based
      `{firstName},

I'm cleaning up my outreach list and wanted to check:

Should I keep you on my radar for {topic}, or remove you?

If you're still interested: {value_prop_one_liner}

If not, no worries - just let me know.

{sender}`,
      
      // Template 2: Direct close
      `Hi {firstName},

This is my last email. I'll assume {topic} isn't a priority right now.

If things change, here's what we offer:
{elevator_pitch}

Reach out anytime: {email} | {calendar_link}

{sender}`,
      
      // Template 3: Future-focused
      `{firstName},

No response, so I'll close your file for now.

But I'll check back in {future_timeframe} - {pain_point} rarely stays solved forever.

If you need help before then: {contact_info}

{sender}`
    ]
  }
};

/**
 * Follow-up Scheduler
 * Calculates when to send each follow-up based on original email timestamp
 */
class FollowUpScheduler {
  /**
   * @param {Object} campaign - Original campaign data
   * @param {string} campaign.id - Campaign ID
   * @param {string} campaign.clientId - Client ID
   * @param {Date} campaign.sentAt - When original email was sent
   * @param {Array} campaign.recipients - List of recipients
   */
  constructor(campaign) {
    this.campaign = campaign;
    this.followUps = [];
  }

  /**
   * Generate follow-up schedule for all recipients
   * @returns {Array} Follow-up jobs with timing and templates
   */
  generateSchedule() {
    const { sentAt, recipients } = this.campaign;
    const baseTimestamp = new Date(sentAt);

    return recipients.flatMap(recipient => {
      // Skip if recipient already replied or unsubscribed
      if (recipient.replied || recipient.unsubscribed) {
        return [];
      }

      return ['day3', 'day5', 'day7'].map(followUpType => {
        const template = FOLLOW_UP_TEMPLATES[followUpType];
        const sendAt = new Date(
          baseTimestamp.getTime() + (template.delay_hours * 60 * 60 * 1000)
        );

        return {
          campaignId: this.campaign.id,
          clientId: this.campaign.clientId,
          recipientId: recipient.id,
          recipientEmail: recipient.email,
          followUpType,
          scheduledFor: sendAt,
          status: 'scheduled',
          template: this.selectTemplate(followUpType, recipient),
          createdAt: new Date()
        };
      });
    });
  }

  /**
   * Select best template variant based on recipient data
   * @param {string} followUpType - day3, day5, or day7
   * @param {Object} recipient - Recipient data
   * @returns {Object} Selected template with subject and body
   */
  selectTemplate(followUpType, recipient) {
    const config = FOLLOW_UP_TEMPLATES[followUpType];
    
    // Simple variant selection (can be enhanced with A/B testing)
    const subjectIndex = Math.floor(Math.random() * config.subject_variants.length);
    const bodyIndex = Math.floor(Math.random() * config.body_templates.length);

    return {
      subject: config.subject_variants[subjectIndex],
      body: config.body_templates[bodyIndex],
      delay_hours: config.delay_hours
    };
  }
}

/**
 * Follow-up Executor
 * Sends scheduled follow-ups and tracks responses
 */
class FollowUpExecutor {
  /**
   * @param {Object} emailSender - Email sending service
   * @param {Object} database - Database connection
   */
  constructor(emailSender, database) {
    this.emailSender = emailSender;
    this.db = database;
  }

  /**
   * Process all due follow-ups
   * @returns {Object} Execution results
   */
  async processDueFollowUps() {
    const dueFollowUps = await this.getDueFollowUps();
    const results = {
      total: dueFollowUps.length,
      sent: 0,
      failed: 0,
      skipped: 0
    };

    for (const followUp of dueFollowUps) {
      try {
        // Check if recipient has replied in the meantime
        const hasReplied = await this.checkForReply(followUp.recipientEmail);
        if (hasReplied) {
          await this.markAsSkipped(followUp.id, 'recipient_replied');
          results.skipped++;
          continue;
        }

        // Personalize and send
        const personalizedEmail = await this.personalizeEmail(followUp);
        await this.emailSender.send(personalizedEmail);
        
        // Mark as sent
        await this.markAsSent(followUp.id);
        results.sent++;

        // Rate limiting (avoid triggering spam filters)
        await this.delay(2000); // 2 seconds between sends

      } catch (error) {
        console.error(`Failed to send follow-up ${followUp.id}:`, error);
        await this.markAsFailed(followUp.id, error.message);
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Get all follow-ups due for sending
   * @returns {Array} Due follow-ups
   */
  async getDueFollowUps() {
    // In real implementation, query database
    // For now, return mock data
    return this.db.query(`
      SELECT * FROM follow_ups
      WHERE status = 'scheduled'
        AND scheduled_for <= NOW()
        AND recipient_email NOT IN (
          SELECT email FROM replies WHERE replied_at > follow_ups.created_at
        )
      ORDER BY scheduled_for ASC
      LIMIT 100
    `);
  }

  /**
   * Check if recipient has replied since follow-up was scheduled
   * @param {string} email - Recipient email
   * @returns {boolean} Whether reply exists
   */
  async checkForReply(email) {
    const replies = await this.db.query(`
      SELECT COUNT(*) as count FROM replies
      WHERE recipient_email = ?
        AND replied_at > (
          SELECT created_at FROM follow_ups
          WHERE recipient_email = ?
          ORDER BY created_at DESC
          LIMIT 1
        )
    `, [email, email]);

    return replies[0].count > 0;
  }

  /**
   * Personalize email template with recipient data
   * @param {Object} followUp - Follow-up job
   * @returns {Object} Personalized email
   */
  async personalizeEmail(followUp) {
    const recipient = await this.db.getRecipient(followUp.recipientId);
    const campaign = await this.db.getCampaign(followUp.campaignId);

    // Variable replacement
    const variables = {
      firstName: recipient.firstName,
      lastName: recipient.lastName,
      company: recipient.company,
      topic: campaign.topic,
      original_subject: campaign.originalSubject,
      value_prop_one_liner: campaign.valueProposition,
      sender: campaign.senderName,
      email: campaign.senderEmail,
      // Add more as needed
    };

    return {
      to: followUp.recipientEmail,
      from: campaign.senderEmail,
      subject: this.replaceVariables(followUp.template.subject, variables),
      body: this.replaceVariables(followUp.template.body, variables),
      replyTo: campaign.replyToEmail || campaign.senderEmail,
      campaignId: followUp.campaignId,
      followUpType: followUp.followUpType
    };
  }

  /**
   * Replace template variables with actual values
   * @param {string} template - Template string
   * @param {Object} variables - Variable values
   * @returns {string} Personalized text
   */
  replaceVariables(template, variables) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return variables[key] || match;
    });
  }

  /**
   * Mark follow-up as sent
   * @param {string} followUpId - Follow-up ID
   */
  async markAsSent(followUpId) {
    await this.db.query(`
      UPDATE follow_ups
      SET status = 'sent', sent_at = NOW()
      WHERE id = ?
    `, [followUpId]);
  }

  /**
   * Mark follow-up as skipped
   * @param {string} followUpId - Follow-up ID
   * @param {string} reason - Skip reason
   */
  async markAsSkipped(followUpId, reason) {
    await this.db.query(`
      UPDATE follow_ups
      SET status = 'skipped', skip_reason = ?
      WHERE id = ?
    `, [reason, followUpId]);
  }

  /**
   * Mark follow-up as failed
   * @param {string} followUpId - Follow-up ID
   * @param {string} error - Error message
   */
  async markAsFailed(followUpId, error) {
    await this.db.query(`
      UPDATE follow_ups
      SET status = 'failed', error_message = ?
      WHERE id = ?
    `, [error, followUpId]);
  }

  /**
   * Delay helper for rate limiting
   * @param {number} ms - Milliseconds to wait
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Follow-up Analytics
 * Track performance of follow-up sequences
 */
class FollowUpAnalytics {
  constructor(database) {
    this.db = database;
  }

  /**
   * Get follow-up performance metrics
   * @param {string} campaignId - Campaign ID
   * @returns {Object} Performance stats
   */
  async getMetrics(campaignId) {
    const [day3, day5, day7] = await Promise.all([
      this.getFollowUpStats(campaignId, 'day3'),
      this.getFollowUpStats(campaignId, 'day5'),
      this.getFollowUpStats(campaignId, 'day7')
    ]);

    return {
      campaign_id: campaignId,
      day3,
      day5,
      day7,
      overall: {
        total_sent: day3.sent + day5.sent + day7.sent,
        total_opened: day3.opened + day5.opened + day7.opened,
        total_replied: day3.replied + day5.replied + day7.replied,
        reply_rate: this.calculateReplyRate(day3, day5, day7)
      }
    };
  }

  /**
   * Get stats for specific follow-up stage
   * @param {string} campaignId - Campaign ID
   * @param {string} followUpType - day3, day5, or day7
   * @returns {Object} Stats
   */
  async getFollowUpStats(campaignId, followUpType) {
    const stats = await this.db.query(`
      SELECT 
        COUNT(*) as sent,
        SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN replied_at IS NOT NULL THEN 1 ELSE 0 END) as replied
      FROM follow_ups
      WHERE campaign_id = ?
        AND follow_up_type = ?
        AND status = 'sent'
    `, [campaignId, followUpType]);

    const row = stats[0];
    return {
      stage: followUpType,
      sent: row.sent,
      opened: row.opened,
      replied: row.replied,
      open_rate: row.sent > 0 ? (row.opened / row.sent * 100).toFixed(2) + '%' : '0%',
      reply_rate: row.sent > 0 ? (row.replied / row.sent * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Calculate overall reply rate across all follow-ups
   * @param {Object} day3 - Day 3 stats
   * @param {Object} day5 - Day 5 stats
   * @param {Object} day7 - Day 7 stats
   * @returns {string} Reply rate percentage
   */
  calculateReplyRate(day3, day5, day7) {
    const totalSent = day3.sent + day5.sent + day7.sent;
    const totalReplied = day3.replied + day5.replied + day7.replied;
    
    return totalSent > 0 
      ? (totalReplied / totalSent * 100).toFixed(2) + '%' 
      : '0%';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  FollowUpScheduler,
  FollowUpExecutor,
  FollowUpAnalytics,
  FOLLOW_UP_TEMPLATES
};

// ============================================================================
// USAGE EXAMPLE
// ============================================================================
/*

const { FollowUpScheduler, FollowUpExecutor } = require('./follow-ups');

// 1. Schedule follow-ups after sending campaign
const campaign = {
  id: 'camp_123',
  clientId: 'client_456',
  sentAt: new Date(),
  recipients: [
    { id: 'rec_1', email: 'founder@startup.com', firstName: 'John' },
    { id: 'rec_2', email: 'ceo@company.com', firstName: 'Jane' }
  ]
};

const scheduler = new FollowUpScheduler(campaign);
const followUpJobs = scheduler.generateSchedule();

// Save to database
await database.insertFollowUps(followUpJobs);

// 2. Process due follow-ups (run via cron every hour)
const executor = new FollowUpExecutor(emailService, database);
const results = await executor.processDueFollowUps();

console.log(`Sent: ${results.sent}, Failed: ${results.failed}, Skipped: ${results.skipped}`);

// 3. Get analytics
const analytics = new FollowUpAnalytics(database);
const metrics = await analytics.getMetrics('camp_123');
console.log('Follow-up performance:', metrics);

*/
