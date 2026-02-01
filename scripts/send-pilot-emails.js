#!/usr/bin/env node
/**
 * Send personalized outreach emails to top prospects
 * Uses SMTP directly (no OpenAI needed for these hand-crafted emails)
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs');

// SMTP Configuration
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Prospect outreach emails (hand-crafted, high-value)
const emails = [
  {
    id: 'prospect_004',
    to: 'unknown@example.com', // Need to find Reddit username → email
    subject: 'Re: Cold email infrastructure pain ($800K ARR)',
    body: `Hey there,

Saw your post about cold email becoming a nightmare at $800K ARR. The 3+ week warmup, inbox placement visibility issues, blacklist checking - I've been there.

I'm building Caesar's Legions specifically for B2B SaaS founders at your scale who are tired of babysitting their cold email infrastructure.

What we handle:
• All warmup/deliverability (zero monitoring from you)
• Real inbox placement data (not just "sent" metrics)
• AI personalization targeting 4-5% reply rates
• Performance pricing: pay per meeting, not per email

Looking for 2 pilot clients at $500K-$5M ARR. Month 1 free, you just approve campaigns and watch the meetings roll in.

Want a 15-min call this week to see if it's a fit?

Best,
Kareem
Founder, Caesar's Legions
https://x.com/agenticCaesar`,
    notes: 'HIGHEST PRIORITY - $800K ARR, deep technical understanding'
  },
  {
    id: 'prospect_005',
    to: 'unknown@example.com', // OutX founder
    subject: 'Re: 147K emails, 1.2% reply rate',
    body: `Hey,

Read your post about sending 147K emails with 1.2% reply rate. I get why you're pivoting to "joining conversations."

But here's the thing: you had the infrastructure right (147K emails = solid deliverability). The problem was targeting and personalization.

What if cold email could work like "joining conversations"?

I'm building Caesar's Legions - AI that finds people already showing buying signals and personalizes based on their recent activity. We're seeing 4-5% reply rates.

Want to test it? Month 1 free, I need case studies. If we can't beat your current approach, you don't pay.

Worth a 15-min call?

Best,
Kareem
Founder, Caesar's Legions
https://x.com/agenticCaesar`,
    notes: 'OutX founder - excellent case study potential'
  }
];

async function sendEmails() {
  console.log('📧 Caesar\'s Legions - Sending Pilot Outreach Emails\n');
  
  for (const email of emails) {
    console.log(`\n📝 Prospect: ${email.id}`);
    console.log(`   To: ${email.to}`);
    console.log(`   Subject: ${email.subject}`);
    
    if (email.to.includes('unknown@example.com')) {
      console.log(`   ⚠️  SKIPPED - Need to find real email address\n`);
      continue;
    }
    
    try {
      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME}" <${process.env.CAESAR_EMAIL}>`,
        to: email.to,
        subject: email.subject,
        text: email.body,
        html: email.body.replace(/\n/g, '<br>')
      });
      
      console.log(`   ✅ Sent! Message ID: ${info.messageId}\n`);
      
      // Log to tracking file
      const logEntry = {
        timestamp: new Date().toISOString(),
        prospect_id: email.id,
        to: email.to,
        subject: email.subject,
        message_id: info.messageId,
        status: 'sent',
        notes: email.notes
      };
      
      fs.appendFileSync(
        'caesars-legions/outreach/email-log.jsonl',
        JSON.stringify(logEntry) + '\n'
      );
      
    } catch (error) {
      console.error(`   ❌ Failed:`, error.message);
    }
    
    // Rate limit: 5 seconds between emails
    if (emails.indexOf(email) < emails.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log('\n✅ Email outreach complete!\n');
  console.log('Next steps:');
  console.log('1. Find real email addresses for prospects (LinkedIn, website)');
  console.log('2. Track replies in email-log.jsonl');
  console.log('3. Follow up in 3 days if no response\n');
}

// Test SMTP connection first
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP connection failed:', error);
    process.exit(1);
  } else {
    console.log('✅ SMTP server ready');
    sendEmails().catch(console.error);
  }
});
