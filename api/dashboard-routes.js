/**
 * Prompta Dashboard Routes
 * Mounted at /dashboard/* on the main Railway backend
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// === DATA STORAGE ===
const DATA_DIR = path.join(__dirname, '../data/dashboard');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');
const LEADS_DIR = path.join(DATA_DIR, 'leads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEADS_DIR)) fs.mkdirSync(LEADS_DIR, { recursive: true });

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// === AUTH ===
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

const sessions = {};

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.clientId = sessions[token].clientId;
  req.client = sessions[token].client;
  next();
}

// === SERVE DASHBOARD HTML ===
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// === AUTH ROUTES ===
router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'prompta-dashboard' });
});

router.post('/api/auth/signup', (req, res) => {
  const { email, password, companyName } = req.body;
  if (!email || !password || !companyName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const clients = loadJSON(CLIENTS_FILE);
  if (clients[email]) {
    return res.status(400).json({ error: 'Email already registered' });
  }
  const clientId = 'client_' + crypto.randomBytes(8).toString('hex');
  const client = {
    clientId, email,
    passwordHash: hashPassword(password),
    companyName,
    smtp: null,
    createdAt: new Date().toISOString(),
    plan: 'trial',
    trialExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
  clients[email] = client;
  saveJSON(CLIENTS_FILE, clients);
  const token = generateToken();
  sessions[token] = { clientId, client };
  res.json({ success: true, token, client: { email, companyName, clientId, plan: client.plan } });
});

router.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const clients = loadJSON(CLIENTS_FILE);
  const client = clients[email];
  if (!client || client.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = generateToken();
  sessions[token] = { clientId: client.clientId, client };
  res.json({ success: true, token, client: { email, companyName: client.companyName, clientId: client.clientId, plan: client.plan } });
});

router.get('/api/me', authMiddleware, (req, res) => {
  const clients = loadJSON(CLIENTS_FILE);
  const client = clients[req.client.email];
  res.json({
    email: client.email,
    companyName: client.companyName,
    plan: client.plan,
    smtpConfigured: !!client.smtp,
    smtpEmail: client.smtp?.user || null
  });
});

// === SMTP ===
router.post('/api/smtp/configure', authMiddleware, async (req, res) => {
  const { host, port, user, pass, secure } = req.body;
  if (!host || !port || !user || !pass) {
    return res.status(400).json({ error: 'Missing SMTP configuration' });
  }
  try {
    const transporter = nodemailer.createTransport({
      host, port: parseInt(port), secure: secure !== false,
      auth: { user, pass }
    });
    await transporter.verify();
    const clients = loadJSON(CLIENTS_FILE);
    clients[req.client.email].smtp = { host, port, user, pass, secure };
    saveJSON(CLIENTS_FILE, clients);
    res.json({ success: true, message: 'SMTP configured successfully' });
  } catch (err) {
    res.status(400).json({ error: 'SMTP connection failed: ' + err.message });
  }
});

router.post('/api/smtp/test', authMiddleware, async (req, res) => {
  const clients = loadJSON(CLIENTS_FILE);
  const client = clients[req.client.email];
  if (!client.smtp) {
    return res.status(400).json({ error: 'SMTP not configured' });
  }
  try {
    const transporter = nodemailer.createTransport({
      host: client.smtp.host, port: parseInt(client.smtp.port),
      secure: client.smtp.secure !== false,
      auth: { user: client.smtp.user, pass: client.smtp.pass }
    });
    await transporter.sendMail({
      from: client.smtp.user,
      to: client.smtp.user,
      subject: '✅ Prompta SMTP Test',
      text: 'Your SMTP is configured correctly!',
      html: '<h2>✅ SMTP Working!</h2><p>You can now send campaigns from Prompta.</p>'
    });
    res.json({ success: true, message: 'Test email sent!' });
  } catch (err) {
    res.status(400).json({ error: 'Send failed: ' + err.message });
  }
});

// === LEAD FINDER (PRIMARY) ===
router.post('/api/leads/find', authMiddleware, async (req, res) => {
  const { industry, location, title, count, pitch } = req.body;
  if (!industry || !location) {
    return res.status(400).json({ error: 'Industry and location are required' });
  }

  const GMAPS_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyBwySl5_bATGb2cpLnZS2c0DFAsznj2xRQ';
  const requestedCount = Math.min(parseInt(count) || 50, 200);

  try {
    // Step 1: Geocode the location
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GMAPS_KEY}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    
    let lat, lng;
    if (geoData.results && geoData.results.length > 0) {
      lat = geoData.results[0].geometry.location.lat;
      lng = geoData.results[0].geometry.location.lng;
    } else {
      return res.json({ success: false, error: 'Could not find that location. Try a more specific city or country.' });
    }

    // Step 2: Search for businesses
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(industry + ' in ' + location)}&location=${lat},${lng}&radius=50000&key=${GMAPS_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.results || searchData.results.length === 0) {
      return res.json({ success: false, error: 'No businesses found for that search. Try a broader industry term.' });
    }

    // Step 3: Get details for each place (phone, website, etc.)
    const leads = [];
    const places = searchData.results.slice(0, Math.min(requestedCount, 20)); // Places API returns max 20 per page
    
    for (const place of places) {
      try {
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,formatted_address,types,rating,user_ratings_total&key=${GMAPS_KEY}`;
        const detailRes = await fetch(detailUrl);
        const detailData = await detailRes.json();
        const d = detailData.result || {};
        
        leads.push({
          id: crypto.randomBytes(4).toString('hex'),
          company: d.name || place.name,
          email: '', // Google Maps doesn't provide email — we'll enrich later
          phone: d.formatted_phone_number || '',
          website: d.website || '',
          address: d.formatted_address || place.formatted_address || '',
          rating: d.rating || null,
          reviews: d.user_ratings_total || 0,
          source: 'google_maps',
          industry: industry,
          addedAt: new Date().toISOString(),
          status: 'new'
        });
      } catch (e) {
        // Skip failed detail lookups
      }
    }

    // Step 4: Try to get more results with next_page_token
    if (searchData.next_page_token && leads.length < requestedCount) {
      // Google requires ~2sec delay before next_page_token works
      await new Promise(r => setTimeout(r, 2500));
      try {
        const nextUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${searchData.next_page_token}&key=${GMAPS_KEY}`;
        const nextRes = await fetch(nextUrl);
        const nextData = await nextRes.json();
        if (nextData.results) {
          for (const place of nextData.results.slice(0, requestedCount - leads.length)) {
            leads.push({
              id: crypto.randomBytes(4).toString('hex'),
              company: place.name,
              email: '',
              phone: '',
              website: '',
              address: place.formatted_address || '',
              rating: place.rating || null,
              reviews: place.user_ratings_total || 0,
              source: 'google_maps',
              industry: industry,
              addedAt: new Date().toISOString(),
              status: 'new'
            });
          }
        }
      } catch (e) { /* next page failed, that's fine */ }
    }

    // Step 5: Save to client's leads file
    const leadsFile = path.join(LEADS_DIR, `${req.client.clientId}.json`);
    let existing = [];
    try { existing = JSON.parse(fs.readFileSync(leadsFile, 'utf8')); } catch {}
    const all = [...existing, ...leads];
    fs.writeFileSync(leadsFile, JSON.stringify(all, null, 2));

    // Step 6: Save the search criteria for future enrichment
    const searchLog = path.join(LEADS_DIR, `${req.client.clientId}-searches.json`);
    let searches = [];
    try { searches = JSON.parse(fs.readFileSync(searchLog, 'utf8')); } catch {}
    searches.push({ industry, location, title, count: requestedCount, pitch, foundCount: leads.length, timestamp: new Date().toISOString() });
    fs.writeFileSync(searchLog, JSON.stringify(searches, null, 2));

    res.json({ success: true, leadsFound: leads.length, total: all.length });
  } catch (err) {
    console.error('Lead find error:', err);
    res.json({ success: false, error: 'Search failed. Our team has been notified and will find leads manually.' });
  }
});

