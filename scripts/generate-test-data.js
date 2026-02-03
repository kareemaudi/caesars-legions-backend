#!/usr/bin/env node

/**
 * Generate Test Data for Caesar's Legions
 * Creates realistic test data so we can test follow-ups, webhooks, etc. before launch
 * 
 * Usage:
 *   node scripts/generate-test-data.js              # Generate default test data
 *   node scripts/generate-test-data.js --reset      # Reset database and regenerate
 *   node scripts/generate-test-data.js --scenario=<name>  # Load specific scenario
 * 
 * Scenarios:
 *   - default: Basic test with 1 client, 1 campaign, 20 leads
 *   - followups: Data ready for testing 3-day and 7-day follow-ups
 *   - realistic: Simulates 3 clients with various engagement levels
 */

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

// Test data templates
const TEST_CLIENTS = [
  {
    name: 'Test Client - SaaS Startup',
    email: 'test@caesarslegions.com',
    company: 'Demo Corp',
    industry: 'B2B SaaS',
    target_persona: 'B2B SaaS founders',
    value_proposition: 'AI-powered cold email that actually converts',
    case_studies: 'Helped 100+ SaaS companies book 50+ demos/month',
    status: 'active',
    monthly_quota: 1000
  },
  {
    name: 'Alpha Client - Agency',
    email: 'alpha@testclient.com',
    company: 'Growth Agency Inc',
    industry: 'Marketing Agency',
    target_persona: 'CMOs at B2B companies',
    value_proposition: 'Performance marketing that scales',
    case_studies: '3x ROI in first 90 days for typical clients',
    status: 'active',
    monthly_quota: 500
  },
  {
    name: 'Beta Client - Recruiting',
    email: 'beta@testclient.com',
    company: 'TalentMatch Pro',
    industry: 'Recruiting',
    target_persona: 'HR Directors',
    value_proposition: 'AI-sourced candidates in 48 hours',
    case_studies: 'Filled 200+ senior roles in 2023',
    status: 'active',
    monthly_quota: 300
  }
];

