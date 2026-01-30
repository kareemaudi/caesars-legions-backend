// Automated Follow-up System
// Sends 3-day and 7-day follow-ups automatically

const db = require('./db');
const { generateFollowUp } = require('./email-generator');
const { sendEmail } = require('./email-sender');

/**
 * Check all campaigns for leads that need follow-ups
 * Run this daily via cron
 */
async function processFollowUps(options = {}) {
  const { dryRun = true } = options;
  
  console.log('\n📧 Processing Follow-ups...\n');
  
  const now = Math.floor(Date.now() / 1000);
  const threeDaysAgo = now - (3 * 24 * 60 * 60);
  const sevenDaysAgo = now - (7 * 24 * 60 * 60);
  
  const results = {
    day3: [],
    day7: [],
    errors: []
  };
  
  // Get all active clients
  const clients = db.getAllClients().filter(c => c.status === 'active');
  
  for (const client of clients) {
    // Get emails sent to this client's campaigns
    const recentEmails = db.getRecentEmails(client.id, 1000);
    
    for (const email of recentEmails) {
      // Skip if already replied or bounced
      if (email.replied || email.bounced) continue;
      
      const daysSince = Math.floor((now - email.sent_at) / (24 * 60 * 60));
      
      // Check if we already sent follow-ups
      const followUpsSent = countFollowUpsSent(email.lead_id);
      
      // 3-day follow-up
      if (daysSince >= 3 && daysSince < 4 && followUpsSent === 0) {
        try {
          await sendFollowUpEmail(client, email, 3, dryRun);
          results.day3.push(email.lead_email);
        } catch (error) {
          results.errors.push({ lead: email.lead_email, error: error.message });
        }
      }
      
      // 7-day follow-up
      if (daysSince >= 7 && daysSince < 8 && followUpsSent === 1) {
        try {
          await sendFollowUpEmail(client, email, 7, dryRun);
          results.day7.push(email.lead_email);
        } catch (error) {
          results.errors.push({ lead: email.lead_email, error: error.message });
        }
      }
    }
  }
  
  console.log(`\n✅ Follow-up Processing Complete:`);
  console.log(`   3-day follow-ups: ${results.day3.length}`);
  console.log(`   7-day follow-ups: ${results.day7.length}`);
  console.log(`   Errors: ${results.errors.length}\n`);
  
  return results;
}

/**
 * Send a follow-up email to a lead
 */
async function sendFollowUpEmail(client, originalEmail, daysSince, dryRun = true) {
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
  scheduleFollowUp
};
