#!/usr/bin/env node
// v2.0.0 — JSON-based signup flow (no SQLite dependency)

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

// Graceful imports — some may fail on Railway if native modules aren't available
let db, webhookHandler, unsubscribeHandler, stripeIntegration, signupHandler, dashboardApi;
try { db = require('../lib/db'); } catch(e) { console.warn('⚠️ db module unavailable:', e.message); }
try { webhookHandler = require('../lib/webhook-handler'); } catch(e) { console.warn('⚠️ webhook-handler unavailable:', e.message); }
try { unsubscribeHandler = require('../lib/unsubscribe'); } catch(e) { console.warn('⚠️ unsubscribe unavailable:', e.message); }
try { stripeIntegration = require('../lib/stripe-integration'); } catch(e) { console.warn('⚠️ stripe-integration unavailable:', e.message); }
try { signupHandler = require('../lib/signup-handler'); } catch(e) { console.warn('⚠️ signup-handler unavailable:', e.message); }
try { dashboardApi = require('../lib/dashboard-api'); } catch(e) { console.warn('⚠️ dashboard-api unavailable:', e.message); }

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

// Rate limiting (simple in-memory, use Redis in production)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }
  
  const requests = rateLimitStore.get(ip).filter(time => time > windowStart);
  requests.push(now);
  rateLimitStore.set(ip, requests);
  
  if (requests.length > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  
  next();
}

// Security headers
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// Simple token-based auth for dashboard
// Tokens are generated per client and stored in db
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const tokenParam = req.query.token;
  const token = authHeader?.replace('Bearer ', '') || tokenParam;
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Validate token format (should be clientId:hash)
  const [clientId, hash] = (token || '').split(':');
  if (!clientId || !hash) {
    return res.status(401).json({ error: 'Invalid token format' });
  }
  
  if (!db) {
    return res.status(503).json({ error: 'Database not available' });
  }
  const client = db.getClient(parseInt(clientId));
  if (!client) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  // Verify hash (simple HMAC of clientId + email)
  const secret = process.env.DASHBOARD_SECRET || 'change-this-in-production';
  const expectedHash = crypto.createHmac('sha256', secret)
    .update(`${clientId}:${client.email}`)
    .digest('hex')
    .slice(0, 32);
  
  if (hash !== expectedHash) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  req.client = client;
  req.clientId = parseInt(clientId);
  next();
}

// Generate dashboard token for a client
function generateDashboardToken(clientId, email) {
  const secret = process.env.DASHBOARD_SECRET || 'change-this-in-production';
  const hash = crypto.createHmac('sha256', secret)
    .update(`${clientId}:${email}`)
    .digest('hex')
    .slice(0, 32);
  return `${clientId}:${hash}`;
}

// Input validation helper
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============================================================================
// CORS CONFIGURATION
// =============================================================================
const ALLOWED_ORIGINS = [
  'https://caesarslegions.ai',
  'https://promptabusiness.com',
  'https://www.promptabusiness.com',
  'https://makhlab.promptabusiness.com',
  'https://kareemaudi.github.io',
  'https://mubyn.com',
  'https://www.mubyn.com',
  'https://app.mubyn.com',
  'http://localhost:3500',
  'http://localhost:5173',
  process.env.BASE_URL,
  process.env.FRONTEND_URL
].filter(Boolean);

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
}

// Apply global middleware
app.use(rateLimit);
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(express.json({ limit: '10kb' })); // Limit body size

// Serve static files (signup page)
app.use(express.static('public'));

// Export for use in other modules
module.exports.generateDashboardToken = generateDashboardToken;
module.exports.escapeHtml = escapeHtml;

// Health check endpoints (for Railway)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'caesars-legions', timestamp: new Date().toISOString() });
});
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'caesars-legions', timestamp: new Date().toISOString() });
});

// Self-serve dashboard routes
try {
  const dashboardRoutes = require('../api/dashboard-routes.js');
  app.use('/dashboard', dashboardRoutes);
  console.log('✅ Dashboard routes mounted at /dashboard');
} catch (dashErr) {
  console.warn('⚠️ Dashboard routes failed to load:', dashErr.message);
}