const TEST_LEADS = [
  { first_name: 'Alex', last_name: 'Rodriguez', email: 'alex@startup1.com', company: 'StartupOne', title: 'CEO', linkedin: 'https://linkedin.com/in/alexr' },
  { first_name: 'Sarah', last_name: 'Chen', email: 'sarah@techcorp.io', company: 'TechCorp', title: 'Head of Growth', linkedin: 'https://linkedin.com/in/sarahchen' },
  { first_name: 'Marcus', last_name: 'Williams', email: 'marcus@saasify.com', company: 'Saasify', title: 'Founder', linkedin: 'https://linkedin.com/in/marcusw' },
  { first_name: 'Emily', last_name: 'Taylor', email: 'emily@growthco.com', company: 'GrowthCo', title: 'VP Sales', linkedin: 'https://linkedin.com/in/emilyt' },
  { first_name: 'David', last_name: 'Park', email: 'david@innovate.io', company: 'Innovate Labs', title: 'CTO', linkedin: 'https://linkedin.com/in/davidpark' },
  { first_name: 'Jessica', last_name: 'Brown', email: 'jess@scaleit.com', company: 'ScaleIt', title: 'CMO', linkedin: 'https://linkedin.com/in/jessicab' },
  { first_name: 'Michael', last_name: 'Lee', email: 'mike@buildfaster.io', company: 'BuildFaster', title: 'CEO', linkedin: 'https://linkedin.com/in/mikelee' },
  { first_name: 'Amanda', last_name: 'Garcia', email: 'amanda@market.io', company: 'MarketPro', title: 'Founder', linkedin: 'https://linkedin.com/in/amandag' },
  { first_name: 'Ryan', last_name: 'Johnson', email: 'ryan@productify.com', company: 'Productify', title: 'Head of Product', linkedin: 'https://linkedin.com/in/ryanj' },
  { first_name: 'Lisa', last_name: 'Martinez', email: 'lisa@revenue.io', company: 'RevOps Inc', title: 'VP Revenue', linkedin: 'https://linkedin.com/in/lisam' },
  { first_name: 'Chris', last_name: 'Anderson', email: 'chris@pipeline.com', company: 'Pipeline Co', title: 'CEO', linkedin: 'https://linkedin.com/in/chrisa' },
  { first_name: 'Nicole', last_name: 'Thomas', email: 'nicole@outbound.io', company: 'Outbound Labs', title: 'Growth Lead', linkedin: 'https://linkedin.com/in/nicolet' },
  { first_name: 'Kevin', last_name: 'White', email: 'kevin@convert.io', company: 'ConvertKit Pro', title: 'Founder', linkedin: 'https://linkedin.com/in/kevinw' },
  { first_name: 'Rachel', last_name: 'Harris', email: 'rachel@sales.io', company: 'SalesTech', title: 'CRO', linkedin: 'https://linkedin.com/in/rachelh' },
  { first_name: 'Brandon', last_name: 'Clark', email: 'brandon@demohub.com', company: 'DemoHub', title: 'CEO', linkedin: 'https://linkedin.com/in/brandonc' },
  { first_name: 'Megan', last_name: 'Lewis', email: 'megan@lead.io', company: 'LeadGen Pro', title: 'VP Marketing', linkedin: 'https://linkedin.com/in/meganl' },
  { first_name: 'Tyler', last_name: 'Walker', email: 'tyler@growth.io', company: 'GrowthStack', title: 'Founder', linkedin: 'https://linkedin.com/in/tylerw' },
  { first_name: 'Ashley', last_name: 'Hall', email: 'ashley@scale.io', company: 'ScaleStack', title: 'COO', linkedin: 'https://linkedin.com/in/ashleyh' },
  { first_name: 'Jordan', last_name: 'Young', email: 'jordan@pipeline.io', company: 'PipelineLabs', title: 'Head of Sales', linkedin: 'https://linkedin.com/in/jordany' },
  { first_name: 'Taylor', last_name: 'King', email: 'taylor@outreach.io', company: 'Outreach Pro', title: 'CEO', linkedin: 'https://linkedin.com/in/taylork' }
];

/**
 * Generate default test scenario
 */
function generateDefault() {
  console.log('\n🏛️ Generating Default Test Data...\n');
  
  // Create 1 test client
  const client = db.insertClient(TEST_CLIENTS[0]);
  console.log(`✅ Created client: ${TEST_CLIENTS[0].name} (ID: ${client.lastInsertRowid})`);
  
  // Create 1 campaign
  const campaign = db.insertCampaign({
    client_id: client.lastInsertRowid,
    name: 'Q1 2026 Outreach - B2B SaaS',
    status: 'active',
    target_persona: 'B2B SaaS founders',
    total_leads: 20
  });
  console.log(`✅ Created campaign: Q1 2026 Outreach (ID: ${campaign.lastInsertRowid})`);
  
  // Add 20 test leads
  let addedLeads = 0;
  for (const lead of TEST_LEADS) {
    const result = db.insertLead({
      ...lead,
      campaign_id: campaign.lastInsertRowid,
      client_id: client.lastInsertRowid,
      status: 'new',
      enrichment_status: 'complete'
    });
    addedLeads++;
  }
  console.log(`✅ Added ${addedLeads} test leads`);
  
  console.log('\n✅ Default test data generated successfully!\n');
  console.log('Next steps:');
  console.log('  1. Test email generation: node test-email.js');
  console.log('  2. Test sending: node test-email-send.js');
  console.log('  3. Run dry-run follow-ups: node cron/process-follow-ups.js\n');
}

/**
 * Generate follow-up testing scenario
 * Creates data at different stages (Day 0, Day 3, Day 7) so we can test follow-up logic
 */
