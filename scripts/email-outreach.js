#!/usr/bin/env node
/**
 * CAESAR'S LEGIONS - EMAIL OUTREACH SYSTEM
 * 
 * Autonomous email outreach to warm prospects
 * Uses Gmail SMTP or configured email provider
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  FROM_EMAIL: process.env.CAESAR_EMAIL || 'caesar@your-domain.com',
  FROM_NAME: 'Kareem - Caesar\'s Legions',
  PROSPECTS_FILE: path.join(__dirname, '../data/prospects-warm.json'),
  SENT_LOG: path.join(__dirname, '../data/emails-sent.jsonl')
};

// Email templates
const TEMPLATES = {
  b2b_saas_struggling: (prospect) => ({
    subject: `Re: ${prospect.pain_points[0]}`,
    body: `Hey ${prospect.name || 'there'},

Saw your post about ${prospect.pain_points[0].toLowerCase()}.

I'm building Caesar's Legions - AI-powered cold email specifically for B2B SaaS founders in your exact situation.

Early access is free for first 5 clients (I need case studies).

Want a 15-min call this week to see if it's a fit?

- Kareem
Caesar's Legions
https://caesarslegions.ai`
  }),
  
  generic_outbound: (prospect) => ({
    subject: 'AI-powered cold email that actually works',
    body: `Hey ${prospect.name || 'there'},

Quick question: how are you currently handling outbound sales?

I'm building Caesar's Legions - AI that learns from every campaign and gets smarter over time.

First 5 clients get Month 1 FREE (I need case studies).

Interested in a quick call?

- Kareem
caesar@caesarslegions.ai`
  })
};

// Create email transporter
function createTransporter() {
  // TODO: Configure with actual SMTP credentials
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
}

// Log sent email
function logSent(prospect, template, status) {
  const entry = {
    timestamp: new Date().toISOString(),
    prospect_id: prospect.id,
    email: prospect.email,
    template,
    status
  };
  
  fs.appendFileSync(CONFIG.SENT_LOG, JSON.stringify(entry) + '\n');
  console.log(`✓ Logged: ${prospect.email} - ${status}`);
}

// Send email to prospect
async function sendEmail(transporter, prospect, template) {
  const email = TEMPLATES[template](prospect);
  
  try {
    await transporter.sendMail({
      from: `"${CONFIG.FROM_NAME}" <${CONFIG.FROM_EMAIL}>`,
      to: prospect.email,
      subject: email.subject,
      text: email.body
    });
    
    console.log(`✓ Sent to: ${prospect.email}`);
    logSent(prospect, template, 'sent');
    return true;
    
  } catch (error) {
    console.error(`✗ Failed: ${prospect.email} - ${error.message}`);
    logSent(prospect, template, 'failed');
    return false;
  }
}

// Main execution
async function main() {
  console.log('📧 CAESAR\'S LEGIONS - EMAIL OUTREACH\n');
  
  // Check for email credentials
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log('⚠️  Email not configured yet.\n');
    console.log('To enable autonomous email outreach:');
    console.log('  1. Set up Gmail App Password');
    console.log('  2. Add to .env:');
    console.log('     GMAIL_USER=caesar@your-domain.com');
    console.log('     GMAIL_APP_PASSWORD=your_app_password\n');
    console.log('Or provide Caesar email credentials.\n');
    return;
  }
  
  // Load prospects
  const data = JSON.parse(fs.readFileSync(CONFIG.PROSPECTS_FILE, 'utf8'));
  const prospects = data.prospects.filter(p => p.email && p.status === 'identified');
  
  console.log(`Found ${prospects.length} prospects ready for outreach\n`);
  
  // Create transporter
  const transporter = createTransporter();
  
  // Send emails
  for (const prospect of prospects) {
    const template = prospect.template || 'b2b_saas_struggling';
    await sendEmail(transporter, prospect, template);
    
    // Wait 2 seconds between emails (avoid rate limiting)
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n✓ Email outreach complete\n');
}

// Run
if (require.main === module) {
  main();
}

module.exports = { sendEmail, TEMPLATES };
