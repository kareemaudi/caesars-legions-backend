// Prospect Tracking & Scoring System
// Manages lead research, qualification, and outreach tracking

const fs = require('fs');
const path = require('path');

const PROSPECTS_DIR = path.join(__dirname, '../../research');
const PROSPECTS_FILE = path.join(PROSPECTS_DIR, 'prospects.json');

// Ensure research directory exists
if (!fs.existsSync(PROSPECTS_DIR)) {
  fs.mkdirSync(PROSPECTS_DIR, { recursive: true });
}

/**
 * Prospect scoring criteria (0-100 scale)
 */
function scoreProspect(prospect) {
  let score = 0;
  
  // Company size (0-25 points)
  if (prospect.company_size) {
    if (prospect.company_size >= 10 && prospect.company_size <= 100) {
      score += 25; // Sweet spot
    } else if (prospect.company_size < 10) {
      score += 15; // Small but feasible
    } else if (prospect.company_size > 100) {
      score += 10; // Might be too big for beta
    }
  }
  
  // Revenue indicator (0-30 points)
  if (prospect.revenue_mrr) {
    if (prospect.revenue_mrr >= 10000 && prospect.revenue_mrr <= 500000) {
      score += 30; // Perfect fit
    } else if (prospect.revenue_mrr > 0) {
      score += 15; // Has revenue
    }
  }
  
  // Pain point mentioned (0-20 points)
  if (prospect.pain_points && prospect.pain_points.length > 0) {
    score += 20; // Actively complaining about cold email
  }
  
  // Social proof (0-15 points)
  const followers = prospect.twitter_followers || 0;
  if (followers > 10000) score += 15;
  else if (followers > 1000) score += 10;
  else if (followers > 100) score += 5;
  
  // Engagement/activity (0-10 points)
  if (prospect.recent_activity) {
    score += 10; // Active on socials recently
  }
  
  return Math.min(100, score);
}

/**
 * Add a new prospect to the database
 */
function addProspect(prospectData) {
  const prospects = loadProspects();
  
  const prospect = {
    id: generateProspectId(prospectData),
    added_at: new Date().toISOString(),
    status: 'new', // new | contacted | responded | qualified | lost
    score: 0,
    ...prospectData
  };
  
  // Calculate score
  prospect.score = scoreProspect(prospect);
  
  // Check for duplicates
  const existing = prospects.find(p => 
    p.email === prospect.email || 
    p.twitter_handle === prospect.twitter_handle
  );
  
  if (existing) {
    console.log(`⚠️  Duplicate prospect: ${prospect.name || prospect.email}`);
    return existing;
  }
  
  prospects.push(prospect);
  saveProspects(prospects);
  
  console.log(`✅ Added prospect: ${prospect.name} (Score: ${prospect.score})`);
  return prospect;
}

/**
 * Update prospect status
 */
function updateProspectStatus(prospectId, status, notes = '') {
  const prospects = loadProspects();
  const prospect = prospects.find(p => p.id === prospectId);
  
  if (!prospect) {
    throw new Error(`Prospect not found: ${prospectId}`);
  }
  
  prospect.status = status;
  prospect.updated_at = new Date().toISOString();
  
  if (notes) {
    if (!prospect.notes) prospect.notes = [];
    prospect.notes.push({
      timestamp: new Date().toISOString(),
      text: notes
    });
  }
  
  saveProspects(prospects);
  return prospect;
}

/**
 * Get top prospects by score
 */
function getTopProspects(limit = 10, status = null) {
  let prospects = loadProspects();
  
  if (status) {
    prospects = prospects.filter(p => p.status === status);
  }
  
  return prospects
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get prospects by status
 */
function getProspectsByStatus(status) {
  const prospects = loadProspects();
  return prospects.filter(p => p.status === status);
}

/**
 * Search prospects
 */
function searchProspects(query) {
  const prospects = loadProspects();
  const lowerQuery = query.toLowerCase();
  
  return prospects.filter(p => 
    (p.name && p.name.toLowerCase().includes(lowerQuery)) ||
    (p.company && p.company.toLowerCase().includes(lowerQuery)) ||
    (p.email && p.email.toLowerCase().includes(lowerQuery)) ||
    (p.twitter_handle && p.twitter_handle.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get pipeline metrics
 */
function getPipelineMetrics() {
  const prospects = loadProspects();
  
  const metrics = {
    total: prospects.length,
    by_status: {},
    avg_score: 0,
    top_10_avg_score: 0
  };
  
  // Count by status
  const statuses = ['new', 'contacted', 'responded', 'qualified', 'lost'];
  statuses.forEach(status => {
    metrics.by_status[status] = prospects.filter(p => p.status === status).length;
  });
  
  // Average scores
  if (prospects.length > 0) {
    const totalScore = prospects.reduce((sum, p) => sum + p.score, 0);
    metrics.avg_score = Math.round(totalScore / prospects.length);
    
    const top10 = prospects
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    
    if (top10.length > 0) {
      const top10Score = top10.reduce((sum, p) => sum + p.score, 0);
      metrics.top_10_avg_score = Math.round(top10Score / top10.length);
    }
  }
  
  return metrics;
}

/**
 * Export prospects to CSV (for manual outreach)
 */
function exportToCSV(status = null) {
  let prospects = loadProspects();
  
  if (status) {
    prospects = prospects.filter(p => p.status === status);
  }
  
  const headers = 'Name,Email,Company,Twitter,Score,Status,Pain Points\n';
  const rows = prospects.map(p => {
    const painPoints = (p.pain_points || []).join('; ');
    return `"${p.name || ''}","${p.email || ''}","${p.company || ''}","${p.twitter_handle || ''}",${p.score},"${p.status}","${painPoints}"`;
  }).join('\n');
  
  return headers + rows;
}

// Helper functions

function loadProspects() {
  if (!fs.existsSync(PROSPECTS_FILE)) {
    return [];
  }
  
  try {
    const data = fs.readFileSync(PROSPECTS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    
    // Handle both array format and object format { prospects: [...] }
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed.prospects && Array.isArray(parsed.prospects)) {
      // Migrate old format to new format
      return parsed.prospects;
    } else {
      return [];
    }
  } catch (error) {
    console.error('Error loading prospects:', error.message);
    return [];
  }
}

function saveProspects(prospects) {
  fs.writeFileSync(
    PROSPECTS_FILE, 
    JSON.stringify(prospects, null, 2),
    'utf8'
  );
}

function generateProspectId(prospect) {
  const base = prospect.email || prospect.twitter_handle || prospect.name || 'unknown';
  const timestamp = Date.now();
  return `${base.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}`;
}

module.exports = {
  addProspect,
  updateProspectStatus,
  getTopProspects,
  getProspectsByStatus,
  searchProspects,
  getPipelineMetrics,
  exportToCSV,
  scoreProspect
};
