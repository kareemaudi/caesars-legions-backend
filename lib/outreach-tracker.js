/**
 * Outreach Tracker - Track DM campaigns, responses, and conversions
 * 
 * Manages the full lifecycle:
 * - Prospect identification
 * - DM sent
 * - Response received
 * - Demo booked
 * - Client onboarded
 * - Revenue attribution
 * 
 * Usage:
 *   const tracker = require('./lib/outreach-tracker');
 *   tracker.logOutreach('pc001', 'dm_sent', { template: 'cold_v1' });
 *   tracker.logResponse('pc001', 'positive', 'Interested! Let\'s chat.');
 *   tracker.markConverted('pc001', 250); // $250 MRR
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'outreach-tracker.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database
let db = {
  prospects: [],
  outreach_log: [],
  metrics: {}
};

if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function initTables() {
  // JSON-based, no tables to create
  console.log('✓ Outreach tracker initialized');
}

// Import prospects from JSON file
function importProspects(filePath) {
  const prospects = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  let imported = 0;
  for (const p of prospects) {
    // Check if already exists
    const existing = db.prospects.find(existing => existing.id === p.id);
    
    if (!existing) {
      db.prospects.push({
        id: p.id,
        source: p.source,
        handle: p.handle,
        name: p.name,
        url: p.url,
        company: p.company || 'Unknown',
        title: p.title,
        pain_point: p.pain_point,
        fit_score: p.fit_score,
        status: p.status || 'new',
        notes: p.notes || '',
        added_at: new Date().toISOString(),
        contacted_at: null,
        responded_at: null,
        converted_at: null,
        mrr: 0
      });
      imported++;
    }
  }

  save();
  console.log(`✅ Imported ${imported} new prospects`);
  return imported;
}

// Log outreach event
function logOutreach(prospectId, eventType, metadata = {}) {
  const logEntry = {
    id: db.outreach_log.length + 1,
    prospect_id: prospectId,
    event_type: eventType,
    platform: metadata.platform || 'twitter',
    template: metadata.template || null,
    message: metadata.message || null,
    response: null,
    sentiment: null,
    metadata: metadata,
    timestamp: new Date().toISOString()
  };

  db.outreach_log.push(logEntry);

  // Update prospect status
  if (eventType === 'dm_sent') {
    const prospect = db.prospects.find(p => p.id === prospectId);
    if (prospect) {
      prospect.status = 'contacted';
      prospect.contacted_at = new Date().toISOString();
    }
  }

  save();
  console.log(`📤 Logged ${eventType} for ${prospectId}`);
}

// Log response from prospect
function logResponse(prospectId, sentiment, responseText, metadata = {}) {
  const logEntry = {
    id: db.outreach_log.length + 1,
    prospect_id: prospectId,
    event_type: 'response',
    platform: null,
    template: null,
    message: null,
    response: responseText,
    sentiment: sentiment,
    metadata: metadata,
    timestamp: new Date().toISOString()
  };

  db.outreach_log.push(logEntry);

  // Update prospect status
  const newStatus = sentiment === 'positive' ? 'interested' : 
                    sentiment === 'negative' ? 'not_interested' : 'neutral';

  const prospect = db.prospects.find(p => p.id === prospectId);
  if (prospect) {
    prospect.status = newStatus;
    prospect.responded_at = new Date().toISOString();
  }

  save();
  console.log(`💬 Logged ${sentiment} response from ${prospectId}`);
}

// Mark prospect as converted (became paying client)
function markConverted(prospectId, mrr) {
  const prospect = db.prospects.find(p => p.id === prospectId);
  if (prospect) {
    prospect.status = 'converted';
    prospect.converted_at = new Date().toISOString();
    prospect.mrr = mrr;
  }

  logOutreach(prospectId, 'converted', { mrr });

  console.log(`💰 ${prospectId} converted → $${mrr} MRR`);
}

// Get prospect status
function getProspect(prospectId) {
  return db.prospects.find(p => p.id === prospectId);
}

// Get outreach history for prospect
function getOutreachHistory(prospectId) {
  return db.outreach_log
    .filter(log => log.prospect_id === prospectId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// Get prospects by status
function getProspectsByStatus(status) {
  return db.prospects
    .filter(p => p.status === status)
    .sort((a, b) => b.fit_score - a.fit_score);
}

// Get metrics for date range
function getMetrics(startDate, endDate) {
  const filteredProspects = db.prospects.filter(p => {
    const addedAt = new Date(p.added_at);
    return addedAt >= new Date(startDate) && addedAt <= new Date(endDate);
  });

  const prospects = {
    total: filteredProspects.length,
    contacted: filteredProspects.filter(p => p.status === 'contacted' || p.status === 'interested' || p.status === 'converted').length,
    interested: filteredProspects.filter(p => p.status === 'interested' || p.status === 'converted').length,
    converted: filteredProspects.filter(p => p.status === 'converted').length,
    total_mrr: filteredProspects.reduce((sum, p) => sum + (p.mrr || 0), 0),
    avg_fit_score: filteredProspects.length > 0 ? 
      filteredProspects.reduce((sum, p) => sum + p.fit_score, 0) / filteredProspects.length : 0
  };

  const filteredLog = db.outreach_log.filter(log => {
    const timestamp = new Date(log.timestamp);
    return timestamp >= new Date(startDate) && timestamp <= new Date(endDate);
  });

  const outreach = {};
  filteredLog.forEach(log => {
    if (!outreach[log.event_type]) {
      outreach[log.event_type] = { count: 0, positive: 0 };
    }
    outreach[log.event_type].count++;
    if (log.sentiment === 'positive') {
      outreach[log.event_type].positive++;
    }
  });

  // Calculate average response time
  const responseTimes = filteredProspects
    .filter(p => p.contacted_at && p.responded_at)
    .map(p => {
      const contacted = new Date(p.contacted_at);
      const responded = new Date(p.responded_at);
      return (responded - contacted) / (1000 * 60 * 60); // hours
    });

  const avgResponseTimeHours = responseTimes.length > 0 ?
    responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length : 0;

  // Calculate average conversion time
  const conversionTimes = filteredProspects
    .filter(p => p.contacted_at && p.converted_at)
    .map(p => {
      const contacted = new Date(p.contacted_at);
      const converted = new Date(p.converted_at);
      return (converted - contacted) / (1000 * 60 * 60 * 24); // days
    });

  const avgConversionTimeDays = conversionTimes.length > 0 ?
    conversionTimes.reduce((sum, t) => sum + t, 0) / conversionTimes.length : 0;

  return {
    prospects,
    outreach: Object.entries(outreach).map(([event_type, data]) => ({
      event_type,
      count: data.count,
      positive_rate: data.count > 0 ? (data.positive / data.count) : 0
    })),
    avgResponseTimeHours,
    avgConversionTimeDays,
    responseRate: prospects.contacted > 0 ? 
      ((prospects.interested + prospects.converted) / prospects.contacted * 100).toFixed(1) : 0,
    conversionRate: prospects.contacted > 0 ?
      (prospects.converted / prospects.contacted * 100).toFixed(1) : 0,
  };
}

// Generate daily report
function generateDailyReport() {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const metrics = getMetrics(weekAgo, today);
  
  const topProspects = db.prospects
    .filter(p => ['new', 'contacted', 'interested'].includes(p.status))
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, 5);

  const weekAgoDate = new Date(weekAgo);
  const recentResponses = db.outreach_log
    .filter(log => {
      return log.event_type === 'response' && new Date(log.timestamp) > weekAgoDate;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5)
    .map(log => {
      const prospect = db.prospects.find(p => p.id === log.prospect_id);
      return {
        name: prospect?.name,
        handle: prospect?.handle,
        sentiment: log.sentiment,
        response: log.response,
        timestamp: log.timestamp
      };
    });

  return {
    date: today,
    metrics,
    topProspects,
    recentResponses,
  };
}

// Export functions
module.exports = {
  initTables,
  importProspects,
  logOutreach,
  logResponse,
  markConverted,
  getProspect,
  getOutreachHistory,
  getProspectsByStatus,
  getMetrics,
  generateDailyReport,
};

// Initialize tables on load
if (require.main === module) {
  // Run as standalone script
  initTables();
  
  // Import prospects from pilot-candidates.json
  const pilotsPath = path.join(__dirname, '..', 'data', 'pilot-candidates.json');
  if (fs.existsSync(pilotsPath)) {
    importProspects(pilotsPath);
  }

  // Show daily report
  const report = generateDailyReport();
  console.log('\n📊 Caesar\'s Legions - Daily Outreach Report');
  console.log('═══════════════════════════════════════════════');
  console.log(`Date: ${report.date}`);
  console.log(`\nProspects:`);
  console.log(`  Total: ${report.metrics.prospects.total}`);
  console.log(`  Contacted: ${report.metrics.prospects.contacted}`);
  console.log(`  Interested: ${report.metrics.prospects.interested}`);
  console.log(`  Converted: ${report.metrics.prospects.converted}`);
  console.log(`  Total MRR: $${report.metrics.prospects.total_mrr}`);
  console.log(`\nPerformance:`);
  console.log(`  Response Rate: ${report.metrics.responseRate}%`);
  console.log(`  Conversion Rate: ${report.metrics.conversionRate}%`);
  console.log(`  Avg Response Time: ${report.metrics.avgResponseTimeHours.toFixed(1)} hours`);
  console.log(`  Avg Conversion Time: ${report.metrics.avgConversionTimeDays.toFixed(1)} days`);
  console.log('\n🏆 Top 5 Prospects:');
  report.topProspects.forEach((p, i) => {
    console.log(`  ${i + 1}. @${p.handle} (${p.fit_score}/100) - ${p.status}`);
    console.log(`     ${p.pain_point?.substring(0, 80)}...`);
  });
  console.log('═══════════════════════════════════════════════\n');
}
