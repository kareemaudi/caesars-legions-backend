/**
 * OUTREACH TRACKER
 * 
 * Track DM campaigns, responses, and conversions for Caesar's Legions launch
 * 
 * Features:
 * - Log DMs sent (who, when, which template)
 * - Track responses and sentiment
 * - Follow-up reminders
 * - Conversion funnel (DM → Response → Call → Client)
 * - Daily stats dashboard
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data/outreach');
const OUTREACH_LOG = path.join(DATA_DIR, 'outreach-log.jsonl');
const LEADS_DB = path.join(DATA_DIR, 'leads.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Log a sent DM
 */
function logDM(lead) {
  const entry = {
    timestamp: new Date().toISOString(),
    type: 'dm_sent',
    lead_handle: lead.handle,
    lead_name: lead.name,
    template: lead.template || 'custom',
    priority: lead.priority || 'medium',
    expected_response_rate: lead.expected_response_rate || '30-50%',
    notes: lead.notes || ''
  };

  appendToLog(entry);
  updateLeadStatus(lead.handle, 'dm_sent', entry.timestamp);
  
  console.log(`✅ Logged DM to ${lead.handle}`);
  return entry;
}

/**
 * Log a response received
 */
function logResponse(handle, responseText, sentiment = 'neutral') {
  const entry = {
    timestamp: new Date().toISOString(),
    type: 'response_received',
    lead_handle: handle,
    response_preview: responseText.substring(0, 100),
    sentiment: sentiment, // 'positive', 'neutral', 'negative'
    needs_follow_up: sentiment === 'positive'
  };

  appendToLog(entry);
  updateLeadStatus(handle, 'responded', entry.timestamp);
  
  console.log(`💬 Response from ${handle}: ${sentiment}`);
  return entry;
}

/**
 * Log a call scheduled
 */
function logCall(handle, callDate) {
  const entry = {
    timestamp: new Date().toISOString(),
    type: 'call_scheduled',
    lead_handle: handle,
    call_date: callDate
  };

  appendToLog(entry);
  updateLeadStatus(handle, 'call_scheduled', entry.timestamp);
  
  console.log(`📞 Call scheduled with ${handle}`);
  return entry;
}

/**
 * Log a conversion (client signed up)
 */
function logConversion(handle, revenue) {
  const entry = {
    timestamp: new Date().toISOString(),
    type: 'conversion',
    lead_handle: handle,
    revenue_mrr: revenue
  };

  appendToLog(entry);
  updateLeadStatus(handle, 'client', entry.timestamp, revenue);
  
  console.log(`🎉 CONVERSION: ${handle} signed up for $${revenue}/mo`);
  return entry;
}

/**
 * Get leads that need follow-up
 */
function getFollowUpsDue() {
  const leads = loadLeads();
  const now = Date.now();
  const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);

  const needsFollowUp = leads.filter(lead => {
    if (lead.status === 'dm_sent' && lead.last_contact) {
      const lastContactTime = new Date(lead.last_contact).getTime();
      return lastContactTime < threeDaysAgo;
    }
    return false;
  });

  return needsFollowUp;
}

/**
 * Get daily stats
 */
function getDailyStats() {
  const logs = loadLogs();
  const today = new Date().toISOString().split('T')[0];
  
  const todayLogs = logs.filter(log => log.timestamp.startsWith(today));
  
  const stats = {
    date: today,
    dms_sent: todayLogs.filter(l => l.type === 'dm_sent').length,
    responses: todayLogs.filter(l => l.type === 'response_received').length,
    calls_scheduled: todayLogs.filter(l => l.type === 'call_scheduled').length,
    conversions: todayLogs.filter(l => l.type === 'conversion').length,
    response_rate: 0,
    revenue_today: 0
  };

  // Calculate response rate
  const totalSent = logs.filter(l => l.type === 'dm_sent').length;
  const totalResponses = logs.filter(l => l.type === 'response_received').length;
  stats.response_rate = totalSent > 0 ? Math.round((totalResponses / totalSent) * 100) : 0;

  // Calculate revenue
  const conversions = todayLogs.filter(l => l.type === 'conversion');
  stats.revenue_today = conversions.reduce((sum, c) => sum + (c.revenue_mrr || 0), 0);

  return stats;
}

/**
 * Get overall funnel stats
 */
