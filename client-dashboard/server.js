/**
 * Prompta Client Dashboard - Self-Serve Cold Email Platform
 * 
 * Clients:
 * - Sign up / login
 * - Connect their own SMTP (domain email)
 * - Upload leads (CSV or paste)
 * - AI generates personalized emails
 * - Send campaigns from their domain
 * - Track opens/replies
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === DATA STORAGE ===
const DATA_DIR = path.join(__dirname, 'data');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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

// Simple session store (in-memory for now)
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

// === ROUTES ===

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'prompta-dashboard' });
});

// Sign up
app.post('/api/auth/signup', (req, res) => {
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
    clientId,
    email,
    passwordHash: hashPassword(password),
    companyName,
    smtp: null, // Will be configured later
    createdAt: new Date().toISOString(),
    plan: 'trial',
    trialExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };

  clients[email] = client;
  saveJSON(CLIENTS_FILE, clients);

  const token = generateToken();
  sessions[token] = { clientId, client };

  res.json({ 
    success: true, 
    token, 
    client: { email, companyName, clientId, plan: client.plan } 
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const clients = loadJSON(CLIENTS_FILE);
  const client = clients[email];

  if (!client || client.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken();
  sessions[token] = { clientId: client.clientId, client };

  res.json({ 
    success: true, 
    token, 
    client: { 
      email, 
      companyName: client.companyName, 
      clientId: client.clientId,
      plan: client.plan,
      smtpConfigured: !!client.smtp
    } 
  });
});

// Get current client
app.get('/api/me', authMiddleware, (req, res) => {
  const clients = loadJSON(CLIENTS_FILE);
  const client = clients[req.client.email];
  res.json({
    email: client.email,
    companyName: client.companyName,
    clientId: client.clientId,
    plan: client.plan,
    smtpConfigured: !!client.smtp,
    smtpEmail: client.smtp?.user || null
  });
});

// Configure SMTP
app.post('/api/smtp/configure', authMiddleware, async (req, res) => {
  const { host, port, user, pass, secure } = req.body;
  
  if (!host || !port || !user || !pass) {
    return res.status(400).json({ error: 'Missing SMTP configuration' });
  }

  // Test the SMTP connection
  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: secure !== false,
      auth: { user, pass }
    });

    await transporter.verify();

    // Save to client
    const clients = loadJSON(CLIENTS_FILE);
    clients[req.client.email].smtp = { host, port, user, pass, secure };
    saveJSON(CLIENTS_FILE, clients);

    res.json({ success: true, message: 'SMTP configured successfully' });
  } catch (err) {
    res.status(400).json({ error: 'SMTP connection failed: ' + err.message });
  }
});

// Test SMTP (send test email)
app.post('/api/smtp/test', authMiddleware, async (req, res) => {
  const clients = loadJSON(CLIENTS_FILE);
  const client = clients[req.client.email];

  if (!client.smtp) {
    return res.status(400).json({ error: 'SMTP not configured' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: client.smtp.host,
      port: parseInt(client.smtp.port),
      secure: client.smtp.secure !== false,
      auth: { user: client.smtp.user, pass: client.smtp.pass }
    });

    await transporter.sendMail({
      from: client.smtp.user,
      to: client.email,
      subject: 'Prompta Test Email',
      text: 'Your SMTP is configured correctly! You can now send campaigns.',
      html: '<h2>🎉 SMTP Working!</h2><p>Your email is configured correctly. You can now send campaigns from Prompta.</p>'
    });

    res.json({ success: true, message: 'Test email sent to ' + client.email });
  } catch (err) {
    res.status(400).json({ error: 'Failed to send test email: ' + err.message });
  }
});

// Upload leads (CSV or JSON array)
app.post('/api/leads/upload', authMiddleware, (req, res) => {
  const { leads } = req.body; // Array of { email, firstName, lastName, company, ... }
  
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'No leads provided' });
  }

  // Validate leads have at least email
  const validLeads = leads.filter(l => l.email && l.email.includes('@'));
  
  // Save to client's leads file
  const leadsFile = path.join(DATA_DIR, `leads_${req.clientId}.json`);
  const existingLeads = loadJSON(leadsFile);
  const timestamp = Date.now();
  
  validLeads.forEach(lead => {
    existingLeads[lead.email] = {
      ...lead,
      addedAt: new Date().toISOString(),
      status: 'new'
    };
  });

  saveJSON(leadsFile, existingLeads);

  res.json({ 
    success: true, 
    added: validLeads.length, 
    invalid: leads.length - validLeads.length,
    total: Object.keys(existingLeads).length 
  });
});

// Get leads
app.get('/api/leads', authMiddleware, (req, res) => {
  const leadsFile = path.join(DATA_DIR, `leads_${req.clientId}.json`);
  const leads = loadJSON(leadsFile);
  res.json({ leads: Object.values(leads), count: Object.keys(leads).length });
});

// Create campaign
app.post('/api/campaigns/create', authMiddleware, async (req, res) => {
  const { name, subject, body, leadEmails, schedule } = req.body;
  
  if (!name || !subject || !body) {
    return res.status(400).json({ error: 'Missing campaign details' });
  }

  const clients = loadJSON(CLIENTS_FILE);
  const client = clients[req.client.email];

  if (!client.smtp) {
    return res.status(400).json({ error: 'Configure SMTP first' });
  }

  const campaignId = 'campaign_' + crypto.randomBytes(8).toString('hex');
  const campaign = {
    campaignId,
    clientId: req.clientId,
    name,
    subject,
    body,
    leadEmails: leadEmails || [],
    schedule: schedule || 'immediate',
    status: 'draft',
    createdAt: new Date().toISOString(),
    stats: { sent: 0, opened: 0, replied: 0, bounced: 0 }
  };

  const campaigns = loadJSON(CAMPAIGNS_FILE);
  campaigns[campaignId] = campaign;
  saveJSON(CAMPAIGNS_FILE, campaigns);

  res.json({ success: true, campaignId, campaign });
});

// List campaigns
app.get('/api/campaigns', authMiddleware, (req, res) => {
  const campaigns = loadJSON(CAMPAIGNS_FILE);
  const clientCampaigns = Object.values(campaigns)
    .filter(c => c.clientId === req.clientId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({ campaigns: clientCampaigns });
});

// Send campaign
app.post('/api/campaigns/:id/send', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const campaigns = loadJSON(CAMPAIGNS_FILE);
  const campaign = campaigns[id];

  if (!campaign || campaign.clientId !== req.clientId) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const clients = loadJSON(CLIENTS_FILE);
  const client = clients[req.client.email];

  if (!client.smtp) {
    return res.status(400).json({ error: 'SMTP not configured' });
  }

  // Get leads for this campaign
  const leadsFile = path.join(DATA_DIR, `leads_${req.clientId}.json`);
  const allLeads = loadJSON(leadsFile);
  
  let targetLeads;
  if (campaign.leadEmails && campaign.leadEmails.length > 0) {
    targetLeads = campaign.leadEmails.map(email => allLeads[email]).filter(Boolean);
  } else {
    targetLeads = Object.values(allLeads).filter(l => l.status === 'new');
  }

  if (targetLeads.length === 0) {
    return res.status(400).json({ error: 'No leads to send to' });
  }

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: client.smtp.host,
    port: parseInt(client.smtp.port),
    secure: client.smtp.secure !== false,
    auth: { user: client.smtp.user, pass: client.smtp.pass }
  });

  // Send emails (with throttling)
  let sent = 0;
  let failed = 0;

  for (const lead of targetLeads) {
    try {
      // Personalize email
      let personalizedSubject = campaign.subject
        .replace(/{{firstName}}/g, lead.firstName || '')
        .replace(/{{lastName}}/g, lead.lastName || '')
        .replace(/{{company}}/g, lead.company || '');
      
      let personalizedBody = campaign.body
        .replace(/{{firstName}}/g, lead.firstName || '')
        .replace(/{{lastName}}/g, lead.lastName || '')
        .replace(/{{company}}/g, lead.company || '');

      await transporter.sendMail({
        from: client.smtp.user,
        to: lead.email,
        subject: personalizedSubject,
        html: personalizedBody
      });

      sent++;
      allLeads[lead.email].status = 'sent';
      allLeads[lead.email].lastSentAt = new Date().toISOString();

      // Throttle: 1 email per second to avoid spam flags
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      failed++;
      allLeads[lead.email].status = 'failed';
      allLeads[lead.email].error = err.message;
    }
  }

  // Update campaign stats
  campaign.stats.sent += sent;
  campaign.status = 'sent';
  campaign.sentAt = new Date().toISOString();
  campaigns[id] = campaign;
  
  saveJSON(CAMPAIGNS_FILE, campaigns);
  saveJSON(leadsFile, allLeads);

  res.json({ success: true, sent, failed, total: targetLeads.length });
});

// Dashboard stats
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const leadsFile = path.join(DATA_DIR, `leads_${req.clientId}.json`);
  const leads = loadJSON(leadsFile);
  const campaigns = loadJSON(CAMPAIGNS_FILE);
  
  const clientCampaigns = Object.values(campaigns).filter(c => c.clientId === req.clientId);
  
  const stats = {
    totalLeads: Object.keys(leads).length,
    newLeads: Object.values(leads).filter(l => l.status === 'new').length,
    sentLeads: Object.values(leads).filter(l => l.status === 'sent').length,
    totalCampaigns: clientCampaigns.length,
    totalSent: clientCampaigns.reduce((sum, c) => sum + (c.stats?.sent || 0), 0),
    totalOpened: clientCampaigns.reduce((sum, c) => sum + (c.stats?.opened || 0), 0),
    totalReplied: clientCampaigns.reduce((sum, c) => sum + (c.stats?.replied || 0), 0)
  };

  res.json({ stats });
});

// === START SERVER ===
const PORT = process.env.DASHBOARD_PORT || 3100;
app.listen(PORT, () => {
  console.log(`🚀 Prompta Dashboard running on http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/health`);
});
