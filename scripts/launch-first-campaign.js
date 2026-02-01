#!/usr/bin/env node
/**
 * Caesar's Legions - First Campaign Launch
 * Find B2B SaaS founders via Apollo + send personalized emails
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const { generateEmail } = require('../lib/email-generator');
const { sendEmail } = require('../lib/email-sender');

// Caesar's Legions client profile
const CLIENT = {
  company: "Caesar's Legions",
  value_prop: 'AI-powered cold email that gets 4-5% reply rates. Pay per meeting booked ($50 each), not per email sent.',
  target_audience: 'B2B SaaS founders struggling with cold email',
  name: 'Kareem',
  email: process.env.CAESAR_EMAIL
};

/**
 * Find B2B SaaS founders using Apollo API
 */
async function findProspects(limit = 10) {
  console.log('🔍 Finding B2B SaaS founders via Apollo...\n');
  
  try {
    const response = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        page: 1,
        per_page: limit,
        person_titles: ['Founder', 'CEO', 'Co-Founder', 'CTO'],
        person_seniorities: ['founder', 'c_suite'],
        organization_num_employees_ranges: ['11-50', '51-200', '201-500'],
        q_keywords: 'B2B SaaS software',
        contact_email_status: ['verified']
      },
      {
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.APOLLO_API_KEY
        }
      }
    );
    
    const people = response.data.people || [];
    
    console.log(`✅ Found ${people.length} prospects\n`);
    
    return people.map(person => ({
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      company: person.organization?.name || 'their company',
      title: person.title,
      linkedin: person.linkedin_url,
      company_size: person.organization?.estimated_num_employees
    }));
  } catch (error) {
    console.error('❌ Apollo API error:', error.response?.data || error.message);
    return [];
  }
}

/**
 * Send personalized email to a prospect
 */
async function sendToProspect(lead) {
  console.log(`\n📧 Processing: ${lead.first_name} ${lead.last_name} (${lead.title} at ${lead.company})`);
  
  if (!lead.email) {
    console.log('   ⚠️  No email - skipping');
    return { success: false, reason: 'no_email' };
  }
  
  try {
    // Generate personalized email
    console.log('   🤖 Generating personalized email...');
    const emailContent = await generateEmail({ lead, client: CLIENT });
    
    console.log(`   ✉️  Subject: ${emailContent.subject}`);
    
    // Send email
    const result = await sendEmail({
      to: lead.email,
      subject: emailContent.subject,
      body: emailContent.body,
      fromEmail: CLIENT.email,
      fromName: process.env.FROM_NAME
    });
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    console.log(`   ✅ Sent! Message ID: ${result.messageId}`);
    
    // Log to file
    const logEntry = {
      timestamp: new Date().toISOString(),
      lead_name: `${lead.first_name} ${lead.last_name}`,
      lead_email: lead.email,
      company: lead.company,
      title: lead.title,
      subject: emailContent.subject,
      body: emailContent.body,
      message_id: result.messageId,
      personalization: emailContent.personalization_data,
      status: 'sent'
    };
    
    fs.appendFileSync(
      './data/campaign-log.jsonl',
      JSON.stringify(logEntry) + '\n'
    );
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`   ❌ Failed:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main campaign execution
 */
async function runCampaign() {
  console.log('🏛️  CAESAR\'S LEGIONS - FIRST CAMPAIGN\n');
  console.log('=' .repeat(50));
  console.log('\n📋 Campaign Config:');
  console.log(`   Target: B2B SaaS Founders (11-500 employees)`);
  console.log(`   Volume: 10 emails`);
  console.log(`   From: ${CLIENT.email}`);
  console.log(`   Value Prop: ${CLIENT.value_prop}\n`);
  console.log('=' .repeat(50));
  
  console.log('\n✅ Starting campaign...\n');
  
  // Find prospects
  const prospects = await findProspects(10);
  
  if (prospects.length === 0) {
    console.log('\n❌ No prospects found. Exiting.');
    process.exit(1);
  }
  
  console.log('\n📨 Starting email campaign...\n');
  
  const results = {
    sent: 0,
    failed: 0,
    skipped: 0
  };
  
  for (let i = 0; i < prospects.length; i++) {
    const lead = prospects[i];
    
    const result = await sendToProspect(lead);
    
    if (result.success) {
      results.sent++;
    } else if (result.reason === 'no_email') {
      results.skipped++;
    } else {
      results.failed++;
    }
    
    // Rate limit: 30 seconds between emails (natural pace)
    if (i < prospects.length - 1) {
      console.log('   ⏳ Waiting 30s before next email...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\n🎉 CAMPAIGN COMPLETE!\n');
  console.log('Results:');
  console.log(`   ✅ Sent: ${results.sent}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log(`   ⚠️  Skipped: ${results.skipped}`);
  console.log(`\n📊 Expected replies: ${Math.round(results.sent * 0.045)} (4.5% reply rate)`);
  console.log(`💰 Potential revenue: $${results.sent * 0.045 * 50} (if all convert)\n`);
  console.log('Check campaign-log.jsonl for full details.\n');
}

runCampaign().catch(console.error);