// Webhook routes (conditional — may not be available on Railway)
if (webhookHandler) {
  // webhookHandler is an object with named functions, not a Router
  if (typeof webhookHandler === 'function') {
    app.use('/webhooks', webhookHandler);
  } else if (webhookHandler.webhookMiddleware) {
    app.use('/webhooks', webhookHandler.webhookMiddleware);
  } else if (webhookHandler.router) {
    app.use('/webhooks', webhookHandler.router);
  } else {
    console.warn('⚠️ webhookHandler loaded but not a middleware — skipping mount');
  }
}

// Unsubscribe routes (conditional)
if (unsubscribeHandler && unsubscribeHandler.router) {
  app.use('/unsubscribe', unsubscribeHandler.router);
}

// MontyPay webhook endpoint (payment confirmations)
app.post('/webhooks/payment', express.json(), async (req, res) => {
  try {
    const { handleMontyPayWebhook } = require('../lib/payment-handler');
    await handleMontyPayWebhook(req, res);
  } catch (error) {
    console.error('Payment webhook error:', error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// Manual payment confirmation endpoint (for Bitcoin or manual verification)
app.post('/api/confirm-payment', authMiddleware, async (req, res) => {
  try {
    const { clientId, paymentMethod, transactionId, amount } = req.body;
    const { confirmPayment } = require('../lib/payment-handler');
    
    const result = await confirmPayment({ clientId, paymentMethod, transactionId, amount });
    res.json(result);
  } catch (error) {
    console.error('Payment confirmation error:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Signup API - Handles new client signups (with input validation)
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, company, website, pain_point, target_audience } = req.body;
    
    // Input validation
    if (!name || typeof name !== 'string' || name.length < 2 || name.length > 100) {
      return res.status(400).json({ success: false, error: 'Invalid name' });
    }
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email' });
    }
    if (!company || typeof company !== 'string' || company.length < 2 || company.length > 100) {
      return res.status(400).json({ success: false, error: 'Invalid company name' });
    }
    if (!website || typeof website !== 'string' || !website.match(/^https?:\/\/.+/)) {
      return res.status(400).json({ success: false, error: 'Invalid website URL' });
    }
    
    // Sanitize inputs
    const sanitized = {
      name: escapeHtml(name.trim()),
      email: email.toLowerCase().trim(),
      company: escapeHtml(company.trim()),
      website: website.trim(),
      pain_point: escapeHtml((pain_point || '').slice(0, 500)),
      target_audience: escapeHtml((target_audience || '').slice(0, 500))
    };
    
    if (!signupHandler) {
      return res.status(503).json({ success: false, error: 'Signup module not available. Use /api/clients/signup instead.' });
    }
    const result = await signupHandler.handleSignup(sanitized);
    
    res.json(result);
  } catch (error) {
    console.error('❌ Signup error:', error.message);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

// =============================================================================
// CLIENT SIGNUP & STATUS ENDPOINTS (public — no auth required)
// =============================================================================

// POST /api/clients/signup — New client self-service signup
app.post('/api/clients/signup', async (req, res) => {
  try {
    const {
      companyName, website, industry, companySize,
      targetTitle, targetIndustry, targetRegion,
      email, name
    } = req.body;

    // Validate required fields
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }
    if (!companyName || typeof companyName !== 'string' || companyName.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Company name is required (min 2 chars)' });
    }
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Your name is required (min 2 chars)' });
    }

    // Sanitize
    const sanitized = {
      email: email.toLowerCase().trim(),
      name: escapeHtml(name.trim().slice(0, 100)),
      companyName: escapeHtml(companyName.trim().slice(0, 100)),
      website: (website || '').trim().slice(0, 200),
      industry: escapeHtml((industry || '').slice(0, 100)),
      companySize: escapeHtml((companySize || '').slice(0, 50)),
      targetTitle: escapeHtml((targetTitle || '').slice(0, 200)),
      targetIndustry: escapeHtml((targetIndustry || '').slice(0, 200)),
      targetRegion: escapeHtml((targetRegion || '').slice(0, 200))
    };

    // Use JSON file as primary storage (works everywhere, no native deps)
    const clientsFile = path.join(__dirname, '..', 'data', 'clients.json');
    let clients = [];
    try { clients = JSON.parse(fs.readFileSync(clientsFile, 'utf8')); } catch(e) { /* new file */ }

    // Check for existing client
    const existing = clients.find(c => c.email === sanitized.email);
    if (existing) {
      return res.json({
        success: true,
        clientId: existing.clientId || existing.id,
        status: existing.status,
        message: 'Account already exists. Welcome back!'
      });
    }

    // Generate unique client ID
    const clientId = clients.length > 0
      ? Math.max(...clients.map(c => c.clientId || c.id || 0)) + 1
      : 1;

    const clientRecord = {
      clientId,
      email: sanitized.email,
      name: sanitized.name,
      company: sanitized.companyName,
      website: sanitized.website,
      industry: sanitized.industry,
      companySize: sanitized.companySize,
      targetTitle: sanitized.targetTitle,
      targetIndustry: sanitized.targetIndustry,
      targetRegion: sanitized.targetRegion,
      status: 'onboarding',
      plan: 'trial',
      signupDate: new Date().toISOString(),
      source: 'onboarding_form'
    };

    clients.push(clientRecord);
    fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
    fs.writeFileSync(clientsFile, JSON.stringify(clients, null, 2));

    // Also insert into db module if available (for legacy dashboard compat)
    if (db) {
      try {
        db.insertClient({
          email: sanitized.email,
          name: sanitized.name,
          company: sanitized.companyName,
          website: sanitized.website,
          target_audience: [sanitized.targetTitle, sanitized.targetIndustry, sanitized.targetRegion].filter(Boolean).join(' | '),
          value_prop: '',
          status: 'onboarding',
          monthly_quota: 100,
          plan: 'trial',
          price: 0,
          onboarding_data: JSON.stringify({
            industry: sanitized.industry,
            companySize: sanitized.companySize,
            targetTitle: sanitized.targetTitle,
            targetIndustry: sanitized.targetIndustry,
            targetRegion: sanitized.targetRegion,
            signup_date: new Date().toISOString(),
            source: 'onboarding_form'
          })
        });
      } catch(e) { console.warn('db.insertClient fallback failed:', e.message); }
    }

    console.log(`🎉 New client signup: ${sanitized.companyName} (${sanitized.email}) → ID ${clientId}`);

    // Log to new-signups.json for heartbeat notification
    const signupsFile = path.join(__dirname, '..', 'data', 'new-signups.json');
    let signups = [];
    try {
      signups = JSON.parse(fs.readFileSync(signupsFile, 'utf8'));
    } catch (e) { /* file doesn't exist yet */ }

    signups.push({
      clientId,
      name: sanitized.name,
      email: sanitized.email,
      company: sanitized.companyName,
      website: sanitized.website,
      industry: sanitized.industry,
      timestamp: new Date().toISOString(),
      notified: false
    });

    fs.writeFileSync(signupsFile, JSON.stringify(signups, null, 2));

    // Also store in leads.json for backwards compat
    const leadsFile = path.join(__dirname, '..', 'data', 'leads.json');
    let leads = [];
    try {
      leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8'));
    } catch (e) { /* file doesn't exist yet */ }
    leads.push({
      name: sanitized.name,
      email: sanitized.email,
      company: sanitized.companyName,
      website: sanitized.website,
      source: 'client_signup',
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2));

    // Generate dashboard token for the new client
    const dashboardToken = generateDashboardToken(clientId, sanitized.email);

    res.json({
      success: true,
      clientId,
      dashboardToken,
      status: 'onboarding',
      message: 'Campaign setup in progress. We\'ll email you within 24 hours with your first leads.'
    });

  } catch (error) {
    console.error('❌ Client signup error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Something went wrong. Please try again or email caesar@promptabusiness.com'
    });
  }
});

// GET /api/clients/:id/status — Public client status lookup (by id or email)
app.get('/api/clients/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { email: queryEmail } = req.query;
    
    // Load clients from JSON file (primary source of truth for this endpoint)
    const clientsFile = path.join(__dirname, '..', 'data', 'clients.json');
    let clients = [];
    try { clients = JSON.parse(fs.readFileSync(clientsFile, 'utf8')); } catch(e) { /* no file */ }

    let client = null;

    // Try by numeric ID first
    if (!isNaN(id)) {
      client = clients.find(c => (c.clientId || c.id) === parseInt(id));
    }

    // Try by email
    if (!client && id.includes('@')) {
      client = clients.find(c => c.email === id.toLowerCase().trim());
    }
    if (!client && queryEmail) {
      client = clients.find(c => c.email === queryEmail.toLowerCase().trim());
    }

    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found. Please check your Client ID or email.'
      });
    }

    // Build response based on status
    let campaignData = {};
    if (client.status === 'onboarding') {
      campaignData = {
        leadsFound: 0,
        emailsSent: 0,
        emailsOpened: 0,
        repliesReceived: 0,
        replyRate: '0%',
        statusMessage: 'Your campaign is being set up. We\'re researching your ideal prospects and crafting personalized sequences.',
        nextStep: 'Expect your first leads within 24-48 hours.'
      };
    } else if (client.status === 'active') {
      campaignData = {
        leadsFound: client.leadsFound || 0,
        emailsSent: client.emailsSent || 0,
        emailsOpened: client.emailsOpened || 0,
        repliesReceived: client.repliesReceived || 0,
        replyRate: client.emailsSent > 0 
          ? (((client.repliesReceived || 0) / client.emailsSent) * 100).toFixed(1) + '%' 
          : '0%',
        statusMessage: 'Your campaign is live and sending.',
        nextStep: 'Check back daily for new replies and leads.'
      };
    } else if (client.status === 'paused') {
      campaignData = {
        leadsFound: client.leadsFound || 0,
        emailsSent: client.emailsSent || 0,
        emailsOpened: client.emailsOpened || 0,
        repliesReceived: client.repliesReceived || 0,
        replyRate: '0%',
        statusMessage: 'Your campaign is paused.',
        nextStep: 'Contact us to resume your campaign.'
      };
    } else {
      campaignData = {
        leadsFound: 0,
        emailsSent: 0,
        emailsOpened: 0,
        repliesReceived: 0,
        replyRate: '0%',
        statusMessage: 'Setting things up...',
        nextStep: 'We\'ll be in touch shortly.'
      };
    }

    res.json({
      success: true,
      client: {
        id: client.clientId || client.id,
        company: client.company,
        name: client.name,
        status: client.status,
        plan: client.plan || 'trial',
        signupDate: client.signupDate || client.signup_date || new Date().toISOString(),
        industry: client.industry || ''
      },
      campaign: campaignData
    });

  } catch (error) {
    console.error('❌ Client status error:', error.message);
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
});

