#!/usr/bin/env node
/**
 * Outreach Tracker CLI
 * Update prospect status, log activities, generate reports
 * 
 * Usage:
 *   node update-tracker.js --dm-sent shainadenny
 *   node update-tracker.js --replied umargik --response "Interested, when can we chat?"
 *   node update-tracker.js --call-booked shainadenny --date "2026-02-05T14:00:00Z"
 *   node update-tracker.js --status
 */

const fs = require('fs');
const path = require('path');

const TRACKER_PATH = path.join(__dirname, '../outreach/tracker.json');
const WORK_LOG_PATH = path.join(__dirname, '../memory/work-log-' + new Date().toISOString().split('T')[0] + '.jsonl');

// Load tracker
function loadTracker() {
  if (!fs.existsSync(TRACKER_PATH)) {
    console.error('❌ Tracker not found:', TRACKER_PATH);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8'));
}

// Save tracker
function saveTracker(tracker) {
  tracker.lastUpdated = new Date().toISOString();
  fs.writeFileSync(TRACKER_PATH, JSON.stringify(tracker, null, 2));
  console.log('✅ Tracker updated');
}

// Log work
function logWork(entry) {
  const logDir = path.dirname(WORK_LOG_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...entry
  };
  
  fs.appendFileSync(WORK_LOG_PATH, JSON.stringify(logEntry) + '\n');
}

// Find prospect by id or twitter handle
function findProspect(tracker, identifier) {
  // Try by ID first
  let prospect = tracker.prospects.find(p => p.id === identifier);
  if (prospect) return prospect;
  
  // Try by twitter handle (with or without @)
  const handle = identifier.startsWith('@') ? identifier : `@${identifier}`;
  prospect = tracker.prospects.find(p => p.twitter === handle);
  
  return prospect;
}

// Update status
function updateStatus(tracker, prospectId, newStatus) {
  const prospect = findProspect(tracker, prospectId);
  if (!prospect) {
    console.error('❌ Prospect not found:', prospectId);
    return tracker;
  }
  
  const oldStatus = prospect.status;
  prospect.status = newStatus;
  
  console.log(`✅ ${prospect.name} (${prospect.twitter}): ${oldStatus} → ${newStatus}`);
  
  // Update pipeline stages
  if (tracker.pipeline_stages[oldStatus]) {
    tracker.pipeline_stages[oldStatus].prospects = 
      tracker.pipeline_stages[oldStatus].prospects.filter(p => p !== prospect.id);
    tracker.pipeline_stages[oldStatus].count--;
  }
  
  if (!tracker.pipeline_stages[newStatus]) {
    tracker.pipeline_stages[newStatus] = { count: 0, prospects: [] };
  }
  
  tracker.pipeline_stages[newStatus].prospects.push(prospect.id);
  tracker.pipeline_stages[newStatus].count++;
  
  return tracker;
}

// Mark DM sent
function markDMSent(tracker, prospectId, dmText = null) {
  const prospect = findProspect(tracker, prospectId);
  if (!prospect) {
    console.error('❌ Prospect not found:', prospectId);
    return tracker;
  }
  
  const now = new Date().toISOString();
  prospect.timeline.dm_sent = now;
  if (dmText) {
    prospect.outreach.dm_text = dmText;
  }
  
  // Update status
  tracker = updateStatus(tracker, prospectId, 'awaiting_reply');
  
  // Update summary
  tracker.summary.dms_sent++;
  
  // Log work
  logWork({
    type: 'outreach',
    action: 'dm_sent',
    prospect: prospect.name,
    twitter: prospect.twitter,
    impact: `DM sent to ${prospect.name} (score: ${prospect.score})`
  });
  
  console.log(`📧 DM sent to ${prospect.name}`);
  
  return tracker;
}

// Mark reply received
function markReply(tracker, prospectId, responseText) {
  const prospect = findProspect(tracker, prospectId);
  if (!prospect) {
    console.error('❌ Prospect not found:', prospectId);
    return tracker;
  }
  
  const now = new Date().toISOString();
  prospect.timeline.replied = now;
  prospect.outreach.response_text = responseText;
  
  // Update summary
  tracker.summary.replies_received++;
  tracker.summary.conversion_rate = 
    (tracker.summary.replies_received / tracker.summary.dms_sent * 100).toFixed(1);
  
  // Log work
  logWork({
    type: 'outreach',
    action: 'reply_received',
    prospect: prospect.name,
    twitter: prospect.twitter,
    response: responseText,
    impact: `${prospect.name} replied! Response rate: ${tracker.summary.conversion_rate}%`
  });
  
  console.log(`✅ ${prospect.name} replied!`);
  console.log(`   Response: "${responseText.substring(0, 100)}..."`);
  
  return tracker;
}

// Mark call booked
function markCallBooked(tracker, prospectId, callDate) {
  const prospect = findProspect(tracker, prospectId);
  if (!prospect) {
    console.error('❌ Prospect not found:', prospectId);
    return tracker;
  }
  
  const now = new Date().toISOString();
  prospect.timeline.call_booked = now;
  prospect.outreach.call_date = callDate;
  
  // Update status
  tracker = updateStatus(tracker, prospectId, 'call_scheduled');
  
  // Update summary
  tracker.summary.calls_booked++;
  
  // Log work
  logWork({
    type: 'outreach',
    action: 'call_booked',
    prospect: prospect.name,
    twitter: prospect.twitter,
    call_date: callDate,
    impact: `Call booked with ${prospect.name} for ${callDate}`
  });
  
  console.log(`📞 Call booked with ${prospect.name} for ${callDate}`);
  
  return tracker;
}

// Mark client signed
function markSigned(tracker, prospectId, mrr) {
  const prospect = findProspect(tracker, prospectId);
  if (!prospect) {
    console.error('❌ Prospect not found:', prospectId);
    return tracker;
  }
  
  const now = new Date().toISOString();
  prospect.timeline.signed = now;
  prospect.outreach.mrr = mrr;
  
  // Update status
  tracker = updateStatus(tracker, prospectId, 'client');
  
  // Update summary
  tracker.summary.clients_signed++;
  
  // Log work
  logWork({
    type: 'revenue',
    action: 'client_signed',
    prospect: prospect.name,
    twitter: prospect.twitter,
    mrr: mrr,
    impact: `🎉 FIRST CLIENT: ${prospect.name} signed for $${mrr}/mo!`
  });
  
  console.log(`🎉 ${prospect.name} signed for $${mrr}/mo!`);
  console.log(`   Total clients: ${tracker.summary.clients_signed}`);
  console.log(`   Total MRR: $${tracker.summary.clients_signed * (mrr || 250)}`);
  
  return tracker;
}

// Show status dashboard
function showStatus(tracker) {
  console.log('\n📊 OUTREACH TRACKER STATUS\n');
  console.log('=' .repeat(60));
  
  // Summary
  console.log('\n📈 SUMMARY');
  console.log(`   Prospects: ${tracker.summary.total_prospects}`);
  console.log(`   DMs Sent: ${tracker.summary.dms_sent}`);
  console.log(`   Replies: ${tracker.summary.replies_received} (${tracker.summary.conversion_rate}%)`);
  console.log(`   Calls: ${tracker.summary.calls_booked}`);
  console.log(`   Clients: ${tracker.summary.clients_signed}`);
  
  // Pipeline
  console.log('\n🔄 PIPELINE');
  for (const [stage, data] of Object.entries(tracker.pipeline_stages)) {
    if (data.count > 0) {
      console.log(`   ${stage}: ${data.count}`);
    }
  }
  
  // Next actions
  console.log('\n🎯 NEXT ACTIONS');
  tracker.next_actions
    .filter(a => !a.blocked_by)
    .slice(0, 3)
    .forEach((action, i) => {
      console.log(`   ${i + 1}. ${action.action} (${action.priority} - due ${action.deadline})`);
    });
  
  // Blockers
  const blockers = tracker.next_actions.filter(a => a.blocked_by);
  if (blockers.length > 0) {
    console.log('\n🚧 BLOCKERS');
    blockers.forEach(b => {
      console.log(`   ❌ ${b.action}: ${b.blocked_by}`);
    });
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// Main
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log(`
Outreach Tracker CLI

USAGE:
  node update-tracker.js --status
  node update-tracker.js --dm-sent <prospect_id>
  node update-tracker.js --replied <prospect_id> --response "text"
  node update-tracker.js --call-booked <prospect_id> --date "2026-02-05T14:00:00Z"
  node update-tracker.js --signed <prospect_id> --mrr 250

EXAMPLES:
  node update-tracker.js --status
  node update-tracker.js --dm-sent shainadenny
  node update-tracker.js --replied umargik --response "Yes, I'm interested. When can we chat?"
  node update-tracker.js --call-booked shainadenny --date "2026-02-05T14:00:00Z"
  node update-tracker.js --signed shainadenny --mrr 250
  `);
  process.exit(0);
}

let tracker = loadTracker();

// Status
if (args.includes('--status')) {
  showStatus(tracker);
  process.exit(0);
}

// DM sent
if (args.includes('--dm-sent')) {
  const idx = args.indexOf('--dm-sent');
  const prospectId = args[idx + 1];
  tracker = markDMSent(tracker, prospectId);
  saveTracker(tracker);
  process.exit(0);
}

// Reply received
if (args.includes('--replied')) {
  const idx = args.indexOf('--replied');
  const prospectId = args[idx + 1];
  const responseIdx = args.indexOf('--response');
  const response = responseIdx !== -1 ? args[responseIdx + 1] : 'No response text provided';
  tracker = markReply(tracker, prospectId, response);
  saveTracker(tracker);
  process.exit(0);
}

// Call booked
if (args.includes('--call-booked')) {
  const idx = args.indexOf('--call-booked');
  const prospectId = args[idx + 1];
  const dateIdx = args.indexOf('--date');
  const date = dateIdx !== -1 ? args[dateIdx + 1] : new Date().toISOString();
  tracker = markCallBooked(tracker, prospectId, date);
  saveTracker(tracker);
  process.exit(0);
}

// Signed
if (args.includes('--signed')) {
  const idx = args.indexOf('--signed');
  const prospectId = args[idx + 1];
  const mrrIdx = args.indexOf('--mrr');
  const mrr = mrrIdx !== -1 ? parseInt(args[mrrIdx + 1]) : 250;
  tracker = markSigned(tracker, prospectId, mrr);
  saveTracker(tracker);
  process.exit(0);
}

console.error('❌ Unknown command. Use --help for usage.');
process.exit(1);
