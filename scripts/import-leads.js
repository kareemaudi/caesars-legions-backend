/**
 * Import leads from research files into outreach tracker
 */

const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '../../research');
const DATA_DIR = path.join(__dirname, '../data/outreach');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Priority leads from ready-to-send-dms-batch-2.md
const priorityLeads = [
  {
    handle: 'THArrowOfApollo',
    name: 'Taylor Haren',
    priority: 'urgent',
    expected_response_rate: '60-80%',
    notes: 'Burned $10.5K on cold email infrastructure, sending 300K emails/month',
    status: 'ready_to_send',
    template: 'dm_batch_2_taylor',
    revenue_potential: 500
  },
  {
    handle: 'marc_louvion',
    name: 'Marc Lou',
    priority: 'very_high',
    expected_response_rate: '40-60%',
    notes: '$80K revenue using cold email, teaching others',
    status: 'ready_to_send',
    template: 'dm_batch_2_marc',
    revenue_potential: 250
  },
  {
    handle: 'agazdecki',
    name: 'Andrew Gazdecki',
    priority: 'very_high',
    expected_response_rate: '30-50%',
    notes: 'MicroAcquire founder, well-connected, high-profile',
    status: 'ready_to_send',
    template: 'dm_batch_2_andrew',
    revenue_potential: 500
  },
  {
    handle: 'henrythe9ths',
    name: 'Henry Shi',
    priority: 'high',
    expected_response_rate: '40-60%',
    notes: 'B2B SaaS thought leader, AI-enabled services advocate',
    status: 'ready_to_send',
    template: 'dm_batch_2_henry',
    revenue_potential: 250
  },
  {
    handle: 'iamgdsa',
    name: 'Guillaume',
    priority: 'high',
    expected_response_rate: '50-70%',
    notes: 'Teaching $10K MRR SaaS method, active builder',
    status: 'ready_to_send',
    template: 'dm_batch_2_guillaume',
    revenue_potential: 250
  }
];

// Immediate outreach targets (from outreach-targets-immediate.md)
const immediateTargets = [
  {
    handle: 'SuryanshMishraE',
    name: 'Suryansh Mishra',
    priority: 'high',
    expected_response_rate: '40-60%',
    notes: 'Day 5, $18 MRR → $100K goal, early stage',
    status: 'ready_to_send',
    template: 'immediate_outreach',
    revenue_potential: 250
  },
  {
    handle: 'imNihalN',
    name: 'Nihal',
    priority: 'high',
    expected_response_rate: '40-60%',
    notes: 'Day 4, analytics SaaS, $10K goal',
    status: 'ready_to_send',
    template: 'immediate_outreach',
    revenue_potential: 250
  },
  {
    handle: 'PratushBose',
    name: 'Pratush Bose',
    priority: 'medium',
    expected_response_rate: '30-50%',
    notes: 'Day 1, Healthcare CRM',
    status: 'ready_to_send',
    template: 'immediate_outreach',
    revenue_potential: 250
  }
];

// Load existing leads or start fresh
let leads = [];
if (fs.existsSync(LEADS_FILE)) {
  leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
}

// Merge new leads (avoid duplicates)
const allNewLeads = [...priorityLeads, ...immediateTargets];

allNewLeads.forEach(newLead => {
  const exists = leads.find(l => l.handle === newLead.handle);
  if (!exists) {
    leads.push({
      ...newLead,
      created_at: new Date().toISOString()
    });
    console.log(`✅ Added: @${newLead.handle}`);
  } else {
    console.log(`⏭️  Skipped (exists): @${newLead.handle}`);
  }
});

// Save
fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));

console.log(`\n📊 Total leads in database: ${leads.length}`);
console.log(`🎯 Ready to send: ${leads.filter(l => l.status === 'ready_to_send').length}`);
console.log('\n✅ Import complete!\n');
console.log('Next steps:');
console.log('1. node caesars-legions-backend/lib/outreach-tracker.js dashboard');
console.log('2. Send DMs to priority leads');
console.log('3. Log sent DMs with tracker.logDM()\n');