function generateFollowUpScenario() {
  console.log('\n🏛️ Generating Follow-up Test Scenario...\n');
  
  // Create test client
  const client = db.insertClient(TEST_CLIENTS[0]);
  console.log(`✅ Created client: ${TEST_CLIENTS[0].name}`);
  
  // Create campaign
  const campaign = db.insertCampaign({
    client_id: client.lastInsertRowid,
    name: 'Follow-up Test Campaign',
    status: 'active',
    target_persona: 'B2B SaaS founders',
    total_leads: 15
  });
  console.log(`✅ Created campaign: Follow-up Test Campaign`);
  
  const now = Math.floor(Date.now() / 1000);
  const day = 24 * 60 * 60; // seconds in a day
  
  // Group 1: Just sent (Day 0) - should NOT get follow-up
  console.log('\n📧 Group 1: Recent emails (Day 0)');
  for (let i = 0; i < 5; i++) {
    const lead = db.insertLead({
      ...TEST_LEADS[i],
      campaign_id: campaign.lastInsertRowid,
      client_id: client.lastInsertRowid,
      status: 'contacted'
    });
    
    db.insertEmailSent({
      lead_id: lead.lastInsertRowid,
      campaign_id: campaign.lastInsertRowid,
      client_id: client.lastInsertRowid,
      subject: `Initial email to ${TEST_LEADS[i].first_name}`,
      body: `Hey ${TEST_LEADS[i].first_name}, reaching out about...`,
      sent_at: now - (i * 3600), // Sent within last 5 hours
      personalization_data: JSON.stringify({ initial: true })
    });
  }
  console.log('   Added 5 leads - sent within last 5 hours');
  
  // Group 2: Sent 3 days ago - SHOULD get first follow-up
  console.log('\n📧 Group 2: Ready for first follow-up (Day 3)');
  for (let i = 5; i < 10; i++) {
    const lead = db.insertLead({
      ...TEST_LEADS[i],
      campaign_id: campaign.lastInsertRowid,
      client_id: client.lastInsertRowid,
      status: 'contacted'
    });
    
    db.insertEmailSent({
      lead_id: lead.lastInsertRowid,
      campaign_id: campaign.lastInsertRowid,
      client_id: client.lastInsertRowid,
      subject: `Initial email to ${TEST_LEADS[i].first_name}`,
      body: `Hey ${TEST_LEADS[i].first_name}, reaching out about...`,
      sent_at: now - (3 * day) - (i * 3600), // Sent 3 days ago
      personalization_data: JSON.stringify({ initial: true })
    });
  }
  console.log('   Added 5 leads - sent 3 days ago, ready for follow-up');
  
  // Group 3: Sent 7 days ago with 1 follow-up sent - SHOULD get second follow-up
  console.log('\n📧 Group 3: Ready for second follow-up (Day 7)');
  for (let i = 10; i < 15; i++) {
    const lead = db.insertLead({
      ...TEST_LEADS[i],
      campaign_id: campaign.lastInsertRowid,
      client_id: client.lastInsertRowid,
      status: 'contacted'
    });
    
    // Initial email (7 days ago)
    db.insertEmailSent({
      lead_id: lead.lastInsertRowid,
      campaign_id: campaign.lastInsertRowid,
      client_id: client.lastInsertRowid,
      subject: `Initial email to ${TEST_LEADS[i].first_name}`,
      body: `Hey ${TEST_LEADS[i].first_name}, reaching out about...`,
      sent_at: now - (7 * day),
      personalization_data: JSON.stringify({ initial: true })
    });
    
    // First follow-up (4 days ago = 3 days after initial)
    db.insertEmailSent({
      lead_id: lead.lastInsertRowid,
      campaign_id: campaign.lastInsertRowid,
      client_id: client.lastInsertRowid,
      subject: `Re: Initial email to ${TEST_LEADS[i].first_name}`,
      body: `${TEST_LEADS[i].first_name}, following up on my previous email...`,
      sent_at: now - (4 * day),
      personalization_data: JSON.stringify({ follow_up: true, days_since: 3 })
    });
  }
  console.log('   Added 5 leads - sent 7 days ago with 1 follow-up, ready for 2nd');
  
  console.log('\n✅ Follow-up test scenario generated!\n');
  console.log('Test with:');
  console.log('  node cron/process-follow-ups.js       # Dry run');
  console.log('  node cron/process-follow-ups.js --live # Actually send (careful!)\n');
  console.log('Expected results:');
  console.log('  - Group 1 (Day 0): 0 follow-ups (too recent)');
  console.log('  - Group 2 (Day 3): 5 follow-ups (first follow-up)');
  console.log('  - Group 3 (Day 7): 5 follow-ups (second follow-up)');
  console.log('  - Total: 10 follow-ups should be sent\n');
}

