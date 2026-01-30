// Automated Follow-up System
// Sends 3-day and 7-day follow-ups automatically
// Enhanced with configurable timing, business hours, and timezone awareness

const db = require('./db');
const { generateFollowUp } = require('./email-generator');
const { sendEmail } = require('./email-sender');

// Default configuration (can be overridden per client)
const DEFAULT_CONFIG = {
  followUpDelays: [3, 7], // Days after initial email
  businessHoursOnly: true,
  businessHours: { start: 9, end: 17 }, // 9 AM - 5 PM
  timezone: 'America/New_York', // Default to US Eastern
  maxFollowUps: 2,
  minIntervalHours: 48 // Minimum hours between follow-ups
};

/**
 * Check all campaigns for leads that need follow-ups
 * Run this daily via cron (or more frequently)
 */
async function processFollowUps(options = {}) {
  const { dryRun = true, config = DEFAULT_CONFIG } = options;
  
  console.log('\n📧 Processing Follow-ups...\n');
  
  // Check if we should send now (business hours check)
  const shouldSendNow = !config.businessHoursOnly || 
                        isBusinessHours(config.timezone, config.businessHours);
  
  if (!shouldSendNow && !dryRun) {
    const nextTime = getNextSendTime(config);
    console.log(`⏰ Outside business hours. Next send window: ${nextTime.toLocaleString()}`);
    return { skipped: true, nextSendTime: nextTime };
  }
  
  const now = Math.floor(Date.now() / 1000);
  
  const results = {
    sent: {},
    scheduled: [],
    errors: [],
    skipped: 0
  };
  
  // Initialize result counters for each follow-up delay
  config.followUpDelays.forEach(delay => {
    results.sent[`day${delay}`] = [];
  });
  
  // Get all active clients
  const clients = db.getAllClients().filter(c => c.status === 'active');
  
  for (const client of clients) {
    // Get emails sent to this client's campaigns
    const recentEmails = db.getRecentEmails(client.id, 1000);
    
    for (const email of recentEmails) {
      // Skip if already replied or bounced
      if (email.replied || email.bounced) {
        results.skipped++;
        continue;
      }
      
      const daysSince = Math.floor((now - email.sent_at) / (24 * 60 * 60));
      const followUpsSent = countFollowUpsSent(email.lead_id);
      
      // Check each configured follow-up delay
      for (let i = 0; i < config.followUpDelays.length; i++) {
        const delay = config.followUpDelays[i];
        
        // Only send if:
        // 1. Enough days have passed
        // 2. Not too many days past (1-day window)
        // 3. We've sent exactly i follow-ups already
        // 4. Haven't exceeded max follow-ups
        if (daysSince >= delay && 
            daysSince < delay + 1 && 
            followUpsSent === i &&
            followUpsSent < config.maxFollowUps) {
          try {
            await sendFollowUpEmail(client, email, delay, dryRun, config);
            results.sent[`day${delay}`].push(email.lead_email);
          } catch (error) {
            results.errors.push({ 
              lead: email.lead_email, 
              error: error.message,
              delay: delay 
            });
          }
        }
      }
    }
  }
  
  // Summary
  console.log(`\n✅ Follow-up Processing Complete:`);
  config.followUpDelays.forEach(delay => {
    const count = results.sent[`day${delay}`]?.length || 0;
    console.log(`   Day ${delay} follow-ups: ${count}`);
  });
  console.log(`   Skipped (replied/bounced): ${results.skipped}`);
  console.log(`   Errors: ${results.errors.length}\n`);
  
  return results;
}

/**
 * Send a follow-up email to a lead
 */
async function sendFollowUpEmail(client, originalEmail, daysSince, dryRun = true, config = DEFAULT_CONFIG) {
  // Get lead data
  const lead = {
    id: originalEmail.lead_id,
    email: originalEmail.lead_email,
    first_name: originalEmail.first_name,
    last_name: originalEmail.last_name,
    company: originalEmail.company
  };
  
  // Generate follow-up
  const followUp = await generateFollowUp({
    lead,
    client,
    previousEmail: {
      subject: originalEmail.subject,
      body: originalEmail.body
    },
    daysSince
  });
  
  console.log(`📧 Follow-up (Day ${daysSince}): ${lead.first_name} ${lead.last_name}`);
  console.log(`   Subject: ${followUp.subject}`);
  console.log(`   Preview: ${followUp.body.substring(0, 60)}...`);
  
  if (!dryRun) {
    // Send the email
    const result = await sendEmail({
      to: lead.email,
      subject: followUp.subject,
      body: followUp.body,
      fromEmail: client.email
    });
    
    if (result.success) {
      // Log to database
      db.insertEmailSent({
        lead_id: lead.id,
        campaign_id: originalEmail.campaign_id,
        client_id: client.id,
        subject: followUp.subject,
        body: followUp.body,
        personalization_data: JSON.stringify({
          follow_up: true,
          days_since: daysSince,
          original_subject: originalEmail.subject
        })
      });
      
      console.log('   ✓ Sent');
    } else {
      console.log(`   ✗ Failed: ${result.error}`);
      throw new Error(result.error);
    }
  } else {
    console.log('   [DRY RUN - not sent]');
  }
  
  // Rate limiting
  await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * Count how many follow-ups have been sent to a lead
 */
function countFollowUpsSent(leadId) {
  const allEmails = db.getRecentEmails(1, 10000); // Get all emails
  const leadEmails = allEmails.filter(e => e.lead_id === leadId);
  
  let followUpCount = 0;
  for (const email of leadEmails) {
    try {
      const data = JSON.parse(email.personalization_data || '{}');
      if (data.follow_up) followUpCount++;
    } catch (error) {
      // Ignore parse errors
    }
  }
  
  return followUpCount;
}

/**
 * Check if current time is within business hours for given timezone
 * @param {string} timezone - IANA timezone (e.g., 'America/New_York')
 * @param {object} hours - { start: 9, end: 17 }
 * @returns {boolean}
 */
function isBusinessHours(timezone = 'America/New_York', hours = { start: 9, end: 17 }) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false
    });
    
    const hourStr = formatter.format(now);
    const currentHour = parseInt(hourStr, 10);
    
    return currentHour >= hours.start && currentHour < hours.end;
  } catch (error) {
    console.warn(`⚠️ Invalid timezone ${timezone}, defaulting to sending`);
    return true; // If timezone parsing fails, don't block sending
  }
}

/**
 * Get optimal send time for a follow-up
 * If outside business hours, calculate next available slot
 */
function getNextSendTime(config = DEFAULT_CONFIG) {
  const now = new Date();
  
  if (!config.businessHoursOnly) {
    return now; // Send immediately
  }
  
  // Check if we're in business hours
  if (isBusinessHours(config.timezone, config.businessHours)) {
    return now; // Send now
  }
  
  // Calculate next business hour
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(config.businessHours.start, 0, 0, 0);
  
  return tomorrow;
}

/**
 * Schedule follow-up for a specific lead
 * (For manual triggering)
 */
async function scheduleFollowUp(leadId, clientId, dayDelay = 3) {
  // This would integrate with a job queue (BullMQ, Redis, etc.)
  // For now, just a placeholder
  console.log(`📅 Scheduled follow-up for lead ${leadId} in ${dayDelay} days`);
  
  return {
    scheduled: true,
    leadId,
    clientId,
    runAt: new Date(Date.now() + dayDelay * 24 * 60 * 60 * 1000)
  };
}

module.exports = {
  processFollowUps,
  sendFollowUpEmail,
  scheduleFollowUp,
  isBusinessHours,
  getNextSendTime,
  DEFAULT_CONFIG
};
