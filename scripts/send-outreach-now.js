#!/usr/bin/env node
/**
 * SEND OUTREACH EMAILS NOW - Autonomous Execution
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Prospects (from Reddit research)
const prospects = [
  {
    id: 'prospect_001',
    name: 'Reddit founder',
    email: 'prospect1@example.com', // Need real email from Reddit profile
    subject: 'Re: Struggling to market B2B SaaS',
    body: `Hey!

Saw your post in r/b2bmarketing about struggling with marketing/sales. I'm building Caesar's Legions - AI-powered cold email specifically for B2B SaaS founders in your exact situation.

You mentioned struggling with reaching decision-makers and booking demos. That's exactly what we solve.

Early access is free for first 5 clients (I need case studies). Interested in a 15-min call this week?

If not, no worries - but I'd be happy to share what's working for us with outbound right now.

- Kareem
Caesar's Legions
Caesar@cmonkeytribe.com`
  },
  {
    id: 'prospect_002',
    name: 'Reddit founder 2',
    email: 'prospect2@example.com',
    subject: 'Re: Getting first 10 B2B customers',
    body: `Hey!

Your post about getting first 10 B2B customers really resonated.

"Cold emails not guaranteed" - you're right. Most cold email fails because it's generic.

I'm building Caesar's Legions: AI-powered cold email that learns from every campaign. Not another Instantly clone.

First 5 clients get it FREE for month 1 (I need case studies).

Want to be one of them? 15-min call this week?

- Kareem
Caesar's Legions
Caesar@cmonkeytribe.com`
  }
];

async function sendEmails() {
  console.log('🏛️ CAESAR\'S LEGIONS - AUTONOMOUS EMAIL OUTREACH\n');
  console.log('From:', process.env.CAESAR_EMAIL);
  console.log('SMTP:', process.env.SMTP_HOST, '\n');
  
  console.log('⚠️  NOTE: Need real email addresses from Reddit profiles');
  console.log('Current prospects have placeholder emails\n');
  
  for (const prospect of prospects) {
    if (prospect.email.includes('example.com')) {
      console.log(`⏭️  Skipping ${prospect.id} (placeholder email)`);
      continue;
    }
    
    try {
      const info = await transporter.sendMail({
        from: `"${process.env.FROM_NAME}" <${process.env.CAESAR_EMAIL}>`,
        to: prospect.email,
        subject: prospect.subject,
        text: prospect.body
      });
      
      console.log(`✅ Sent to: ${prospect.email}`);
      console.log(`   Message ID: ${info.messageId}\n`);
      
      // Log
      fs.appendFileSync(
        path.join(__dirname, '../data/emails-sent.jsonl'),
        JSON.stringify({
          timestamp: new Date().toISOString(),
          prospect_id: prospect.id,
          email: prospect.email,
          status: 'sent',
          messageId: info.messageId
        }) + '\n'
      );
      
      // Wait 2 seconds between emails
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Failed: ${prospect.email}`);
      console.error(`   Error: ${error.message}\n`);
    }
  }
  
  console.log('✓ Email outreach complete\n');
}

// Run
sendEmails().catch(console.error);