/**
 * Generate realistic multi-client scenario
 */
function generateRealisticScenario() {
  console.log('\n🏛️ Generating Realistic Multi-Client Scenario...\n');
  
  const now = Math.floor(Date.now() / 1000);
  const day = 24 * 60 * 60;
  
  // Create 3 clients
  const clients = TEST_CLIENTS.map(clientData => {
    const client = db.insertClient(clientData);
    console.log(`✅ Created client: ${clientData.name}`);
    return { ...clientData, id: client.lastInsertRowid };
  });
  
  // For each client, create campaigns with various states
  clients.forEach((client, idx) => {
    console.log(`\n📊 Setting up ${client.company}...`);
    
    // Active campaign
    const campaign = db.insertCampaign({
      client_id: client.id,
      name: `${client.company} - Q1 Campaign`,
      status: 'active',
      target_persona: client.target_persona,
      total_leads: 20
    });
    
    // Add leads with various engagement states
    const campaignLeads = TEST_LEADS.slice(idx * 6, (idx + 1) * 6 + 2);
    
    campaignLeads.forEach((lead, leadIdx) => {
      const dbLead = db.insertLead({
        ...lead,
        campaign_id: campaign.lastInsertRowid,
        client_id: client.id,
        status: 'contacted'
      });
      
      // Vary email timing
      let sentTime;
      if (leadIdx < 2) {
        sentTime = now - (8 * day); // Old enough for both follow-ups
      } else if (leadIdx < 4) {
        sentTime = now - (3 * day); // Ready for first follow-up
      } else {
        sentTime = now - (day / 2); // Too recent
      }
      
      db.insertEmailSent({
        lead_id: dbLead.lastInsertRowid,
        campaign_id: campaign.lastInsertRowid,
        client_id: client.id,
        subject: `Introducing ${client.company}`,
        body: `Hi ${lead.first_name}, ${client.value_proposition}...`,
        sent_at: sentTime,
        personalization_data: JSON.stringify({ 
          initial: true,
          template: 'intro_v1'
        })
      });
      
      // Simulate some replies
      if (leadIdx === 0) {
        db.insertReply({
          lead_id: dbLead.lastInsertRowid,
          campaign_id: campaign.lastInsertRowid,
          client_id: client.id,
          reply_text: 'Interesting, tell me more!',
          sentiment: 'positive',
          received_at: sentTime + (day * 2)
        });
      }
    });
    
    console.log(`   Added ${campaignLeads.length} leads with mixed engagement`);
  });
  
  console.log('\n✅ Realistic scenario generated!\n');
  console.log('This includes:');
  console.log('  - 3 active clients');
  console.log('  - 3 active campaigns');
  console.log('  - ~24 leads at various stages');
  console.log('  - Mix of fresh sends, follow-up ready, and engaged leads\n');
}

/**
 * Reset database (delete existing data)
 */
function resetDatabase() {
  const dbFile = path.join(__dirname, '..', 'data', 'legions.json');
  
  if (fs.existsSync(dbFile)) {
    fs.unlinkSync(dbFile);
    console.log('🗑️  Deleted existing database\n');
  } else {
    console.log('ℹ️  No existing database found\n');
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.includes('--reset')) {
  resetDatabase();
}

const scenario = args.find(arg => arg.startsWith('--scenario='))?.split('=')[1] || 'default';

console.log('🏛️ Caesar\'s Legions - Test Data Generator\n');

switch (scenario) {
  case 'followups':
    generateFollowUpScenario();
    break;
  case 'realistic':
    generateRealisticScenario();
    break;
  case 'default':
  default:
    generateDefault();
    break;
}

console.log('🏛️ Veni. Vidi. Vici.\n');
