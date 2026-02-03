#!/usr/bin/env node

/**
 * Client Onboarding Script
 * 
 * Automates Caesar's Legions client onboarding flow:
 * 1. Create client record
 * 2. Generate dashboard URL
 * 3. Send welcome email
 * 4. Create first campaign (draft)
 * 
 * Usage:
 *   node scripts/onboard-client.js --name="Acme Inc" --email="john@acme.com"
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Parse command line args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace('--', '')] = value?.replace(/['"]/g, '') || true;
  return acc;
}, {});

// Validate required params
if (!args.name || !args.email) {
  console.error('❌ Error: Missing required parameters');
  console.log('\nUsage:');
  console.log('  node scripts/onboard-client.js --name="Company Name" --email="email@company.com"');
  console.log('\nOptional:');
  console.log('  --company="Company Name" (defaults to name)');
  console.log('  --phone="+1234567890"');
  process.exit(1);
}

const client = {
  id: uuidv4(),
  name: args.name,
  email: args.email,
  company: args.company || args.name,
  phone: args.phone || null,
  onboarded_at: new Date().toISOString(),
  status: 'active',
  dashboard_url: null // Will be set after creating
};

// Dashboard URL (would be actual domain in production)
const dashboardUrl = `http://localhost:3000/dashboard.html?client=${client.id}`;
client.dashboard_url = dashboardUrl;

console.log('🏛️ Caesar\'s Legions - Client Onboarding\n');
console.log('Creating client record...');
console.log(`  ID: ${client.id}`);
console.log(`  Name: ${client.name}`);
console.log(`  Email: ${client.email}`);
console.log(`  Company: ${client.company}`);
console.log(`  Dashboard: ${dashboardUrl}`);

// Save client record
const clientsDir = path.join(__dirname, '..', 'data', 'clients');
if (!fs.existsSync(clientsDir)) {
  fs.mkdirSync(clientsDir, { recursive: true });
}

const clientFile = path.join(clientsDir, `${client.id}.json`);
fs.writeFileSync(clientFile, JSON.stringify(client, null, 2));
console.log(`\n✅ Client record saved: ${clientFile}`);

// Create welcome email
const welcomeTemplate = fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'email-welcome.txt'),
  'utf8'
);

const welcomeEmail = welcomeTemplate
  .replace('{{client_name}}', client.name.split(' ')[0]) // First name
  .replace('{{dashboard_url}}', dashboardUrl);

const emailsDir = path.join(__dirname, '..', 'data', 'emails');
if (!fs.existsSync(emailsDir)) {
  fs.mkdirSync(emailsDir, { recursive: true });
}

const emailFile = path.join(emailsDir, `welcome-${client.id}.txt`);
fs.writeFileSync(emailFile, welcomeEmail);
console.log(`\n📧 Welcome email generated: ${emailFile}`);

// Create initial campaign (draft)
const campaign = {
  id: uuidv4(),
  client_id: client.id,
  name: `${client.company} - Launch Campaign`,
  status: 'draft',
  created_at: new Date().toISOString(),
  leads: [],
  settings: {
    daily_limit: 30,
    followups: 3,
    followup_delays: [3, 5, 7], // Days
    timezone: 'America/New_York',
    send_hours: { start: 9, end: 17 }
  }
};

const campaignsDir = path.join(__dirname, '..', 'data', 'campaigns');
if (!fs.existsSync(campaignsDir)) {
  fs.mkdirSync(campaignsDir, { recursive: true });
}

const campaignFile = path.join(campaignsDir, `${campaign.id}.json`);
fs.writeFileSync(campaignFile, JSON.stringify(campaign, null, 2));
console.log(`\n📊 Campaign created (draft): ${campaignFile}`);

// Create client-specific folder for assets
const clientAssetsDir = path.join(__dirname, '..', 'data', 'clients', client.id);
if (!fs.existsSync(clientAssetsDir)) {
  fs.mkdirSync(clientAssetsDir, { recursive: true });
}

// Copy intake form template for this client
const intakeTemplate = fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'client-intake-form.md'),
  'utf8'
);

const intakeFile = path.join(clientAssetsDir, 'intake-form.md');
fs.writeFileSync(intakeFile, intakeTemplate);

console.log(`\n📋 Client folder created: ${clientAssetsDir}`);
console.log(`   - intake-form.md (ready to fill out)`);

// Print next steps
console.log('\n' + '━'.repeat(60));
console.log('✅ ONBOARDING INITIATED\n');
console.log('Next steps:');
console.log('  1. Send welcome email (saved in data/emails/)');
console.log('  2. Fill out intake form with client');
console.log(`     File: ${intakeFile}`);
console.log('  3. Schedule kickoff call (10 min)');
console.log('  4. Build lead list based on ICP');
console.log('  5. Generate email copy variants');
console.log('  6. Launch campaign');
console.log('\n📊 Dashboard access:');
console.log(`     ${dashboardUrl}`);
console.log('━'.repeat(60));

// Summary JSON for automation
const summary = {
  success: true,
  client_id: client.id,
  client_name: client.name,
  client_email: client.email,
  dashboard_url: dashboardUrl,
  campaign_id: campaign.id,
  files: {
    client_record: clientFile,
    welcome_email: emailFile,
    campaign: campaignFile,
    intake_form: intakeFile
  },
  next_steps: [
    'Send welcome email',
    'Fill out intake form',
    'Schedule kickoff call',
    'Build lead list',
    'Generate copy',
    'Launch campaign'
  ]
};

const summaryFile = path.join(clientAssetsDir, 'onboarding-summary.json');
fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

console.log(`\n💾 Onboarding summary: ${summaryFile}\n`);

process.exit(0);