// GET /api/clients/lookup/:email — Lookup by email (convenience endpoint)
app.get('/api/clients/lookup/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email' });
    }

    const clientsFile = path.join(__dirname, '..', 'data', 'clients.json');
    let clients = [];
    try { clients = JSON.parse(fs.readFileSync(clientsFile, 'utf8')); } catch(e) {}

    const client = clients.find(c => c.email === email);
    if (!client) {
      return res.status(404).json({ success: false, error: 'No account found with that email.' });
    }

    res.redirect(`/api/clients/${client.clientId || client.id}/status`);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
});

// Lead tracking endpoint (for signup form before payment) - with validation
app.post('/api/leads', async (req, res) => {
  try {
    const { name, email, company, website, pain_point, target_audience } = req.body;
    
    // Validate email at minimum
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email' });
    }
    
    // Log the lead (sanitized)
    const safeEmail = email.toLowerCase().trim();
    const safeCompany = escapeHtml((company || '').slice(0, 100));
    console.log(`📥 New lead: ${safeEmail} (${safeCompany})`);
    
    // Store in leads.json (simple file-based storage)
    const leadsDir = path.join(__dirname, '..', 'data');
    const leadsFile = path.join(leadsDir, 'leads.json');
    let leads = [];
    try {
      leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8'));
    } catch (e) {
      // File doesn't exist yet
    }
    
    leads.push({
      name: escapeHtml((name || '').slice(0, 100)),
      email: safeEmail,
      company: safeCompany,
      website: (website || '').slice(0, 200),
      pain_point: escapeHtml((pain_point || '').slice(0, 500)),
      target_audience: escapeHtml((target_audience || '').slice(0, 500)),
      source: 'signup_form',
      timestamp: new Date().toISOString()
    });
    
    fs.mkdirSync(leadsDir, { recursive: true });
    fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2));
    
    res.json({ success: true, message: 'Lead captured' });
  } catch (error) {
    console.error('Lead capture error:', error.message);
    res.json({ success: true }); // Don't block user flow
  }
});