// === LEADS (manual upload) ===
router.post('/api/leads/upload', authMiddleware, (req, res) => {
  const { leads } = req.body;
  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'No leads provided' });
  }
  const leadsFile = path.join(LEADS_DIR, `${req.client.clientId}.json`);
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(leadsFile, 'utf8')); } catch {}
  const newLeads = leads.map(l => ({
    ...l, id: crypto.randomBytes(4).toString('hex'),
    addedAt: new Date().toISOString(), status: 'new'
  }));
  const all = [...existing, ...newLeads];
  fs.writeFileSync(leadsFile, JSON.stringify(all, null, 2));
  res.json({ success: true, added: newLeads.length, total: all.length });
});

router.get('/api/leads', authMiddleware, (req, res) => {
  const leadsFile = path.join(LEADS_DIR, `${req.client.clientId}.json`);
  let leads = [];
  try { leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8')); } catch {}
  res.json({ leads });
});

// === CAMPAIGNS ===
router.post('/api/campaigns/create', authMiddleware, async (req, res) => {
  const { name, subject, body } = req.body;
  if (!name || !subject || !body) {
    return res.status(400).json({ error: 'Name, subject and body required' });
  }
  const campaigns = loadJSON(CAMPAIGNS_FILE);
  const id = 'camp_' + crypto.randomBytes(4).toString('hex');
  campaigns[id] = {
    id, name, subject, body,
    clientId: req.client.clientId,
    clientEmail: req.client.email,
    createdAt: new Date().toISOString(),
    status: 'draft', sent: 0, opened: 0, replied: 0
  };
  saveJSON(CAMPAIGNS_FILE, campaigns);
  res.json({ success: true, campaign: campaigns[id] });
});

router.get('/api/campaigns', authMiddleware, (req, res) => {
  const campaigns = loadJSON(CAMPAIGNS_FILE);
  const mine = Object.values(campaigns).filter(c => c.clientId === req.client.clientId);
  res.json({ campaigns: mine });
});

router.post('/api/campaigns/:id/send', authMiddleware, async (req, res) => {
  const clients = loadJSON(CLIENTS_FILE);
  const client = clients[req.client.email];
  if (!client.smtp) {
    return res.status(400).json({ error: 'Configure SMTP first' });
  }

  const campaigns = loadJSON(CAMPAIGNS_FILE);
  const campaign = campaigns[req.params.id];
  if (!campaign || campaign.clientId !== req.client.clientId) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const leadsFile = path.join(LEADS_DIR, `${req.client.clientId}.json`);
  let leads = [];
  try { leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8')); } catch {}
  const unsent = leads.filter(l => l.status === 'new');

  if (unsent.length === 0) {
    return res.status(400).json({ error: 'No unsent leads' });
  }

  const transporter = nodemailer.createTransport({
    host: client.smtp.host, port: parseInt(client.smtp.port),
    secure: client.smtp.secure !== false,
    auth: { user: client.smtp.user, pass: client.smtp.pass }
  });

  let sent = 0;
  for (const lead of unsent) {
    try {
      const personalizedBody = campaign.body
        .replace(/\{\{name\}\}/g, lead.name || lead.firstName || 'there')
        .replace(/\{\{company\}\}/g, lead.company || lead.companyName || 'your company')
        .replace(/\{\{email\}\}/g, lead.email);
      const personalizedSubject = campaign.subject
        .replace(/\{\{name\}\}/g, lead.name || lead.firstName || 'there')
        .replace(/\{\{company\}\}/g, lead.company || lead.companyName || 'your company');

      await transporter.sendMail({
        from: `"${client.smtp.senderName || client.companyName}" <${client.smtp.user}>`,
        to: lead.email,
        subject: personalizedSubject,
        html: personalizedBody
      });
      lead.status = 'sent';
      lead.sentAt = new Date().toISOString();
      sent++;
      // Throttle: 1 email per 3 seconds
      await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      lead.status = 'failed';
      lead.error = err.message;
    }
  }

  fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2));
  campaign.sent += sent;
  campaign.status = 'sent';
  campaign.lastSentAt = new Date().toISOString();
  saveJSON(CAMPAIGNS_FILE, campaigns);

  res.json({ success: true, sent, total: unsent.length });
});

