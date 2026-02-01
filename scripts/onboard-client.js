#!/usr/bin/env node

/**
 * Caesar's Legions - Client Onboarding Automation
 * 
 * Automates the entire client onboarding process:
 * 1. Create client record in database
 * 2. Set up campaign configuration
 * 3. Generate initial email batch
 * 4. Schedule follow-ups
 * 5. Send welcome email to client
 * 
 * Usage: node scripts/onboard-client.js --interactive
 *        node scripts/onboard-client.js --data client-data.json
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ============================================================================
// CONFIGURATION
// ============================================================================

const DATA_DIR = path.join(__dirname, '..', 'data');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');
const MEMORY_DIR = path.join(__dirname, '..', '..', 'memory');

// Ensure directories exist
[DATA_DIR, MEMORY_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function loadJSON(filepath) {
  if (!fs.existsSync(filepath)) {
    return [];
  }
  const content = fs.readFileSync(filepath, 'utf-8');
  return content.trim() ? JSON.parse(content) : [];
}

function saveJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function generateId(prefix = 'cli') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function logToMemory(event, data) {
  const logFile = path.join(MEMORY_DIR, `onboarding-${new Date().toISOString().split('T')[0]}.jsonl`);
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    ...data
  };
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// ============================================================================
// ONBOARDING STEPS
// ============================================================================

async function collectClientInfo() {
  console.log('\n🏛️  Caesar\'s Legions - Client Onboarding\n');
  console.log('Let\'s gather some information about your new client.\n');

  const clientData = {
    id: generateId('cli'),
    createdAt: new Date().toISOString(),
    status: 'active'
  };

  // Basic info
  clientData.companyName = await prompt('Company name: ');
  clientData.contactName = await prompt('Primary contact name: ');
  clientData.contactEmail = await prompt('Contact email: ');
  clientData.industry = await prompt('Industry (e.g., B2B SaaS, Fintech): ');
  clientData.website = await prompt('Website URL: ');
  
  // Business context
  clientData.arr = await prompt('Approximate ARR (or "early-stage"): ');
  clientData.targetMarket = await prompt('Target market (who do they sell to?): ');
  
  // Campaign setup
  console.log('\n--- Campaign Configuration ---');
  clientData.campaignGoal = await prompt('Campaign goal (e.g., book demos, trial signups): ');
  clientData.monthlyEmailTarget = parseInt(await prompt('Target emails per month (e.g., 1000): ') || '1000');
  clientData.dailyEmailLimit = Math.ceil(clientData.monthlyEmailTarget / 20); // 20 business days
  
  // Pricing
  console.log('\n--- Pricing ---');
  const pricingModel = await prompt('Pricing model (1=flat, 2=per-meeting, 3=hybrid) [1]: ') || '1';
  
  if (pricingModel === '1') {
    clientData.pricing = {
      model: 'flat',
      monthlyFee: parseInt(await prompt('Monthly fee ($): '))
    };
  } else if (pricingModel === '2') {
    clientData.pricing = {
      model: 'per-meeting',
      perMeeting: parseInt(await prompt('Price per qualified meeting ($): ')),
      minimumMonthly: parseInt(await prompt('Minimum monthly fee ($) [0]: ') || '0')
    };
  } else {
    clientData.pricing = {
      model: 'hybrid',
      monthlyFee: parseInt(await prompt('Base monthly fee ($): ')),
      perMeeting: parseInt(await prompt('Bonus per meeting ($): '))
    };
  }

  return clientData;
}

function createClient(clientData) {
  const clients = loadJSON(CLIENTS_FILE);
  clients.push(clientData);
  saveJSON(CLIENTS_FILE, clients);
  
  console.log(`\n✅ Client created: ${clientData.companyName} (ID: ${clientData.id})`);
  logToMemory('client_created', { clientId: clientData.id, companyName: clientData.companyName });
  
  return clientData;
}

function createInitialCampaign(clientData) {
  const campaigns = loadJSON(CAMPAIGNS_FILE);
  
  const campaign = {
    id: generateId('cmp'),
    clientId: clientData.id,
    name: `${clientData.companyName} - Initial Outreach`,
    status: 'setup', // setup -> active -> paused -> completed
    createdAt: new Date().toISOString(),
    config: {
      dailyLimit: clientData.dailyEmailLimit,
      followUpDays: [3, 5], // Follow up after 3 days, then 5 days
      targetMarket: clientData.targetMarket,
      goal: clientData.campaignGoal
    },
    stats: {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      meetings: 0
    },
    leads: [],
    emailBatches: []
  };
  
  campaigns.push(campaign);
  saveJSON(CAMPAIGNS_FILE, campaigns);
  
  console.log(`✅ Campaign created: ${campaign.name} (ID: ${campaign.id})`);
  logToMemory('campaign_created', { campaignId: campaign.id, clientId: clientData.id });
  
  return campaign;
}

function generateWelcomeEmail(clientData) {
  const subject = `Welcome to Caesar's Legions, ${clientData.contactName}! 🏛️`;
  
  const body = `Hi ${clientData.contactName},

Welcome to Caesar's Legions! We're excited to help ${clientData.companyName} reach ${clientData.targetMarket} through high-quality cold email outreach.

Here's what happens next:

✅ Campaign Setup (24-48 hours)
   - We'll research your ideal customer profile
   - Set up email infrastructure (domains, warmup)
   - Create personalized email templates

📊 First Batch (Week 1)
   - ${clientData.dailyEmailLimit} emails per day
   - Goal: ${clientData.campaignGoal}
   - A/B testing subject lines and CTAs

📈 Optimization (Ongoing)
   - Weekly performance reports
   - Continuous template refinement
   - Reply rate improvement (target: 4-5%)

You'll receive:
- Daily stats dashboard (link coming soon)
- Weekly performance reports
- Real-time notifications for replies

Questions? Just reply to this email.

Let's conquer your market together! 🎯

Kareem
Caesar's Legions
${clientData.website ? `\nP.S. We'll start by analyzing ${clientData.website} to craft compelling outreach.` : ''}`;

  return { subject, body };
}

async function sendWelcomeEmail(clientData) {
  const { subject, body } = generateWelcomeEmail(clientData);
  
  // Save to file for now (will integrate with actual email sending later)
  const emailFile = path.join(DATA_DIR, `welcome-email-${clientData.id}.txt`);
  fs.writeFileSync(emailFile, `To: ${clientData.contactEmail}\nSubject: ${subject}\n\n${body}`);
  
  console.log(`\n📧 Welcome email saved to: ${emailFile}`);
  console.log(`\nManual action: Send this welcome email to ${clientData.contactEmail}`);
  
  logToMemory('welcome_email_generated', { clientId: clientData.id, email: clientData.contactEmail });
}

function generateOnboardingChecklist(clientData, campaign) {
  const checklist = `
🎯 ONBOARDING CHECKLIST - ${clientData.companyName}

Client ID: ${clientData.id}
Campaign ID: ${campaign.id}
Created: ${new Date().toLocaleDateString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SETUP (Days 1-2)
□ Analyze client website (${clientData.website || 'N/A'})
□ Research ICP: ${clientData.targetMarket}
□ Set up dedicated domains (need ${Math.ceil(clientData.dailyEmailLimit / 30)} domains)
□ Configure email warmup (2-3 weeks)
□ Build lead list (target: ${clientData.monthlyEmailTarget} contacts)

CONTENT (Days 2-3)
□ Draft initial email template (focus: ${clientData.campaignGoal})
□ Create 2 subject line variants for A/B test
□ Write 2 follow-up templates (Day 3, Day 5)
□ Get client approval on templates

LAUNCH (Day 3-4)
□ Import leads to campaign
□ Schedule first batch (${clientData.dailyEmailLimit}/day)
□ Set up reply monitoring
□ Configure meeting booking system
□ Send welcome email to client

OPTIMIZATION (Week 2+)
□ Analyze first 100 sends (open rate target: 40-50%)
□ Optimize based on reply data (target: 4-5% reply rate)
□ Weekly report to client
□ Scale up if performance is good

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRICING MODEL: ${clientData.pricing.model}
${clientData.pricing.monthlyFee ? `Monthly Fee: $${clientData.pricing.monthlyFee}` : ''}
${clientData.pricing.perMeeting ? `Per Meeting: $${clientData.pricing.perMeeting}` : ''}

DAILY EMAIL BUDGET: ${clientData.dailyEmailLimit} emails/day
MONTHLY TARGET: ${clientData.monthlyEmailTarget} emails/month

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEXT STEPS:
1. Send welcome email (saved in data/ folder)
2. Start lead research for ${clientData.targetMarket}
3. Set up email infrastructure
4. Draft initial templates
5. Schedule kickoff call (if needed)

Questions? Check: caesars-legions-backend/docs/
`;

  const checklistFile = path.join(DATA_DIR, `checklist-${clientData.id}.txt`);
  fs.writeFileSync(checklistFile, checklist);
  
  console.log(checklist);
  console.log(`\n📋 Checklist saved to: ${checklistFile}`);
  
  logToMemory('checklist_generated', { clientId: clientData.id });
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  try {
    const args = process.argv.slice(2);
    
    let clientData;
    
    if (args.includes('--data')) {
      // Load from JSON file
      const dataFile = args[args.indexOf('--data') + 1];
      clientData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
      clientData.id = generateId('cli');
      clientData.createdAt = new Date().toISOString();
    } else {
      // Interactive mode
      clientData = await collectClientInfo();
    }
    
    // Confirm before creating
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('CLIENT SUMMARY:');
    console.log(`Company: ${clientData.companyName}`);
    console.log(`Contact: ${clientData.contactName} (${clientData.contactEmail})`);
    console.log(`Target: ${clientData.targetMarket}`);
    console.log(`Goal: ${clientData.campaignGoal}`);
    console.log(`Emails/day: ${clientData.dailyEmailLimit}`);
    console.log(`Pricing: ${clientData.pricing.model}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const confirm = await prompt('Create this client? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('❌ Cancelled.');
      return;
    }
    
    // Execute onboarding
    console.log('\n🚀 Starting onboarding...\n');
    
    const client = createClient(clientData);
    const campaign = createInitialCampaign(client);
    await sendWelcomeEmail(client);
    generateOnboardingChecklist(client, campaign);
    
    console.log('\n✅ ONBOARDING COMPLETE!\n');
    console.log(`Next: Follow the checklist in data/checklist-${client.id}.txt`);
    
    logToMemory('onboarding_complete', { clientId: client.id, campaignId: campaign.id });
    
  } catch (error) {
    console.error('❌ Error during onboarding:', error.message);
    logToMemory('onboarding_error', { error: error.message });
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  collectClientInfo,
  createClient,
  createInitialCampaign,
  generateWelcomeEmail,
  generateOnboardingChecklist
};
