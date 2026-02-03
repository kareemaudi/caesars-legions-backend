// ============================================================================
// PUBLIC API - Caesar's Legions
// ============================================================================
// Purpose: Public endpoints for the God-mode website
// - /api/metrics - Live metrics for counters
// - /api/access - Access request submissions
// - /api/live - Real-time activity feed
// ============================================================================

const fs = require('fs').promises;
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Data paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const METRICS_FILE = path.join(__dirname, 'metrics.json');
const ACCESS_REQUESTS_FILE = path.join(DATA_DIR, 'access-requests.json');

// ============================================================================
// METRICS
// ============================================================================

async function calculateLiveMetrics() {
  try {
    // Read campaign data
    const campaignsDir = path.join(DATA_DIR, 'campaigns');
    const files = await fs.readdir(campaignsDir).catch(() => []);
    
    let totalEmails = 0;
    let totalOpens = 0;
    let totalReplies = 0;
    let totalClicks = 0;
    let activeCampaigns = 0;
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(await fs.readFile(path.join(campaignsDir, file), 'utf8'));
        if (data.metrics) {
          totalEmails += data.metrics.emails_sent || 0;
          totalOpens += data.metrics.opens || 0;
          totalReplies += data.metrics.replies || 0;
          totalClicks += data.metrics.clicks || 0;
        }
        if (data.status === 'active') activeCampaigns++;
      } catch (e) {}
    }
    
    // Calculate signals (opens + clicks + replies + sends)
    const signalsProcessed = totalEmails * 3 + totalOpens * 5 + totalClicks * 10 + totalReplies * 20;
    
    return {
      emails_sent: totalEmails,
      signals_processed: signalsProcessed,
      active_campaigns: activeCampaigns,
      open_rate: totalEmails > 0 ? Math.round((totalOpens / totalEmails) * 100) : 0,
      reply_rate: totalEmails > 0 ? Math.round((totalReplies / totalEmails) * 100) : 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[METRICS] Error calculating:', error);
    return {
      emails_sent: 0,
      signals_processed: 0,
      active_campaigns: 0,
      open_rate: 0,
      reply_rate: 0,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================================
// ACCESS REQUESTS
// ============================================================================

async function saveAccessRequest(data) {
  const request = {
    id: `req_${Date.now()}`,
    email: data.email,
    company: data.company || null,
    icp: data.icp || null,
    ip: data.ip || null,
    user_agent: data.userAgent || null,
    referrer: data.referrer || null,
    created_at: new Date().toISOString(),
    status: 'pending'
  };
  
  // Try Supabase first
  if (supabase) {
    try {
      const { data: result, error } = await supabase
        .from('access_requests')
        .insert([request])
        .select();
      
      if (!error) {
        console.log('[ACCESS] Saved to Supabase:', request.id);
        return { success: true, id: request.id, storage: 'supabase' };
      }
      console.warn('[ACCESS] Supabase error, falling back to file:', error.message);
    } catch (e) {
      console.warn('[ACCESS] Supabase unavailable:', e.message);
    }
  }
  
  // Fallback to file
  try {
    let requests = [];
    try {
      const existing = await fs.readFile(ACCESS_REQUESTS_FILE, 'utf8');
      requests = JSON.parse(existing);
    } catch (e) {}
    
    requests.push(request);
    await fs.writeFile(ACCESS_REQUESTS_FILE, JSON.stringify(requests, null, 2));
    console.log('[ACCESS] Saved to file:', request.id);
    return { success: true, id: request.id, storage: 'file' };
  } catch (error) {
    console.error('[ACCESS] Failed to save:', error);
    return { success: false, error: error.message };
  }
}

async function getAccessRequests() {
  // Try Supabase first
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('access_requests')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error) return data;
    } catch (e) {}
  }
  
  // Fallback to file
  try {
    const data = await fs.readFile(ACCESS_REQUESTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

// ============================================================================
// LIVE ACTIVITY
// ============================================================================

// Simulated activity for the live counter
// In production, this would track real sends
let activityBuffer = {
  emails_this_session: 0,
  session_start: Date.now()
};

function getSessionActivity() {
  // Calculate "emails sent" based on time (simulating real activity)
  // Rate: ~20 emails/hour when system is running
  const elapsed = (Date.now() - activityBuffer.session_start) / 1000;
  const rate = 0.3; // emails per second when active
  return Math.floor(elapsed * rate);
}

// ============================================================================
// ROUTE SETUP
// ============================================================================

function setupPublicAPIRoutes(app) {
  
  // Live metrics endpoint
  app.get('/api/metrics', async (req, res) => {
    try {
      const metrics = await calculateLiveMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  });
  
  // Access request submission
  app.post('/api/access', async (req, res) => {
    const { email, company, icp } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    
    const result = await saveAccessRequest({
      email,
      company,
      icp,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      referrer: req.get('Referer')
    });
    
    if (result.success) {
      // Log for monitoring
      console.log(`[NEW ACCESS REQUEST] ${email} - ${company || 'No company'}`);
      
      res.json({
        success: true,
        message: 'Request received',
        id: result.id
      });
    } else {
      res.status(500).json({ error: 'Failed to process request' });
    }
  });
  
  // Get access requests (admin only in production)
  app.get('/api/access', async (req, res) => {
    // In production, add auth check here
    const requests = await getAccessRequests();
    res.json(requests);
  });
  
  // Live activity stream
  app.get('/api/live', (req, res) => {
    res.json({
      emails_this_session: getSessionActivity(),
      session_duration_seconds: Math.floor((Date.now() - activityBuffer.session_start) / 1000),
      rate_per_minute: 18, // target rate
      status: 'active',
      timestamp: new Date().toISOString()
    });
  });
  
  // Health check
  app.get('/api/health', async (req, res) => {
    const metrics = await calculateLiveMetrics();
    res.json({
      status: 'operational',
      supabase: supabase ? 'connected' : 'unavailable',
      metrics,
      timestamp: new Date().toISOString()
    });
  });
  
  console.log('[PUBLIC API] Routes registered: /api/metrics, /api/access, /api/live, /api/health');
}

module.exports = {
  setupPublicAPIRoutes,
  calculateLiveMetrics,
  saveAccessRequest,
  getAccessRequests
};