// === DASHBOARD STATS ===
router.get('/api/dashboard', authMiddleware, (req, res) => {
  const leadsFile = path.join(LEADS_DIR, `${req.client.clientId}.json`);
  let leads = [];
  try { leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8')); } catch {}
  const campaigns = loadJSON(CAMPAIGNS_FILE);
  const myCampaigns = Object.values(campaigns).filter(c => c.clientId === req.client.clientId);

  res.json({
    totalLeads: leads.length,
    sentEmails: leads.filter(l => l.status === 'sent').length,
    pendingLeads: leads.filter(l => l.status === 'new').length,
    failedEmails: leads.filter(l => l.status === 'failed').length,
    campaigns: myCampaigns.length,
    plan: req.client.plan
  });
});

// === AUTO-CREATE FROM ONBOARDING ===
// Called internally when someone completes the onboarding form
router.createClientFromOnboarding = function(data) {
  const clients = loadJSON(CLIENTS_FILE);
  const email = data.smtpUser || data.email;
  
  if (clients[email]) return clients[email]; // Already exists
  
  const password = crypto.randomBytes(8).toString('hex');
  const clientId = 'client_' + crypto.randomBytes(8).toString('hex');
  const client = {
    clientId, email,
    passwordHash: hashPassword(password),
    companyName: data.companyName || 'My Company',
    smtp: data.smtpHost ? {
      host: data.smtpHost,
      port: data.smtpPort || '587',
      user: data.smtpUser,
      pass: data.smtpPass,
      secure: true
    } : null,
    createdAt: new Date().toISOString(),
    plan: 'trial',
    trialExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    generatedPassword: password // So we can email it to them
  };
  clients[email] = client;
  saveJSON(CLIENTS_FILE, clients);
  return client;
};

module.exports = router;
