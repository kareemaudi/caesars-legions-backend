#!/usr/bin/env node

/**
 * Prospect Tracking System
 * Manage manual outreach pipeline for Caesar's Legions
 * 
 * Usage:
 *   node scripts/track-prospects.js add --name "Sarah J" --twitter "@sarahj" --score 85
 *   node scripts/track-prospects.js list --filter hot
 *   node scripts/track-prospects.js update --id 1 --status contacted
 *   node scripts/track-prospects.js stats
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/prospects.jsonl');
const STATUSES = ['new', 'contacted', 'replied', 'demo_booked', 'proposal_sent', 'won', 'lost'];
const PRIORITIES = ['hot', 'warm', 'cold'];

// Ensure data directory exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Parse CLI args
const args = process.argv.slice(2);
const command = args[0];

function loadProspects() {
  if (!fs.existsSync(DATA_FILE)) return [];
  
  const lines = fs.readFileSync(DATA_FILE, 'utf-8').trim().split('\n').filter(l => l);
  return lines.map(line => JSON.parse(line));
}

function saveProspect(prospect) {
  prospect.id = prospect.id || Date.now();
  prospect.created_at = prospect.created_at || new Date().toISOString();
  prospect.updated_at = new Date().toISOString();
  
  fs.appendFileSync(DATA_FILE, JSON.stringify(prospect) + '\n');
  return prospect;
}

function updateProspect(id, updates) {
  const prospects = loadProspects();
  const index = prospects.findIndex(p => p.id === parseInt(id));
  
  if (index === -1) {
    throw new Error(`Prospect ${id} not found`);
  }
  
  prospects[index] = { ...prospects[index], ...updates, updated_at: new Date().toISOString() };
  
  // Rewrite file
  fs.writeFileSync(DATA_FILE, prospects.map(p => JSON.stringify(p)).join('\n') + '\n');
  
  return prospects[index];
}

function getArg(flag) {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

function addProspect() {
  const prospect = {
    name: getArg('--name') || 'Unknown',
    title: getArg('--title'),
    company: getArg('--company'),
    twitter: getArg('--twitter'),
    linkedin: getArg('--linkedin'),
    email: getArg('--email'),
    score: parseInt(getArg('--score')) || 0,
    priority: determinePriority(parseInt(getArg('--score')) || 0),
    status: 'new',
    source: getArg('--source') || 'manual',
    notes: getArg('--notes'),
    pain_points: getArg('--pain')?.split(',') || [],
    signals: {
      recent_tweet: getArg('--tweet'),
      mentioned_cold_email: args.includes('--cold-email-pain'),
      builds_in_public: args.includes('--bip'),
      revenue_mentioned: getArg('--mrr')
    }
  };
  
  const saved = saveProspect(prospect);
  
  console.log('\n✅ Prospect Added\n');
  console.log(`ID: ${saved.id}`);
  console.log(`Name: ${saved.name}`);
  console.log(`Priority: ${saved.priority} (Score: ${saved.score})`);
  console.log(`Status: ${saved.status}`);
  if (saved.twitter) console.log(`Twitter: ${saved.twitter}`);
  if (saved.company) console.log(`Company: ${saved.company}`);
  console.log('');
}

function listProspects() {
  const prospects = loadProspects();
  const filter = getArg('--filter');
  const status = getArg('--status');
  
  let filtered = prospects;
  
  if (filter) {
    filtered = filtered.filter(p => p.priority === filter);
  }
  
  if (status) {
    filtered = filtered.filter(p => p.status === status);
  }
  
  // Sort by score desc
  filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
  
  console.log(`\n📋 Prospects (${filtered.length}/${prospects.length})\n`);
  
  if (filtered.length === 0) {
    console.log('No prospects found.\n');
    return;
  }
  
  filtered.forEach(p => {
    const emoji = getPriorityEmoji(p.priority);
    const statusEmoji = getStatusEmoji(p.status);
    
    console.log(`${emoji} ${statusEmoji} [${p.id}] ${p.name} (${p.score})`);
    console.log(`   ${p.title || 'Unknown title'} @ ${p.company || 'Unknown company'}`);
    console.log(`   Status: ${p.status} | Priority: ${p.priority}`);
    if (p.twitter) console.log(`   Twitter: ${p.twitter}`);
    if (p.notes) console.log(`   Notes: ${p.notes}`);
    if (p.signals?.recent_tweet) console.log(`   Recent: "${p.signals.recent_tweet}"`);
    console.log('');
  });
}

function updateProspectCmd() {
  const id = getArg('--id');
  if (!id) {
    console.error('❌ --id required');
    process.exit(1);
  }
  
  const updates = {};
  
  if (getArg('--status')) updates.status = getArg('--status');
  if (getArg('--notes')) updates.notes = getArg('--notes');
  if (getArg('--priority')) updates.priority = getArg('--priority');
  if (getArg('--contacted-date')) updates.contacted_at = getArg('--contacted-date');
  if (getArg('--replied-date')) updates.replied_at = getArg('--replied-date');
  if (args.includes('--won')) updates.status = 'won';
  if (args.includes('--lost')) updates.status = 'lost';
  
  const updated = updateProspect(id, updates);
  
  console.log('\n✅ Prospect Updated\n');
  console.log(`ID: ${updated.id}`);
  console.log(`Name: ${updated.name}`);
  console.log(`Status: ${updated.status}`);
  console.log(`Priority: ${updated.priority}`);
  console.log('');
}

function showStats() {
  const prospects = loadProspects();
  
  const stats = {
    total: prospects.length,
    byPriority: { hot: 0, warm: 0, cold: 0 },
    byStatus: {},
    avgScore: 0
  };
  
  STATUSES.forEach(s => stats.byStatus[s] = 0);
  
  prospects.forEach(p => {
    stats.byPriority[p.priority]++;
    stats.byStatus[p.status]++;
    stats.avgScore += p.score || 0;
  });
  
  stats.avgScore = prospects.length > 0 ? Math.round(stats.avgScore / prospects.length) : 0;
  
  // Calculate conversion rates
  const contacted = stats.byStatus.contacted + stats.byStatus.replied + stats.byStatus.demo_booked + stats.byStatus.proposal_sent + stats.byStatus.won;
  const conversionRate = contacted > 0 ? Math.round((stats.byStatus.won / contacted) * 100) : 0;
  const replyRate = stats.byStatus.contacted > 0 ? Math.round((stats.byStatus.replied / stats.byStatus.contacted) * 100) : 0;
  
  console.log('\n📊 Prospect Pipeline Stats\n');
  console.log(`Total Prospects: ${stats.total}`);
  console.log(`Average Score: ${stats.avgScore}/100\n`);
  
  console.log('Priority Breakdown:');
  console.log(`  🔥 Hot: ${stats.byPriority.hot} (${Math.round((stats.byPriority.hot/stats.total)*100)}%)`);
  console.log(`  🌡️  Warm: ${stats.byPriority.warm} (${Math.round((stats.byPriority.warm/stats.total)*100)}%)`);
  console.log(`  ❄️  Cold: ${stats.byPriority.cold} (${Math.round((stats.byPriority.cold/stats.total)*100)}%)\n`);
  
  console.log('Status Breakdown:');
  STATUSES.forEach(status => {
    const count = stats.byStatus[status];
    const pct = stats.total > 0 ? Math.round((count/stats.total)*100) : 0;
    console.log(`  ${getStatusEmoji(status)} ${status}: ${count} (${pct}%)`);
  });
  
  console.log('');
  console.log(`Reply Rate: ${replyRate}%`);
  console.log(`Win Rate: ${conversionRate}%`);
  console.log('');
}

function determinePriority(score) {
  if (score >= 70) return 'hot';
  if (score >= 50) return 'warm';
  return 'cold';
}

function getPriorityEmoji(priority) {
  const map = { hot: '🔥', warm: '🌡️', cold: '❄️' };
  return map[priority] || '❓';
}

function getStatusEmoji(status) {
  const map = {
    new: '🆕',
    contacted: '📧',
    replied: '💬',
    demo_booked: '📅',
    proposal_sent: '📄',
    won: '✅',
    lost: '❌'
  };
  return map[status] || '❓';
}

function showHelp() {
  console.log(`
🏛️  Caesar's Legions - Prospect Tracker

COMMANDS:

  add       Add a new prospect
            --name "First Last" (required)
            --title "CEO"
            --company "Acme Inc"
            --twitter "@username"
            --linkedin "linkedin.com/in/..."
            --email "email@example.com"
            --score 85
            --source "X search"
            --notes "Complained about cold email 2 days ago"
            --pain "low response rates, manual work"
            --tweet "exact tweet text that caught attention"
            --cold-email-pain  (flag: mentioned cold email issues)
            --bip  (flag: builds in public)
            --mrr "$15K"

  list      List prospects
            --filter hot|warm|cold
            --status new|contacted|replied|demo_booked|proposal_sent|won|lost

  update    Update a prospect
            --id 123 (required)
            --status contacted
            --notes "Sent DM on X"
            --contacted-date "2026-02-02"
            --replied-date "2026-02-03"
            --won  (flag: mark as won)
            --lost (flag: mark as lost)

  stats     Show pipeline statistics

EXAMPLES:

  # Add hot prospect from X
  node scripts/track-prospects.js add \\
    --name "Sarah Johnson" \\
    --title "CEO" \\
    --company "Acme SaaS" \\
    --twitter "@sarahj" \\
    --score 85 \\
    --cold-email-pain \\
    --tweet "Cold email not working. 2% reply rate after 10 hours of work."

  # List all hot prospects
  node scripts/track-prospects.js list --filter hot

  # Mark prospect as contacted
  node scripts/track-prospects.js update --id 1 --status contacted --notes "DM sent on X"

  # Show pipeline stats
  node scripts/track-prospects.js stats
`);
}

// Main execution
try {
  switch (command) {
    case 'add':
      addProspect();
      break;
    case 'list':
      listProspects();
      break;
    case 'update':
      updateProspectCmd();
      break;
    case 'stats':
      showStats();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      console.log('Unknown command. Use --help for usage.');
      process.exit(1);
  }
} catch (error) {
  console.error(`\n❌ Error: ${error.message}\n`);
  process.exit(1);
}