// Dashboard API - New modern dashboard data endpoint (REQUIRES AUTH)
app.get('/api/dashboard/:clientId', authMiddleware, async (req, res) => {
  try {
    const { clientId } = req.params;
    
    // Verify client can only access their own dashboard
    if (parseInt(clientId) !== req.clientId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const data = await dashboardApi.getDashboardData(clientId);
    res.json(data);
  } catch (error) {
    console.error('❌ Dashboard API error:', error.message);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// Serve dashboard for a client (REQUIRES AUTH via token query param)
app.get('/dashboard/:clientId', authMiddleware, (req, res) => {
  const clientId = parseInt(req.params.clientId);
  
  // Verify client can only access their own dashboard
  if (clientId !== req.clientId) {
    return res.status(403).send('Access denied');
  }
  
  // Get client (already verified in authMiddleware)
  const client = req.client;
  
  // Get stats
  const stats = db.getEmailStats(clientId);
  
  // Get recent emails
  const recentEmails = db.getRecentEmails(clientId, 20);
  
  // Get replies
  const replies = db.getReplies(clientId, 10);
  
  const openRate = stats.total_sent > 0 
    ? ((stats.opened / stats.total_sent) * 100).toFixed(1)
    : 0;
  
  const replyRate = stats.total_sent > 0
    ? ((stats.replied / stats.total_sent) * 100).toFixed(1)
    : 0;
  
  // Render HTML dashboard (with XSS protection)
  const safeCompany = escapeHtml(client.company);
  const safeName = escapeHtml(client.name);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${safeCompany} - Caesar's Legions Dashboard</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #0a0a0a;
          color: #e0e0e0;
          padding: 40px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { 
          font-size: 32px; 
          margin-bottom: 8px;
          color: #fff;
        }
        .subtitle { 
          color: #888; 
          margin-bottom: 40px;
          font-size: 14px;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }
        .stat-card {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 24px;
        }
        .stat-value {
          font-size: 36px;
          font-weight: bold;
          color: #fff;
          margin-bottom: 8px;
        }
        .stat-label {
          color: #888;
          font-size: 14px;
        }
        .section {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 20px;
        }
        h2 {
          font-size: 20px;
          margin-bottom: 20px;
          color: #fff;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          text-align: left;
          padding: 12px;
          border-bottom: 1px solid #333;
        }
        th {
          color: #888;
          font-weight: 500;
          font-size: 12px;
          text-transform: uppercase;
        }
        td {
          color: #e0e0e0;
          font-size: 14px;
        }
        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }
        .badge-success { background: #1a3d1a; color: #4ade80; }
        .badge-neutral { background: #1a1a1a; color: #888; }
        .reply-box {
          background: #0a0a0a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
        }
        .reply-meta {
          color: #888;
          font-size: 12px;
          margin-bottom: 8px;
        }
        .reply-body {
          color: #e0e0e0;
          line-height: 1.5;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🏛️ Caesar's Legions</h1>
        <div class="subtitle">${safeCompany} Campaign Dashboard</div>
        
        <div class="stats">
          <div class="stat-card">
            <div class="stat-value">${stats.total_sent}</div>
            <div class="stat-label">Emails Sent</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${openRate}%</div>
            <div class="stat-label">Open Rate</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${replyRate}%</div>
            <div class="stat-label">Reply Rate</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.replied}</div>
            <div class="stat-label">Replies</div>
          </div>
        </div>
        
        ${replies.length > 0 ? `
        <div class="section">
          <h2>📬 Recent Replies</h2>
          ${replies.map(r => `
            <div class="reply-box">
              <div class="reply-meta">
                <strong>${r.first_name} ${r.last_name}</strong> from ${r.company}
                · ${new Date(r.received_at * 1000).toLocaleDateString()}
              </div>
              <div class="reply-body">${r.body.substring(0, 200)}...</div>
            </div>
          `).join('')}
        </div>
        ` : ''}
        
        <div class="section">
          <h2>📧 Recent Emails</h2>
          <table>
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Subject</th>
                <th>Sent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${recentEmails.map(e => `
                <tr>
                  <td>
                    <div><strong>${e.first_name} ${e.last_name}</strong></div>
                    <div style="color: #666; font-size: 12px;">${e.company}</div>
                  </td>
                  <td>${e.subject}</td>
                  <td>${new Date(e.sent_at * 1000).toLocaleDateString()}</td>
                  <td>
                    ${e.replied ? '<span class="badge badge-success">Replied</span>' : 
                      e.opened ? '<span class="badge badge-neutral">Opened</span>' :
                      '<span class="badge badge-neutral">Sent</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </body>
    </html>
  `);
});

// List all clients
app.get('/', (req, res) => {
  const clients = db ? db.getAllClients().sort((a, b) => b.created_at - a.created_at) : [];
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Caesar's Legions - Clients</title>
      <style>
        body { 
          font-family: sans-serif; 
          padding: 40px; 
          background: #0a0a0a; 
          color: #e0e0e0;
        }
        h1 { color: #fff; margin-bottom: 20px; }
        a { 
          color: #4ade80; 
          text-decoration: none;
          display: block;
          padding: 16px;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          margin-bottom: 12px;
        }
        a:hover { background: #252525; }
      </style>
    </head>
    <body>
      <h1>🏛️ Caesar's Legions - Clients</h1>
      ${clients.map(c => `
        <a href="/dashboard/${c.id}">
          <strong>${c.company}</strong> (${c.name})
        </a>
      `).join('')}
      ${clients.length === 0 ? '<p>No clients yet. Run: node scripts/onboard-client.js</p>' : ''}
    </body>
    </html>
  `);
});

// =============================================================================
// MAKHLAB SIGNUP ENDPOINTS
// =============================================================================

const MAKHLAB_DATA_DIR = path.join(__dirname, '..', 'data');
const MAKHLAB_SIGNUPS_FILE = path.join(MAKHLAB_DATA_DIR, 'makhlab-signups.json');
const MAKHLAB_NEW_SIGNUPS_FILE = path.join(MAKHLAB_DATA_DIR, 'makhlab-new-signups.json');

function loadMakhlabSignups() {
  try { return JSON.parse(fs.readFileSync(MAKHLAB_SIGNUPS_FILE, 'utf8')); } catch(e) { return []; }
}

function saveMakhlabSignups(signups) {
  fs.mkdirSync(MAKHLAB_DATA_DIR, { recursive: true });
  fs.writeFileSync(MAKHLAB_SIGNUPS_FILE, JSON.stringify(signups, null, 2));
}

function loadMakhlabNewSignups() {
  try { return JSON.parse(fs.readFileSync(MAKHLAB_NEW_SIGNUPS_FILE, 'utf8')); } catch(e) { return []; }
}

function saveMakhlabNewSignups(signups) {
  fs.mkdirSync(MAKHLAB_DATA_DIR, { recursive: true });
  fs.writeFileSync(MAKHLAB_NEW_SIGNUPS_FILE, JSON.stringify(signups, null, 2));
}

function generateMakhlabId() {
  return 'makhlab_' + crypto.randomBytes(6).toString('hex');
}

// POST /api/makhlab/signup — New Makhlab customer signup
app.post('/api/makhlab/signup', async (req, res) => {
  try {
    const {
      plan, billing, name, email, businessName, businessType,
      language, personality, assistantName, tasks, paymentMethod
    } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Name is required (min 2 chars)', errorAr: 'الاسم مطلوب (حرفين على الأقل)' });
    }
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ success: false, error: 'Valid email is required', errorAr: 'البريد الإلكتروني غير صالح' });
    }
    if (!businessName || typeof businessName !== 'string' || businessName.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Business name is required (min 2 chars)', errorAr: 'اسم النشاط التجاري مطلوب' });
    }
    if (!businessType || !['restaurant', 'ecommerce', 'realestate', 'services', 'other'].includes(businessType)) {
      return res.status(400).json({ success: false, error: 'Valid business type is required', errorAr: 'نوع النشاط التجاري مطلوب' });
    }
    if (!plan || !['free', 'starter', 'professional', 'enterprise', 'pro', 'max'].includes(plan)) {
      return res.status(400).json({ success: false, error: 'Valid plan is required', errorAr: 'يرجى اختيار خطة صالحة' });
    }

    // Sanitize all inputs
    const sanitized = {
      plan: plan,
      billing: ['monthly', 'yearly', 'free_trial'].includes(billing) ? billing : 'monthly',
      name: escapeHtml(name.trim().slice(0, 100)),
      email: email.toLowerCase().trim(),
      businessName: escapeHtml(businessName.trim().slice(0, 150)),
      businessType: businessType,
      language: ['ar', 'en', 'fr', 'bilingual'].includes(language) ? language : 'ar',
      personality: ['friendly', 'professional', 'casual'].includes(personality) ? personality : 'friendly',
      assistantName: escapeHtml((assistantName || '').trim().slice(0, 50)),
      tasks: Array.isArray(tasks) ? tasks.filter(t => ['questions', 'orders', 'appointments', 'support'].includes(t)) : [],
      paymentMethod: ['free', 'montypay', 'bitcoin', 'whish'].includes(paymentMethod) ? paymentMethod : 'montypay'
    };

    // Load existing signups
    const signups = loadMakhlabSignups();

    // Check for duplicate email
    const existing = signups.find(s => s.email === sanitized.email);
    if (existing) {
      return res.json({
        success: true,
        signupId: existing.signupId,
        message: 'لديك طلب مسجل بالفعل! سنتواصل معك قريباً.',
        messageEn: 'You already have a signup on file! We\'ll be in touch soon.',
        existing: true
      });
    }

    // Generate unique ID
    const signupId = generateMakhlabId();

    // Calculate trial expiry for free plan
    const isTrial = sanitized.plan === 'free';
    const trialExpiry = isTrial ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;

    const record = {
      signupId,
      ...sanitized,
      status: isTrial ? 'trial' : 'pending_payment',
      trialExpiry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provisioned: false,
      botToken: null,
      botUsername: null
    };

    // Save to main signups file
    signups.push(record);
    saveMakhlabSignups(signups);

    // Log to new-signups file for Caesar's heartbeat pickup
    const newSignups = loadMakhlabNewSignups();
    newSignups.push({
      signupId,
      name: sanitized.name,
      email: sanitized.email,
      businessName: sanitized.businessName,
      businessType: sanitized.businessType,
      plan: sanitized.plan,
      paymentMethod: sanitized.paymentMethod,
      timestamp: new Date().toISOString(),
      notified: false,
      provisioned: false
    });
    saveMakhlabNewSignups(newSignups);

    console.log(`🧪 Makhlab signup: ${sanitized.businessName} (${sanitized.email}) → ${signupId} [${sanitized.plan}]`);

    // 🔔 INSTANT Telegram notification to Kareem
    const notifyBot = process.env.MAKHLAB_NOTIFY_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const notifyChatId = process.env.TELEGRAM_CHAT_ID || '7189807915';
    if (notifyBot) {
      const alertMsg = `🚨🚨🚨 NEW MAKHLAB SIGNUP! 🚨🚨🚨\n\n🏪 Business: ${sanitized.businessName}\n👤 Owner: ${sanitized.name}\n📧 Email: ${sanitized.email}\n🏷️ Type: ${sanitized.businessType}\n💰 Plan: ${sanitized.plan}\n🆔 ID: ${signupId}\n\n⏳ Status: Pending provisioning`;
      fetch(`https://api.telegram.org/bot${notifyBot}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: notifyChatId, text: alertMsg })
      }).catch(e => console.error('Telegram notify failed:', e.message));
    }

    res.json({
      success: true,
      signupId,
      message: 'تم استلام طلبك! سنرسل لك رابط المساعد خلال دقائق.',
      messageEn: 'Request received! We\'ll send you your assistant link within minutes.'
    });

  } catch (error) {
    console.error('❌ Makhlab signup error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Something went wrong. Please try again.',
      errorAr: 'حدث خطأ. يرجى المحاولة مرة أخرى.'
    });
  }
});

// GET /api/makhlab/signups — List all Makhlab signups (for Caesar to check)
app.get('/api/makhlab/signups', (req, res) => {
  try {
    const signups = loadMakhlabSignups();
    res.json({
      success: true,
      count: signups.length,
      signups: signups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    });
  } catch (error) {
    console.error('❌ Makhlab signups list error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load signups' });
  }
});

// GET /api/makhlab/signup/:id — Get a specific Makhlab signup by ID
app.get('/api/makhlab/signup/:id', (req, res) => {
  try {
    const { id } = req.params;
    const signups = loadMakhlabSignups();
    const signup = signups.find(s => s.signupId === id);

    if (!signup) {
      return res.status(404).json({ success: false, error: 'Signup not found', errorAr: 'لم يتم العثور على الطلب' });
    }

    res.json({ success: true, signup });
  } catch (error) {
    console.error('❌ Makhlab signup lookup error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load signup' });
  }
});

// =============================================================================
// MUBYN OS ENDPOINTS
// =============================================================================
try {
  const mubynRoutes = require('../lib/mubyn-routes');
  app.use('/api', mubynRoutes);
  console.log('✅ Mubyn OS routes mounted at /api');
} catch(e) { console.warn('⚠️ Mubyn routes unavailable:', e.message); }

// =============================================================================

// GET /site/:subdomain — Serve published websites
app.get('/site/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;
    const mappingFile = path.join(__dirname, '..', 'data', 'websites', '_published', 'subdomain-map.json');
    let mapping = {};
    try { mapping = JSON.parse(require('fs').readFileSync(mappingFile, 'utf8')); } catch(e) {}
    const userId = mapping[subdomain];
    if (!userId) return res.status(404).send('<!DOCTYPE html><html><head><title>Site Not Found</title><style>body{font-family:Inter,sans-serif;background:#0B0B0F;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;}a{color:#D4A843;}</style></head><body><div><h1>Site Not Found</h1><p><a href="https://mubyn.com">Build yours with Mubyn →</a></p></div></body></html>');
    const html = require('fs').readFileSync(path.join(__dirname, '..', 'data', 'websites', userId, 'index.html'), 'utf8');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (error) { res.status(500).send('<html><body><h1>Error loading site</h1></body></html>'); }
});

app.listen(PORT, () => {
  console.log(`\n🏛️  Caesar's Legions Dashboard running on http://localhost:${PORT}`);
  console.log(`   🚀 Mubyn OS endpoints ready at /api!`);
  console.log(`   ✅ Build: 2026-02-11-1745\n`);
});