function getFunnelStats() {
  const logs = loadLogs();
  const leads = loadLeads();

  const funnel = {
    total_leads: leads.length,
    dms_sent: logs.filter(l => l.type === 'dm_sent').length,
    responses: logs.filter(l => l.type === 'response_received').length,
    calls: logs.filter(l => l.type === 'call_scheduled').length,
    conversions: logs.filter(l => l.type === 'conversion').length,
    total_mrr: 0
  };

  // Calculate MRR
  const clients = leads.filter(l => l.status === 'client');
  funnel.total_mrr = clients.reduce((sum, c) => sum + (c.revenue_mrr || 0), 0);

  // Conversion rates
  funnel.dm_to_response_rate = funnel.dms_sent > 0 ? Math.round((funnel.responses / funnel.dms_sent) * 100) : 0;
  funnel.response_to_call_rate = funnel.responses > 0 ? Math.round((funnel.calls / funnel.responses) * 100) : 0;
  funnel.call_to_client_rate = funnel.calls > 0 ? Math.round((funnel.conversions / funnel.calls) * 100) : 0;

  return funnel;
}

/**
 * Generate daily report
 */
function generateDailyReport() {
  const daily = getDailyStats();
  const funnel = getFunnelStats();
  const followUps = getFollowUpsDue();

  const report = {
    date: daily.date,
    today: daily,
    overall: funnel,
    follow_ups_due: followUps.length,
    follow_up_leads: followUps.map(l => ({
      handle: l.handle,
      name: l.name,
      days_since_dm: Math.floor((Date.now() - new Date(l.last_contact).getTime()) / (24 * 60 * 60 * 1000))
    }))
  };

  return report;
}

/**
 * Print dashboard to console
 */
function printDashboard() {
  const report = generateDailyReport();

  console.log('\n' + '='.repeat(60));
  console.log('🏛️  CAESAR\'S LEGIONS - OUTREACH DASHBOARD');
  console.log('='.repeat(60));
  console.log(`\n📅 Date: ${report.date}`);
  
  console.log('\n📊 TODAY:');
  console.log(`   DMs Sent: ${report.today.dms_sent}`);
  console.log(`   Responses: ${report.today.responses}`);
  console.log(`   Calls Scheduled: ${report.today.calls_scheduled}`);
  console.log(`   Conversions: ${report.today.conversions}`);
  console.log(`   Revenue: $${report.today.revenue_today}/mo`);

  console.log('\n🎯 OVERALL FUNNEL:');
  console.log(`   Total Leads: ${report.overall.total_leads}`);
  console.log(`   DMs Sent: ${report.overall.dms_sent}`);
  console.log(`   Responses: ${report.overall.responses} (${report.overall.dm_to_response_rate}%)`);
  console.log(`   Calls: ${report.overall.calls} (${report.overall.response_to_call_rate}%)`);
  console.log(`   Clients: ${report.overall.conversions} (${report.overall.call_to_client_rate}%)`);
  console.log(`   💰 Total MRR: $${report.overall.total_mrr}`);

  if (report.follow_ups_due > 0) {
    console.log('\n⚠️  FOLLOW-UPS DUE:');
    report.follow_up_leads.forEach(lead => {
      console.log(`   @${lead.handle} (${lead.days_since_dm} days ago)`);
    });
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

// Helper functions

function appendToLog(entry) {
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(OUTREACH_LOG, line);
}

function loadLogs() {
  if (!fs.existsSync(OUTREACH_LOG)) return [];
  
  const content = fs.readFileSync(OUTREACH_LOG, 'utf-8');
  return content.trim().split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line));
}

function loadLeads() {
  if (!fs.existsSync(LEADS_DB)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(LEADS_DB, 'utf-8'));
}

function saveLeads(leads) {
  fs.writeFileSync(LEADS_DB, JSON.stringify(leads, null, 2));
}

function updateLeadStatus(handle, status, timestamp, revenue = null) {
  const leads = loadLeads();
  const leadIndex = leads.findIndex(l => l.handle === handle);

  if (leadIndex === -1) {
    // Create new lead
    leads.push({
      handle,
      status,
      last_contact: timestamp,
      revenue_mrr: revenue,
      created_at: timestamp
    });
  } else {
    // Update existing
    leads[leadIndex].status = status;
    leads[leadIndex].last_contact = timestamp;
    if (revenue !== null) {
      leads[leadIndex].revenue_mrr = revenue;
    }
  }

  saveLeads(leads);
}

// Export functions
module.exports = {
  logDM,
  logResponse,
  logCall,
  logConversion,
  getFollowUpsDue,
  getDailyStats,
  getFunnelStats,
  generateDailyReport,
  printDashboard
};

// CLI usage
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case 'dashboard':
      printDashboard();
      break;
    case 'followups':
      const followUps = getFollowUpsDue();
      console.log(`\n📋 ${followUps.length} Follow-ups Due:\n`);
      followUps.forEach(lead => {
        console.log(`@${lead.handle} - ${lead.name}`);
      });
      break;
    case 'report':
      const report = generateDailyReport();
      console.log(JSON.stringify(report, null, 2));
      break;
    default:
      console.log('Usage: node outreach-tracker.js [dashboard|followups|report]');
  }
}
