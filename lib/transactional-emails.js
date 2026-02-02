// Transactional Email Templates
// Welcome emails, payment notifications, etc.
// Uses SMTP sender for reliable delivery

const { smtpSender } = require('./smtp-sender');
const db = require('./db');

/**
 * Send welcome email to new client
 * @param {Object} client - Client data from database
 */
async function sendWelcomeEmail(client) {
  const subject = "Welcome to Caesar's Legions 🏛️";
  
  const body = `Hi ${client.contact_name || 'there'},

Welcome to Caesar's Legions! Your account is now active.

🎯 **What happens next:**

1. I'll start crafting personalized cold emails for your target audience
2. Campaigns launch within 24 hours (I'll send you samples for approval)
3. You'll see results in your dashboard: ${process.env.DASHBOARD_URL || 'https://caesars-legions.com/dashboard'}

📊 **Your Plan:**
- ${client.plan || 'Pro'} - ${client.monthly_budget || '$499'}/month
- Up to ${getLeadLimit(client.plan)} personalized emails/month
- AI-powered follow-ups
- Real-time analytics

📧 **Quick Setup:**
If you haven't already, reply to this email with:
1. Your ideal customer profile (who should I target?)
2. Your main value proposition (what problem do you solve?)
3. Any specific industries or companies to focus on

I'll use this to generate hyper-relevant outreach.

💬 **Need Help?**
Reply to this email or DM me on X: https://x.com/agenticCaesar

Let's conquer your market together.

— Caesar
AI-Powered Outbound Engine

---

Caesar's Legions
${process.env.PHYSICAL_ADDRESS || 'Powered by Clawdbot AI'}
`;

  try {
    const result = await smtpSender.sendEmail({
      to: client.email,
      subject,
      body,
      fromName: "Caesar's Legions",
      fromEmail: process.env.SMTP_USER
    });

    if (result.success) {
      console.log(`✓ Welcome email sent to ${client.email}`);
      
      // Log to database
      logTransactionalEmail({
        client_id: client.id,
        type: 'welcome',
        to: client.email,
        subject,
        sent_at: Math.floor(Date.now() / 1000)
      });
    }

    return result;
  } catch (error) {
    console.error(`✗ Failed to send welcome email to ${client.email}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send payment failure notification
 * @param {Object} client - Client data
 */
async function sendPaymentFailedEmail(client) {
  const subject = "Payment Issue - Action Required";
  
  const body = `Hi ${client.contact_name || 'there'},

We tried to process your payment for Caesar's Legions but it didn't go through.

💳 **What to do:**
1. Update your payment method: ${process.env.DASHBOARD_URL || 'https://caesars-legions.com'}/billing
2. Or reply to this email and I'll help you resolve it

Your campaigns are paused until payment is updated. No worries — all your data and settings are safe.

⏰ **Timeline:**
- Your account will be paused after 3 days
- After 7 days, campaigns will be permanently stopped

Let me know if you have any questions!

— Caesar

---

Caesar's Legions
${process.env.PHYSICAL_ADDRESS || 'Powered by Clawdbot AI'}
`;

  try {
    const result = await smtpSender.sendEmail({
      to: client.email,
      subject,
      body,
      fromName: "Caesar's Legions - Billing",
      fromEmail: process.env.SMTP_USER
    });

    if (result.success) {
      console.log(`✓ Payment failed email sent to ${client.email}`);
      
      logTransactionalEmail({
        client_id: client.id,
        type: 'payment_failed',
        to: client.email,
        subject,
        sent_at: Math.floor(Date.now() / 1000)
      });
    }

    return result;
  } catch (error) {
    console.error(`✗ Failed to send payment failure email:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send campaign approval request
 * @param {Object} client - Client data
 * @param {Array} sampleEmails - Sample emails to approve (3-5)
 */
async function sendApprovalRequest(client, sampleEmails) {
  const subject = "Campaign Ready for Review 📋";
  
  const samplesText = sampleEmails.map((email, i) => `
**Sample ${i + 1}:**
To: ${email.lead.first_name} ${email.lead.last_name} (${email.lead.company})
Subject: ${email.subject}

${email.body}

---
`).join('\n');
  
  const body = `Hi ${client.contact_name},

Your first campaign is ready! I've crafted ${sampleEmails.length} sample emails for you to review.

${samplesText}

✅ **To approve and launch:**
Reply "APPROVED" and I'll send to ${sampleEmails[0].totalLeads || 50} leads today.

✏️ **Want changes?**
Reply with specific feedback (e.g., "Make it shorter" or "Focus more on X benefit")

⏱️ **Timeline:**
Once approved, emails send within 2 hours. Follow-ups happen automatically (Day 3 and Day 7).

Let me know if you have questions!

— Caesar

---

Caesar's Legions
${process.env.PHYSICAL_ADDRESS || 'Powered by Clawdbot AI'}
`;

  try {
    const result = await smtpSender.sendEmail({
      to: client.email,
      subject,
      body,
      fromName: "Caesar's Legions",
      fromEmail: process.env.SMTP_USER
    });

    if (result.success) {
      console.log(`✓ Approval request sent to ${client.email}`);
      
      logTransactionalEmail({
        client_id: client.id,
        type: 'approval_request',
        to: client.email,
        subject,
        sent_at: Math.floor(Date.now() / 1000)
      });
    }

    return result;
  } catch (error) {
    console.error(`✗ Failed to send approval request:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send weekly performance report
 * @param {Object} client - Client data
 * @param {Object} stats - Weekly stats
 */
async function sendWeeklyReport(client, stats) {
  const subject = `Your Weekly Report: ${stats.emails_sent} emails sent, ${stats.replies} replies`;
  
  const body = `Hi ${client.contact_name},

Here's your weekly Caesar's Legions performance summary:

📊 **This Week (${stats.week_start} - ${stats.week_end})**

Emails Sent: ${stats.emails_sent}
Opened: ${stats.opens} (${stats.open_rate}%)
Clicked: ${stats.clicks} (${stats.click_rate}%)
Replied: ${stats.replies} (${stats.reply_rate}%)

💬 **Top Replies:**
${formatTopReplies(stats.top_replies)}

🎯 **Best Performing Campaign:**
${stats.best_campaign?.name || 'N/A'} - ${stats.best_campaign?.reply_rate || 0}% reply rate

📈 **Recommendations:**
${generateRecommendations(stats)}

🔗 **View Full Dashboard:**
${process.env.DASHBOARD_URL || 'https://caesars-legions.com'}/dashboard

Keep up the great work!

— Caesar

---

Caesar's Legions
${process.env.PHYSICAL_ADDRESS || 'Powered by Clawdbot AI'}
`;

  try {
    const result = await smtpSender.sendEmail({
      to: client.email,
      subject,
      body,
      fromName: "Caesar's Legions - Reports",
      fromEmail: process.env.SMTP_USER
    });

    if (result.success) {
      console.log(`✓ Weekly report sent to ${client.email}`);
      
      logTransactionalEmail({
        client_id: client.id,
        type: 'weekly_report',
        to: client.email,
        subject,
        sent_at: Math.floor(Date.now() / 1000)
      });
    }

    return result;
  } catch (error) {
    console.error(`✗ Failed to send weekly report:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send admin notification via Telegram
 * @param {string} message - Alert message
 * @param {string} priority - 'urgent', 'normal', 'info'
 */
async function notifyAdmin(message, priority = 'normal') {
  // This will be implemented when we integrate Telegram
  // For now, just log to console
  const emoji = {
    urgent: '🚨',
    normal: '📢',
    info: 'ℹ️'
  }[priority] || '📢';
  
  console.log(`${emoji} ADMIN NOTIFICATION: ${message}`);
  
  // TODO: Integrate with Clawdbot's message tool for Telegram
  // await message({ action: 'send', channel: 'telegram', target: ADMIN_ID, message });
  
  return { success: true, logged: true };
}

/**
 * Helper: Get lead limit based on plan
 */
function getLeadLimit(plan) {
  const limits = {
    'starter': '500',
    'pro': '2,000',
    'enterprise': '10,000'
  };
  return limits[plan?.toLowerCase()] || '2,000';
}

/**
 * Helper: Format top replies
 */
function formatTopReplies(replies) {
  if (!replies || replies.length === 0) {
    return 'No replies yet this week';
  }
  
  return replies.slice(0, 3).map((r, i) => 
    `${i + 1}. ${r.lead_name} from ${r.company}: "${r.preview}"`
  ).join('\n');
}

/**
 * Helper: Generate recommendations based on stats
 */
function generateRecommendations(stats) {
  const recs = [];
  
  if (stats.open_rate < 40) {
    recs.push('- Try A/B testing subject lines (aim for >40% open rate)');
  }
  
  if (stats.reply_rate < 3) {
    recs.push('- Consider making emails shorter and more specific');
  }
  
  if (stats.emails_sent < 100) {
    recs.push('- Increase volume to get statistically significant data');
  }
  
  if (recs.length === 0) {
    return 'You\'re doing great! Keep this momentum going.';
  }
  
  return recs.join('\n');
}

/**
 * Log transactional email to database
 * (Separate from campaign emails)
 */
function logTransactionalEmail(data) {
  try {
    // For now, log to file (can integrate with DB later)
    const fs = require('fs');
    const path = require('path');
    const logFile = path.join(__dirname, '../logs/transactional-emails.jsonl');
    
    fs.appendFileSync(logFile, JSON.stringify({
      ...data,
      timestamp: new Date().toISOString()
    }) + '\n');
  } catch (error) {
    console.error('Failed to log transactional email:', error.message);
  }
}

module.exports = {
  sendWelcomeEmail,
  sendPaymentFailedEmail,
  sendApprovalRequest,
  sendWeeklyReport,
  notifyAdmin
};
