#!/usr/bin/env node
/**
 * Send Campaign Batch
 * Sends first email in sequence to specified prospects
 */

require('dotenv').config();
const EmailSender = require('../lib/email-sender');
const fs = require('fs').promises;
const path = require('path');

// SMTP Config — loaded from .env only. NEVER hardcode credentials.
// Required env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CAESAR_EMAIL, FROM_NAME
if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.error('❌ SMTP credentials not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
  process.exit(1);
}

async function sendBatch(campaignFile) {
  console.log('🏛️  CAESAR\'S LEGIONS — Campaign Sender\n');
  
  // Load campaign
  const campaignPath = path.resolve(campaignFile);
  console.log(`Loading: ${campaignPath}`);
  
  const campaignData = JSON.parse(await fs.readFile(campaignPath, 'utf8'));
  console.log(`Campaigns loaded: ${campaignData.campaigns.length}\n`);
  
  const sender = new EmailSender();
  
  // Verify SMTP
  console.log('Verifying SMTP...');
  const verify = await sender.verify();
  if (!verify.success) {
    console.error('❌ SMTP verification failed:', verify.error);
    process.exit(1);
  }
  console.log('✅ SMTP verified\n');
  
  // Send first email in each campaign
  const results = [];
  
  for (const campaign of campaignData.campaigns) {
    const prospect = campaign.prospect;
    const firstEmail = campaign.sequence[0];
    
    console.log(`Sending to: ${prospect.name} <${prospect.email}>`);
    console.log(`Subject: ${firstEmail.subject}`);
    
    const result = await sender.send({
      to: prospect.email,
      subject: firstEmail.subject,
      body: firstEmail.body,
      campaignId: `campaign_${Date.now()}`,
      templateId: 'saas-founder'
    });
    
    results.push({
      prospect: prospect.name,
      email: prospect.email,
      ...result
    });
    
    if (result.success) {
      console.log(`✅ Sent! MessageID: ${result.messageId}\n`);
    } else {
      console.log(`❌ Failed: ${result.error}\n`);
    }
    
    // Rate limit: 30 seconds between emails
    if (campaignData.campaigns.indexOf(campaign) < campaignData.campaigns.length - 1) {
      console.log('Waiting 30s before next email...\n');
      await new Promise(r => setTimeout(r, 30000));
    }
  }
  
  // Summary
  console.log('=== SEND SUMMARY ===');
  console.log(`Total: ${results.length}`);
  console.log(`Sent: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);
  
  // Save results
  const resultPath = campaignPath.replace('.json', '-results.json');
  await fs.writeFile(resultPath, JSON.stringify({
    sent_at: new Date().toISOString(),
    results
  }, null, 2));
  console.log(`\nResults saved: ${resultPath}`);
  
  return results;
}

// Run
const campaignFile = process.argv[2] || 'C:\\Users\\Asus\\clawd-caesar\\outreach\\campaign-2026-02-04.json';
sendBatch(campaignFile).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
