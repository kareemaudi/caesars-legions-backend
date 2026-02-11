/**
 * Caesar's Legions - API Server
 * Handles onboarding, payment webhooks, and client dashboard
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { handleOnboarding, Client, saveClient } = require('./api/onboard.js');
let dashboardRoutes;
try {
  dashboardRoutes = require('./api/dashboard-routes.js');
  console.log('✅ Dashboard routes loaded');
} catch (e) {
  console.error('❌ Dashboard routes failed to load:', e.message);
  dashboardRoutes = require('express').Router();
}

const app = express();
const PORT = process.env.PORT || 3001;

// CORS - restrict to allowed domains
const ALLOWED_ORIGINS = [
  'https://caesarslegions.ai',
  'https://promptabusiness.com',
  'https://www.promptabusiness.com',
  'https://makhlab.promptabusiness.com',
  'https://luna.promptabusiness.com',
  'https://app.mubyn.com',
  'http://localhost:3500',
  'http://localhost:5173',
  process.env.BASE_URL || 'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed'), false);
  },
  credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// DASHBOARD (self-serve cold email platform)
// ============================================
app.use('/dashboard', dashboardRoutes);

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: 'v2-dashboard', timestamp: new Date().toISOString() });
});

// ============================================
// ONBOARDING / LEADS
// ============================================
app.post('/api/onboard', handleOnboarding);

app.post('/api/leads', async (req, res) => {
  try {
    const data = req.body;
    const leadsDir = path.join(__dirname, 'data/leads');
    await fs.mkdir(leadsDir, { recursive: true });
    
    const lead = {
      id: crypto.randomUUID(),
      email: data.email,
      name: data.name || data.companyName,
      website: data.website,
      createdAt: new Date().toISOString(),
      status: 'pending_payment',
      ...data
    };
    
    await fs.writeFile(
      path.join(leadsDir, `${lead.id}.json`),
      JSON.stringify(lead, null, 2)
    );
    
    res.json({ success: true, leadId: lead.id });
  } catch (error) {
    console.error('Lead capture error:', error);
    res.status(500).json({ error: 'Failed to save lead' });
  }
});

// ============================================
// MONTYPAY WEBHOOK
// ============================================
app.post('/api/webhooks/montypay', async (req, res) => {
  try {
    const payload = req.body;
    
    // Log webhook for debugging
    console.log('MontyPay webhook received:', JSON.stringify(payload, null, 2));
    
    // Store webhook event
    const webhooksDir = path.join(__dirname, 'data/webhooks');
    await fs.mkdir(webhooksDir, { recursive: true });
    await fs.writeFile(
      path.join(webhooksDir, `montypay-${Date.now()}.json`),
      JSON.stringify({ receivedAt: new Date().toISOString(), payload }, null, 2)
    );
    
    // Check payment status
    // MontyPay sends: { status: 'success', paymentId, amount, email, ... }
    if (payload.status === 'success' || payload.status === 'completed') {
      const email = payload.email || payload.customer_email;
      
      if (email) {
        // Find lead by email
        const leadsDir = path.join(__dirname, 'data/leads');
        try {
          const files = await fs.readdir(leadsDir);
          for (const file of files) {
            if (file.endsWith('.json')) {
              const leadData = JSON.parse(await fs.readFile(path.join(leadsDir, file), 'utf8'));
              if (leadData.email === email || leadData.smtpUser === email) {
                // Update lead status
                leadData.status = 'paid';
                leadData.paymentConfirmedAt = new Date().toISOString();
                leadData.paymentId = payload.paymentId || payload.id;
                await fs.writeFile(path.join(leadsDir, file), JSON.stringify(leadData, null, 2));
                
                // Trigger campaign kickoff
                await kickoffCampaign(leadData);
                
                console.log(`✅ Payment confirmed for ${email}, campaign kicked off!`);
                break;
              }
            }
          }
        } catch (e) {
          console.error('Error finding lead:', e);
        }
      }
      
      // Notify via Telegram
      await notifyPayment(payload);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function kickoffCampaign(lead) {
  // Create campaign record
  const campaignsDir = path.join(__dirname, 'data/campaigns');
  await fs.mkdir(campaignsDir, { recursive: true });
  
  const campaign = {
    id: crypto.randomUUID(),
    leadId: lead.id,
    clientEmail: lead.email || lead.smtpUser,
    clientName: lead.name || lead.companyName,
    status: 'researching',
    createdAt: new Date().toISOString(),
    timeline: {
      paid: new Date().toISOString(),
      researchStarted: new Date().toISOString(),
      researchCompleted: null,
      sequencesDrafted: null,
      approved: null,
      launched: null
    },
    metrics: {
      prospectsFound: 0,
      emailsSent: 0,
      opens: 0,
      replies: 0,
      meetings: 0
    },
    icp: {
      targetTitles: lead.targetTitles,
      targetCompanySize: lead.targetCompanySize,
      targetIndustries: lead.targetIndustries
    }
  };
  
  await fs.writeFile(
    path.join(campaignsDir, `${campaign.id}.json`),
    JSON.stringify(campaign, null, 2)
  );
  
  return campaign;
}

async function notifyPayment(payload) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID || '7189807915';
  
  if (!telegramToken) return;
  
  const message = `💰 **Payment Received!**

**Email:** ${payload.email || payload.customer_email || 'Unknown'}
**Amount:** $${payload.amount || '297'}
**Payment ID:** ${payload.paymentId || payload.id || 'N/A'}

Campaign kickoff initiated! 🚀`;

  try {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {
    console.error('Telegram notification failed:', e);
  }
}

// ============================================
// CLIENT SIGNUP (self-service, no payment gate)
// ============================================
app.post('/api/clients/signup', async (req, res) => {
  try {
    const {
      companyName, website, industry, companySize,
      targetTitle, targetIndustry, targetRegion,
      email, name
    } = req.body;

    // Validate required fields
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }
    if (!companyName || String(companyName).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Company name is required (min 2 chars)' });
    }
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Your name is required (min 2 chars)' });
    }

    const safeEmail = email.toLowerCase().trim();
    const safeName = String(name).trim().slice(0, 100);
    const safeCompany = String(companyName).trim().slice(0, 100);

    // Check for existing client in clients.json
    const clientsFile = path.join(__dirname, 'data/clients.json');
    let clients = [];
    try {
      clients = JSON.parse(await fs.readFile(clientsFile, 'utf8'));
    } catch (e) { /* file doesn't exist yet */ }

    const existing = clients.find(c => c.email === safeEmail);
    if (existing) {
      return res.json({
        success: true,
        clientId: existing.clientId,
        status: existing.status,
        message: 'Account already exists. Welcome back!'
      });
    }

    // Generate unique client ID
    const clientId = clients.length > 0
      ? Math.max(...clients.map(c => c.clientId || 0)) + 1
      : 1;

    const clientRecord = {
      clientId,
      email: safeEmail,
      name: safeName,
      company: safeCompany,
      website: (website || '').trim().slice(0, 200),
      industry: (industry || '').slice(0, 100),
      companySize: (companySize || '').slice(0, 50),
      targetTitle: (targetTitle || '').slice(0, 200),
      targetIndustry: (targetIndustry || '').slice(0, 200),
      targetRegion: (targetRegion || '').slice(0, 200),
      status: 'onboarding',
      plan: 'trial',
      signupDate: new Date().toISOString(),
      source: 'onboarding_form'
    };

    clients.push(clientRecord);
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    await fs.writeFile(clientsFile, JSON.stringify(clients, null, 2));

    console.log(`🎉 New client signup: ${safeCompany} (${safeEmail}) → ID ${clientId}`);

    // Log to new-signups.json for heartbeat notification
    const signupsFile = path.join(__dirname, 'data/new-signups.json');
    let signups = [];
    try {
      signups = JSON.parse(await fs.readFile(signupsFile, 'utf8'));
    } catch (e) { /* file doesn't exist yet */ }

    signups.push({
      clientId,
      name: safeName,
      email: safeEmail,
      company: safeCompany,
      website: clientRecord.website,
      industry: clientRecord.industry,
      timestamp: new Date().toISOString(),
      notified: false
    });
    await fs.writeFile(signupsFile, JSON.stringify(signups, null, 2));

    // Also save as a lead file (backwards compat)
    const leadsDir = path.join(__dirname, 'data/leads');
    await fs.mkdir(leadsDir, { recursive: true });
    await fs.writeFile(
      path.join(leadsDir, `signup-${clientId}.json`),
      JSON.stringify({ ...clientRecord, id: `signup-${clientId}`, createdAt: new Date().toISOString() }, null, 2)
    );

    // Generate a simple dashboard token
    const dashboardToken = `${clientId}:${crypto.createHash('sha256').update(`${clientId}:${safeEmail}:prompta-secret`).digest('hex').slice(0, 16)}`;

    // Auto-create dashboard account with SMTP pre-configured
    let dashboardCredentials = null;
    try {
      const { smtpHost, smtpPort, smtpUser, smtpPass, senderName } = req.body;
      if (smtpUser && smtpPass) {
        const dashClient = dashboardRoutes.createClientFromOnboarding({
          companyName: safeCompany,
          email: safeEmail,
          smtpHost: smtpHost || '',
          smtpPort: smtpPort || '587',
          smtpUser,
          smtpPass,
          senderName: senderName || safeName
        });
        if (dashClient) {
          dashboardCredentials = {
            email: dashClient.email,
            password: dashClient.generatedPassword,
            dashboardUrl: '/dashboard'
          };
          console.log(`📊 Dashboard account created for ${dashClient.email} with SMTP pre-configured`);
        }
      }
    } catch (dashErr) {
      console.error('Dashboard auto-create error:', dashErr.message);
    }

    res.json({
      success: true,
      clientId,
      dashboardToken,
      dashboardCredentials,
      status: 'onboarding',
      message: dashboardCredentials 
        ? "Your dashboard is ready! SMTP is already connected."
        : "Campaign setup in progress. We'll email you within 24 hours with your first leads."
    });

  } catch (error) {
    console.error('❌ Client signup error:', error);
    res.status(500).json({
      success: false,
      error: 'Something went wrong. Please try again or email caesar@promptabusiness.com'
    });
  }
});

// ============================================
// CLIENT STATUS (public, no auth needed)
// ============================================
app.get('/api/clients/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { email: queryEmail } = req.query;

    // Load clients
    const clientsFile = path.join(__dirname, 'data/clients.json');
    let clients = [];
    try {
      clients = JSON.parse(await fs.readFile(clientsFile, 'utf8'));
    } catch (e) { /* file doesn't exist */ }

    let client = null;

    // Try by numeric ID
    if (!isNaN(id)) {
      client = clients.find(c => c.clientId === parseInt(id));
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

    // Try to find campaign data
    let campaignMetrics = { emailsSent: 0, opens: 0, replies: 0, meetings: 0, prospectsFound: 0 };
    try {
      const campaignsDir = path.join(__dirname, 'data/campaigns');
      const files = await fs.readdir(campaignsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = JSON.parse(await fs.readFile(path.join(campaignsDir, file), 'utf8'));
          if (data.clientEmail === client.email || data.leadId === `signup-${client.clientId}`) {
            campaignMetrics = data.metrics || campaignMetrics;
            break;
          }
        }
      }
    } catch (e) { /* no campaigns dir yet */ }

    // Build response based on status
    let campaignData = {};
    if (client.status === 'onboarding') {
      campaignData = {
        leadsFound: 0,
        emailsSent: 0,
        emailsOpened: 0,
        repliesReceived: 0,
        replyRate: '0%',
        statusMessage: "Your campaign is being set up. We're researching your ideal prospects and crafting personalized sequences.",
        nextStep: 'Expect your first leads within 24-48 hours.'
      };
    } else if (client.status === 'active') {
      campaignData = {
        leadsFound: campaignMetrics.prospectsFound || 0,
        emailsSent: campaignMetrics.emailsSent || 0,
        emailsOpened: campaignMetrics.opens || 0,
        repliesReceived: campaignMetrics.replies || 0,
        replyRate: campaignMetrics.emailsSent > 0
          ? ((campaignMetrics.replies / campaignMetrics.emailsSent) * 100).toFixed(1) + '%'
          : '0%',
        statusMessage: 'Your campaign is live and sending.',
        nextStep: 'Check back daily for new replies and leads.'
      };
    } else if (client.status === 'paused') {
      campaignData = {
        leadsFound: campaignMetrics.prospectsFound || 0,
        emailsSent: campaignMetrics.emailsSent || 0,
        emailsOpened: campaignMetrics.opens || 0,
        repliesReceived: campaignMetrics.replies || 0,
        replyRate: campaignMetrics.emailsSent > 0
          ? ((campaignMetrics.replies / campaignMetrics.emailsSent) * 100).toFixed(1) + '%'
          : '0%',
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
        nextStep: "We'll be in touch shortly."
      };
    }

    res.json({
      success: true,
      client: {
        id: client.clientId,
        company: client.company,
        name: client.name,
        status: client.status,
        plan: client.plan || 'trial',
        signupDate: client.signupDate || client.createdAt,
        industry: client.industry || ''
      },
      campaign: campaignData
    });

  } catch (error) {
    console.error('❌ Client status error:', error);
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
});

// ============================================
// CLIENT DASHBOARD API (legacy)
// ============================================
app.get('/api/dashboard/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    // Find campaign by client ID or email
    const campaignsDir = path.join(__dirname, 'data/campaigns');
    const leadsDir = path.join(__dirname, 'data/leads');
    
    let campaign = null;
    let lead = null;
    
    // Try to find campaign
    try {
      const campaignFiles = await fs.readdir(campaignsDir);
      for (const file of campaignFiles) {
        if (file.endsWith('.json')) {
          const data = JSON.parse(await fs.readFile(path.join(campaignsDir, file), 'utf8'));
          if (data.id === clientId || data.leadId === clientId || data.clientEmail === clientId) {
            campaign = data;
            break;
          }
        }
      }
    } catch (e) {}
    
    // Try to find lead
    try {
      const leadFiles = await fs.readdir(leadsDir);
      for (const file of leadFiles) {
        if (file.endsWith('.json')) {
          const data = JSON.parse(await fs.readFile(path.join(leadsDir, file), 'utf8'));
          if (data.id === clientId || data.email === clientId || data.smtpUser === clientId) {
            lead = data;
            break;
          }
        }
      }
    } catch (e) {}
    
    if (!campaign && !lead) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json({
      client: lead ? {
        id: lead.id,
        name: lead.name || lead.companyName,
        email: lead.email || lead.smtpUser,
        status: lead.status,
        joinedAt: lead.createdAt
      } : null,
      campaign: campaign ? {
        id: campaign.id,
        status: campaign.status,
        timeline: campaign.timeline,
        metrics: campaign.metrics,
        icp: campaign.icp
      } : null
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// List all campaigns (admin)
app.get('/api/admin/campaigns', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const campaignsDir = path.join(__dirname, 'data/campaigns');
    const campaigns = [];
    
    try {
      const files = await fs.readdir(campaignsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          campaigns.push(JSON.parse(await fs.readFile(path.join(campaignsDir, file), 'utf8')));
        }
      }
    } catch (e) {}
    
    res.json({ campaigns });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
});

// ============================================
// PUBLIC METRICS
// ============================================
app.get('/api/metrics', async (req, res) => {
  try {
    // Count campaigns and calculate metrics
    const campaignsDir = path.join(__dirname, 'data/campaigns');
    let totalClients = 0;
    let totalEmailsSent = 0;
    let totalReplies = 0;
    let totalMeetings = 0;
    
    try {
      const files = await fs.readdir(campaignsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const campaign = JSON.parse(await fs.readFile(path.join(campaignsDir, file), 'utf8'));
          totalClients++;
          totalEmailsSent += campaign.metrics?.emailsSent || 0;
          totalReplies += campaign.metrics?.replies || 0;
          totalMeetings += campaign.metrics?.meetings || 0;
        }
      }
    } catch (e) {}
    
    res.json({
      revenue: {
        mrr: totalClients * 297,
        clients: totalClients
      },
      performance: {
        emailsSent: totalEmailsSent,
        replies: totalReplies,
        meetings: totalMeetings,
        replyRate: totalEmailsSent > 0 ? ((totalReplies / totalEmailsSent) * 100).toFixed(1) : 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// ============================================
// MAKHLAB SIGNUP (AI Employee for Arabic businesses)
// ============================================
app.post('/api/makhlab/signup', async (req, res) => {
  try {
    const { businessName, ownerName, name, phone, email, businessType, language, preferredLanguage, plan, personality, assistantName, telegramUsername, apiKey, tasks, billing, paymentMethod, price } = req.body;

    // Use ownerName or name (frontend sends both for compatibility)
    const finalName = ownerName || name || '';

    // Validate
    if (!finalName || String(finalName).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Name is required (min 2 chars)' });
    }
    if (!businessName || String(businessName).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Business name is required (min 2 chars)' });
    }
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const signupId = `makhlab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const selectedPlan = plan || 'free_trial';

    const signup = {
      signupId,
      businessName: String(businessName).trim().slice(0, 200),
      ownerName: String(finalName).trim().slice(0, 100),
      phone: phone ? String(phone).trim().slice(0, 20) : null,
      email: email ? String(email).toLowerCase().trim().slice(0, 200) : null,
      telegramUsername: telegramUsername ? String(telegramUsername).trim().replace(/^@/, '').slice(0, 100) : null,
      businessType: (businessType || 'general').slice(0, 100),
      language: preferredLanguage || language || 'ar',
      personality: personality || 'friendly',
      assistantName: assistantName ? String(assistantName).trim().slice(0, 100) : null,
      tasks: Array.isArray(tasks) ? tasks : [],
      apiKey: apiKey || null,
      plan: selectedPlan,
      billing: billing || 'monthly',
      paymentMethod: paymentMethod || 'free',
      status: 'pending_provisioning',
      createdAt: new Date().toISOString(),
      provisionedAt: null,
      botUsername: null,
      trialExpiry: selectedPlan === 'free_trial' || selectedPlan === 'free' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null
    };

    // Save to makhlab-signups.json
    const signupsFile = path.join(__dirname, 'data/makhlab-signups.json');
    let signups = [];
    try {
      signups = JSON.parse(await fs.readFile(signupsFile, 'utf8'));
    } catch (e) { /* first signup */ }
    signups.push(signup);
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    await fs.writeFile(signupsFile, JSON.stringify(signups, null, 2));

    console.log(`🎉 MAKHLAB SIGNUP: ${signup.businessName} (${signup.ownerName}) — ${signup.plan}`);

    // 🔔 INSTANT Telegram notification to Kareem + Caesar
    const notifyBot = process.env.MAKHLAB_NOTIFY_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const notifyChatId = process.env.TELEGRAM_CHAT_ID || '7189807915';

    if (notifyBot) {
      const msg = `🚨🚨🚨 NEW MAKHLAB SIGNUP! 🚨🚨🚨

🏪 Business: ${signup.businessName}
👤 Owner: ${signup.ownerName}
📱 Phone: ${signup.phone || 'N/A'}
📧 Email: ${signup.email || 'N/A'}
💬 Telegram: ${signup.telegramUsername ? '@' + signup.telegramUsername : 'N/A'}
🏷️ Type: ${signup.businessType}
🎭 Personality: ${signup.personality}
🤖 Assistant: ${signup.assistantName || 'Default'}
💰 Plan: ${signup.plan}
🆔 ID: ${signup.signupId}

⏳ Status: Pending provisioning
🤖 Run: node /opt/makhlab/scripts/provision.js --signup-id ${signup.signupId}`;

      try {
        await fetch(`https://api.telegram.org/bot${notifyBot}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: notifyChatId,
            text: msg,
            parse_mode: 'HTML'
          })
        });
      } catch (e) {
        console.error('Telegram notify failed:', e.message);
      }
    }

    // 🤖 AUTO-PROVISION: Call droplet API to create the bot
    const PROVISION_API = process.env.PROVISION_API_URL || 'http://134.209.94.167:19099';
    const PROVISION_TOKEN = process.env.PROVISION_AUTH_TOKEN || 'makhlab_provision_secret_2026';
    
    let botLink = null;
    let botUsername = null;
    
    try {
      console.log(`[AUTO-PROVISION] Calling provision API for ${signup.signupId}...`);
      const provisionRes = await fetch(`${PROVISION_API}/provision`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Auth-Token': PROVISION_TOKEN 
        },
        body: JSON.stringify({ signup, authToken: PROVISION_TOKEN })
      });
      const provisionData = await provisionRes.json();
      
      if (provisionData.success) {
        botLink = provisionData.botLink;
        botUsername = provisionData.botUsername;
        console.log(`[AUTO-PROVISION] SUCCESS! Bot: @${botUsername} (${botLink})`);
        
        // Update signup record with bot info
        const idx = signups.findIndex(s => s.signupId === signupId);
        if (idx >= 0) {
          signups[idx].botUsername = botUsername;
          signups[idx].botLink = botLink;
          signups[idx].status = 'provisioned';
          signups[idx].provisionedAt = new Date().toISOString();
          await fs.writeFile(signupsFile, JSON.stringify(signups, null, 2));
        }
      } else {
        console.error(`[AUTO-PROVISION] Failed:`, provisionData.error);
      }
    } catch (provErr) {
      console.error(`[AUTO-PROVISION] Error:`, provErr.message);
    }

    // 📧 AUTO-EMAIL: Send bot link to customer
    if (botLink && signup.email) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.zoho.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: {
            user: process.env.SMTP_USER || 'caesar@promptabusiness.com',
            pass: process.env.SMTP_PASS || process.env.ZOHO_SMTP_PASSWORD
          }
        });

        const assistantDisplayName = signup.assistantName || `${signup.businessName} Assistant`;
        
        await transporter.sendMail({
          from: `"Makhlab" <caesar@promptabusiness.com>`,
          to: signup.email,
          subject: `✨ ${assistantDisplayName} is ready! Your AI employee is live`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #fff; border-radius: 12px; overflow: hidden;">
              <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">🎉 ${assistantDisplayName} is Live!</h1>
                <p style="margin: 10px 0 0; opacity: 0.9;">Your AI employee is ready to serve customers</p>
              </div>
              <div style="padding: 30px;">
                <p>Hi ${signup.ownerName},</p>
                <p>Great news! Your AI employee <strong>${assistantDisplayName}</strong> for <strong>${signup.businessName}</strong> is now active on Telegram.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${botLink}" style="background: #10b981; color: #fff; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 18px; font-weight: bold; display: inline-block;">
                    💬 Open on Telegram
                  </a>
                </div>
                
                <p><strong>How to start:</strong></p>
                <ol>
                  <li>Click the button above (or go to <a href="${botLink}" style="color: #10b981;">${botLink}</a>)</li>
                  <li>Press "Start" in Telegram</li>
                  <li>Send a message — ${assistantDisplayName} will reply!</li>
                </ol>
                
                <p><strong>Share with customers:</strong> Give them the link <code>${botLink}</code> and they can message your business 24/7.</p>
                
                <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #333; font-size: 12px; color: #888;">
                  Your 7-day free trial started. Need help? Reply to this email.<br>
                  — The Makhlab Team (powered by Prompta)
                </p>
              </div>
            </div>
          `
        });
        console.log(`[AUTO-EMAIL] Sent bot link to ${signup.email}`);
      } catch (emailErr) {
        console.error(`[AUTO-EMAIL] Failed:`, emailErr.message);
      }
    }

    res.json({
      success: true,
      signupId,
      botLink: botLink || null,
      botUsername: botUsername || null,
      plan: selectedPlan,
      message: selectedPlan === 'free_trial' || selectedPlan === 'free'
        ? 'تم التسجيل بنجاح! سيتم تفعيل موظفك الذكي خلال دقيقة واحدة. (Signup successful! Your AI Employee will be live within 1 minute.)'
        : 'تم التسجيل! سنتواصل معك قريباً لتفعيل الخدمة. (Signed up! We will contact you shortly to activate the service.)',
      trialExpiry: signup.trialExpiry
    });

  } catch (error) {
    console.error('❌ Makhlab signup error:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ. يرجى المحاولة مرة أخرى. (Something went wrong. Please try again.)' });
  }
});

// Makhlab signup status check
app.get('/api/makhlab/status/:signupId', async (req, res) => {
  try {
    const { signupId } = req.params;
    const signupsFile = path.join(__dirname, 'data/makhlab-signups.json');
    let signups = [];
    try {
      signups = JSON.parse(await fs.readFile(signupsFile, 'utf8'));
    } catch (e) {}

    const signup = signups.find(s => s.signupId === signupId);
    if (!signup) {
      return res.status(404).json({ success: false, error: 'Signup not found' });
    }

    res.json({
      success: true,
      status: signup.status,
      botUsername: signup.botUsername,
      plan: signup.plan,
      trialExpiry: signup.trialExpiry,
      businessName: signup.businessName
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to check status' });
  }
});

// ============================================
// MUBYN OS ENDPOINTS (for VC demo)
// ============================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'mubyn-demo-secret-2026';
const APOLLO_API_KEY = process.env.APOLLO_API_KEY || 'vndGs9TB42TIG7zcdO6zVQ';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// OpenAI chat helper
async function openaiChat(systemPrompt, userMessage, maxTokens = 1024) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

// Helper: Load/save JSON data files
async function loadJSON(filePath, defaultValue = []) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return defaultValue;
  }
}

async function saveJSON(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// ============================================
// 1. AUTH ENDPOINTS
// ============================================

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, business_name, industry, country, website, primaryNeed } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    const usersFile = path.join(__dirname, 'data/users.json');
    const users = await loadJSON(usersFile, []);
    
    // Check if user exists
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user with all profile fields
    const user = {
      id: crypto.randomUUID(),
      email,
      name,
      business_name: business_name || '',
      industry: industry || '',
      country: country || '',
      website: website || '',
      primaryNeed: primaryNeed || '',
      password: hashedPassword,
      created_at: new Date().toISOString()
    };
    
    users.push(user);
    await saveJSON(usersFile, users);
    
    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        business_name: user.business_name,
        industry: user.industry,
        country: user.country,
        website: user.website,
        primaryNeed: user.primaryNeed
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const usersFile = path.join(__dirname, 'data/users.json');
    const users = await loadJSON(usersFile, []);
    
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        business_name: user.business_name,
        industry: user.industry || '',
        country: user.country || '',
        website: user.website || '',
        primaryNeed: user.primaryNeed || ''
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const usersFile = path.join(__dirname, 'data/users.json');
    const users = await loadJSON(usersFile, []);
    
    const user = users.find(u => u.id === req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      business_name: user.business_name
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ============================================
// 2. CAESAR CHAT ENDPOINT
// ============================================

// POST /api/chat — Context-aware Caesar
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Build context-aware system prompt
    let userContext = '';
    if (userId) {
      try {
        const [userData, leads, content, cfo, csaSettings, kb] = await Promise.all([
          loadJSON(path.join(__dirname, `data/user-${userId}.json`), null),
          loadJSON(path.join(__dirname, `data/leads-${userId}.json`), []),
          loadJSON(path.join(__dirname, `data/content-${userId}.json`), []),
          loadJSON(path.join(__dirname, `data/cfo-${userId}.json`), null),
          loadJSON(path.join(__dirname, `data/csa-settings-${userId}.json`), null),
          loadJSON(path.join(__dirname, `data/csa-knowledge-${userId}.json`), []),
        ]);
        const parts = [];
        if (userData) {
          if (userData.business_name) parts.push(`Business: ${userData.business_name}`);
          if (userData.industry) parts.push(`Industry: ${userData.industry}`);
          if (userData.country) parts.push(`Location: ${userData.country}`);
          if (userData.website) parts.push(`Website: ${userData.website}`);
        }
        const active = [], inactive = [];
        if (leads.length > 0) active.push(`Leads (${leads.length} found)`); else inactive.push('Lead Generation (go to Leads tab)');
        if (content.length > 0) active.push(`Content Calendar (${content.length} posts)`); else inactive.push('Content Calendar (go to CMO tab)');
        if (cfo) active.push('Financial Analysis'); else inactive.push('Financial Analysis (go to CFO tab)');
        if (csaSettings || kb.length > 0) active.push(`Customer Support (${kb.length} KB entries)`); else inactive.push('Customer Support Agent (go to CS tab)');
        // Check if website exists
        try {
          const wsMeta = await loadJSON(path.join(__dirname, `data/websites/${userData?.id || userId}/meta.json`), null);
          if (wsMeta) active.push(`Website (${wsMeta.status} — ${wsMeta.businessName})`); else inactive.push('Website Builder (go to Website tab)');
        } catch { inactive.push('Website Builder (go to Website tab)'); }
        if (parts.length) userContext += `\n\nCLIENT INFO: ${parts.join(' | ')}`;
        if (active.length) userContext += `\nACTIVE MODULES: ${active.join(', ')}`;
        if (inactive.length) userContext += `\nNOT SET UP YET: ${inactive.join(', ')}`;
      } catch (_) { /* still respond even if context fails */ }
    }
    
    const systemPrompt = `You are Caesar, the AI CEO powering Mubyn OS — an AI business operating system for SMEs in MENA.

You manage 5 departments for each client:
1. **Lead Generation** (Leads tab) — AI discovers businesses, scores leads, drafts personalized emails, sends via SMTP
2. **Content Marketing** (CMO tab) — Generates full month content calendars across Twitter, LinkedIn, Instagram with AI images
3. **Financial Intelligence** (CFO tab) — Revenue tracking, expense management, projections, AI insights
4. **Customer Support** (CS tab) — AI chat agent with knowledge base, tone settings, embeddable website widget
5. **Website Builder** (Website tab) — AI generates a complete, beautiful website in 60 seconds. User fills business info → AI creates a stunning site → publish it live

YOUR BEHAVIOR:
- If user just signed up: Welcome them warmly, summarize what Mubyn can do, suggest starting with Lead Gen or CMO
- If modules are not set up: Proactively suggest them
- If user asks about a feature: Explain it clearly and tell them which tab to go to
- Be concise (2-4 paragraphs max), actionable, and warm
- Match the user's language (Arabic or English)
- Never say "I'm just an AI" — you ARE their AI CEO
- Use markdown formatting${userContext}`;
    
    const reply = await openaiChat(systemPrompt, message, 1024);
    
    // Save conversation history
    if (userId) {
      const conversationsFile = path.join(__dirname, `data/conversations-${userId}.json`);
      const conversations = await loadJSON(conversationsFile, []);
      conversations.push({
        id: crypto.randomUUID(),
        userId,
        message,
        response: reply,
        timestamp: new Date().toISOString()
      });
      await saveJSON(conversationsFile, conversations);
    }
    
    res.json({ response: reply });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Chat failed', details: error.message });
  }
});

// ============================================
// 3. LEADS ENDPOINTS
// ============================================

// POST /api/leads/search
app.post('/api/leads/search', async (req, res) => {
  try {
    const { query, location, industry, userId } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Call Apollo.io API
    const apolloResponse = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY
      },
      body: JSON.stringify({
        q_organization_name: query,
        person_locations: location ? [location] : undefined,
        per_page: 10
      })
    });
    
    const apolloData = await apolloResponse.json();
    
    // Transform Apollo data
    const leads = (apolloData.people || []).map(person => ({
      id: crypto.randomUUID(),
      name: person.name || '',
      email: person.email || '',
      company: person.organization?.name || '',
      title: person.title || '',
      location: person.city || person.state || person.country || '',
      source: 'apollo',
      created_at: new Date().toISOString()
    }));
    
    // Save leads
    if (userId) {
      const leadsFile = path.join(__dirname, `data/leads-${userId}.json`);
      const existingLeads = await loadJSON(leadsFile, []);
      existingLeads.push(...leads);
      await saveJSON(leadsFile, existingLeads);
    }
    
    res.json({ leads });
  } catch (error) {
    console.error('Lead search error:', error);
    res.status(500).json({ error: 'Lead search failed', details: error.message });
  }
});

// GET /api/leads/:userId
app.get('/api/leads/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const leadsFile = path.join(__dirname, `data/leads-${userId}.json`);
    const leads = await loadJSON(leadsFile, []);
    res.json({ leads });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ error: 'Failed to get leads' });
  }
});

// ============================================
// 4. CONTENT GENERATION ENDPOINTS
// ============================================

// POST /api/content/generate
app.post('/api/content/generate', async (req, res) => {
  try {
    const { topic, platform, language, userId } = req.body;
    
    if (!topic || !platform) {
      return res.status(400).json({ error: 'Topic and platform are required' });
    }
    
    const systemPrompt = `You are a social media content expert. Generate engaging posts for the specified platform. If language is 'ar', write in Arabic. Keep posts platform-appropriate in length.`;
    
    const userPrompt = `Create a ${platform} post about: ${topic}. Language: ${language || 'en'}`;
    
    const content = await openaiChat(systemPrompt, userPrompt, 512);
    
    const contentItem = {
      id: crypto.randomUUID(),
      content,
      topic,
      platform,
      language: language || 'en',
      status: 'draft',
      created_at: new Date().toISOString()
    };
    
    // Save content
    if (userId) {
      const contentFile = path.join(__dirname, `data/content-${userId}.json`);
      const existingContent = await loadJSON(contentFile, []);
      existingContent.push(contentItem);
      await saveJSON(contentFile, existingContent);
    }
    
    res.json(contentItem);
  } catch (error) {
    console.error('Content generation error:', error);
    res.status(500).json({ error: 'Content generation failed', details: error.message });
  }
});

// POST /api/content/calendar — Generate FULL month content calendar
app.post('/api/content/calendar', async (req, res) => {
  try {
    const { business_name, industry, language, userId } = req.body;
    
    const systemPrompt = `You are a world-class social media strategist. Generate a full month content calendar (4 weeks, 3 posts per week across Twitter, LinkedIn, and Instagram = 12 posts total). Return JSON array format.`;
    
    const userPrompt = `Create a full month content calendar for:
Business: ${business_name || 'A growing business'}
Industry: ${industry || 'Technology'}
Language: ${language || 'en'}

Return a JSON array with exactly 12 posts, each having:
- week (1-4)
- day (Monday/Wednesday/Friday)
- platform (twitter/linkedin/instagram)
- content (the actual post text, ready to publish)
- hashtags (array of relevant hashtags)
- type (thought-leadership/case-study/tips/behind-scenes/engagement/promotional)

${language === 'ar' ? 'Write ALL content in Arabic.' : 'Write in English.'}
Return ONLY the JSON array, no other text.`;
    
    const calendarText = await openaiChat(systemPrompt, userPrompt, 4096);
    
    // Try to parse JSON from response
    let calendar;
    try {
      // Extract JSON from response (might be wrapped in markdown)
      const jsonMatch = calendarText.match(/\[[\s\S]*\]/);
      calendar = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(calendarText);
    } catch {
      calendar = [{ week: 1, day: 'Monday', platform: 'twitter', content: calendarText, hashtags: [], type: 'general' }];
    }
    
    // Add IDs and metadata
    const enrichedCalendar = calendar.map((post, i) => ({
      id: crypto.randomUUID(),
      ...post,
      status: 'draft',
      created_at: new Date().toISOString(),
      order: i + 1
    }));
    
    // Save calendar
    if (userId) {
      const contentFile = path.join(__dirname, `data/content-${userId}.json`);
      await saveJSON(contentFile, enrichedCalendar);
    }
    
    res.json({ calendar: enrichedCalendar, total: enrichedCalendar.length });
  } catch (error) {
    console.error('Calendar generation error:', error);
    res.status(500).json({ error: 'Calendar generation failed', details: error.message });
  }
});

// GET /api/content/:userId
app.get('/api/content/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const contentFile = path.join(__dirname, `data/content-${userId}.json`);
    const content = await loadJSON(contentFile, []);
    res.json({ content });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Failed to get content' });
  }
});

// ============================================
// 5. CSA (CUSTOMER SUPPORT) ENDPOINTS
// ============================================

// POST /api/content/image — DALL-E 3 image generation
app.post('/api/content/image', async (req, res) => {
  try {
    const { prompt, size } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });
    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: size || '1024x1024', quality: 'standard' })
    });
    if (!r.ok) { const err = await r.text(); return res.status(r.status).json({ error: `DALL-E error: ${err}` }); }
    const data = await r.json();
    const imageUrl = data.data?.[0]?.url || null;
    const revisedPrompt = data.data?.[0]?.revised_prompt || null;
    res.json({ success: true, image_url: imageUrl, revised_prompt: revisedPrompt });
  } catch (e) { console.error('Image generation error:', e); res.status(500).json({ error: 'Image generation failed', details: e.message }); }
});

// POST /api/csa/respond — with knowledge base + tone support
app.post('/api/csa/respond', async (req, res) => {
  // Allow cross-origin requests from widget embeds
  res.set('Access-Control-Allow-Origin', '*');
  try {
    const { customer_message, business_context, userId, knowledge_base, tone, language } = req.body;
    
    if (!customer_message) {
      return res.status(400).json({ error: 'Customer message is required' });
    }

    // Build context with knowledge base
    let kbContext = '';
    if (knowledge_base && Array.isArray(knowledge_base) && knowledge_base.length > 0) {
      kbContext = '\n\nKnowledge Base (use this to answer accurately):\n' +
        knowledge_base.map(kb => `Q: ${kb.title}\nA: ${kb.content}`).join('\n\n');
    } else if (userId) {
      const kbFile = path.join(__dirname, `data/csa-kb-${userId}.json`);
      const savedKb = await loadJSON(kbFile, []);
      const activeKb = savedKb.filter(kb => kb.is_active !== false);
      if (activeKb.length > 0) {
        kbContext = '\n\nKnowledge Base (use this to answer accurately):\n' +
          activeKb.map(kb => `Q: ${kb.title}\nA: ${kb.content}`).join('\n\n');
      }
    }

    // Load tone settings
    let toneInstructions = '';
    if (userId) {
      const settingsFile = path.join(__dirname, `data/csa-settings-${userId}.json`);
      const settings = await loadJSON(settingsFile, {});
      if (settings.tone) toneInstructions += `\nTone: ${settings.tone}.`;
      if (settings.language) toneInstructions += `\nLanguage: ${settings.language}.`;
      if (settings.response_length) toneInstructions += `\nResponse length: ${settings.response_length}.`;
      if (settings.custom_instructions) toneInstructions += `\nAdditional instructions: ${settings.custom_instructions}`;
    }
    if (tone) toneInstructions += `\nTone: ${tone}.`;
    if (language) toneInstructions += `\nRespond in: ${language}.`;
    
    const systemPrompt = `You are a professional customer support agent. ${business_context || 'Help the customer with their inquiry.'} Be empathetic, clear, and solution-oriented.${toneInstructions}${kbContext}`;
    
    const reply = await openaiChat(systemPrompt, customer_message, 512);
    
    // Save conversation
    if (userId) {
      const csaFile = path.join(__dirname, `data/csa-${userId}.json`);
      const conversations = await loadJSON(csaFile, []);
      conversations.push({
        id: crypto.randomUUID(),
        customer_message,
        ai_response: reply,
        business_context: business_context || '',
        timestamp: new Date().toISOString()
      });
      await saveJSON(csaFile, conversations);
    }
    
    res.json({ response: reply });
  } catch (error) {
    console.error('CSA error:', error);
    res.status(500).json({ error: 'CSA response failed', details: error.message });
  }
});

// GET /api/csa/conversations/:userId
app.get('/api/csa/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const csaFile = path.join(__dirname, `data/csa-${userId}.json`);
    const conversations = await loadJSON(csaFile, []);
    res.json({ conversations });
  } catch (error) {
    console.error('Get CSA conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// CSA Knowledge Base
app.post('/api/csa/knowledge', async (req, res) => {
  try {
    const { userId, title, content, category, tags, is_active } = req.body;
    if (!userId || !title || !content) return res.status(400).json({ error: 'userId, title, and content required' });
    const f = path.join(__dirname, `data/csa-kb-${userId}.json`);
    const entries = await loadJSON(f, []);
    const entry = { id: crypto.randomUUID(), title, content, category: category || 'faq', tags: tags || [], is_active: is_active !== false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    entries.push(entry);
    await saveJSON(f, entries);
    res.json({ success: true, entry });
  } catch (e) { console.error('KB save error:', e); res.status(500).json({ error: 'Failed to save knowledge entry' }); }
});

app.get('/api/csa/knowledge/:userId', async (req, res) => {
  try { res.json({ entries: await loadJSON(path.join(__dirname, `data/csa-kb-${req.params.userId}.json`), []) }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/csa/knowledge/:userId/:entryId', async (req, res) => {
  try {
    const { userId, entryId } = req.params;
    const updates = req.body;
    const f = path.join(__dirname, `data/csa-kb-${userId}.json`);
    const entries = await loadJSON(f, []);
    const idx = entries.findIndex(e => e.id === entryId);
    if (idx === -1) return res.status(404).json({ error: 'Entry not found' });
    entries[idx] = { ...entries[idx], ...updates, updated_at: new Date().toISOString() };
    await saveJSON(f, entries);
    res.json({ success: true, entry: entries[idx] });
  } catch (e) { res.status(500).json({ error: 'Update failed' }); }
});

app.delete('/api/csa/knowledge/:userId/:entryId', async (req, res) => {
  try {
    const { userId, entryId } = req.params;
    const f = path.join(__dirname, `data/csa-kb-${userId}.json`);
    const entries = await loadJSON(f, []);
    const filtered = entries.filter(e => e.id !== entryId);
    if (filtered.length === entries.length) return res.status(404).json({ error: 'Entry not found' });
    await saveJSON(f, filtered);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Delete failed' }); }
});

// CSA Settings (tone, widget config)
app.post('/api/csa/settings', async (req, res) => {
  try {
    const { userId, ...settings } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const f = path.join(__dirname, `data/csa-settings-${userId}.json`);
    const existing = await loadJSON(f, {});
    const merged = { ...existing, ...settings, updated_at: new Date().toISOString() };
    await saveJSON(f, merged);
    res.json({ success: true, settings: merged });
  } catch (e) { console.error('Settings save error:', e); res.status(500).json({ error: 'Failed to save settings' }); }
});

app.get('/api/csa/settings/:userId', async (req, res) => {
  try { res.json({ settings: await loadJSON(path.join(__dirname, `data/csa-settings-${req.params.userId}.json`), {}) }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// CSA Widget embed code
app.get('/api/csa/widget/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const settingsFile = path.join(__dirname, `data/csa-settings-${userId}.json`);
    const settings = await loadJSON(settingsFile, {});
    const widget = settings.widget || {};
    const baseUrl = 'https://natural-energy-production-df04.up.railway.app';
    const embedCode = `<!-- Mubyn OS Chat Widget -->\n<script src="${baseUrl}/api/widget.js?id=${userId}" async></script>`;
    res.json({ success: true, embed_code: embedCode, widget_id: userId, config: widget });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ============================================
// 5b. CSA TELEGRAM BOT — Connect, Webhook, Disconnect, Status
// ============================================

const TELEGRAM_WEBHOOK_BASE = 'https://natural-energy-production-df04.up.railway.app/api/csa/telegram/webhook';

async function validateTelegramToken(botToken) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await r.json();
    if (!data.ok) return { success: false, error: data.description || 'Invalid bot token' };
    return { success: true, data: data.result };
  } catch (err) {
    return { success: false, error: 'Failed to reach Telegram API' };
  }
}

async function setTelegramWebhookAPI(botToken, webhookUrl) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'callback_query'] }),
    });
    const data = await r.json();
    if (!data.ok) return { success: false, error: data.description };
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to set webhook' };
  }
}

async function deleteTelegramWebhookAPI(botToken) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
    const data = await r.json();
    if (!data.ok) return { success: false, error: data.description };
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to delete webhook' };
  }
}

async function sendTelegramMessage(botToken, chatId, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    return await r.json();
  } catch (err) {
    console.error('Telegram send error:', err);
    return null;
  }
}

// POST /api/csa/telegram/connect
app.post('/api/csa/telegram/connect', async (req, res) => {
  try {
    const { userId, bot_token } = req.body;
    if (!userId || !bot_token) return res.status(400).json({ error: 'userId and bot_token required' });

    const botInfo = await validateTelegramToken(bot_token);
    if (!botInfo.success) return res.status(400).json({ success: false, error: botInfo.error });

    const botId = String(botInfo.data.id);
    const botUsername = botInfo.data.username;

    const webhookUrl = `${TELEGRAM_WEBHOOK_BASE}/${userId}`;
    const whResult = await setTelegramWebhookAPI(bot_token, webhookUrl);
    if (!whResult.success) return res.status(400).json({ success: false, error: `Webhook failed: ${whResult.error}` });

    const channelsFile = path.join(__dirname, `data/csa-telegram-${userId}.json`);
    const channelData = {
      userId, channel_type: 'telegram', bot_token, bot_id: botId,
      bot_username: botUsername, bot_first_name: botInfo.data.first_name,
      webhook_url: webhookUrl, webhook_set: true, is_active: true,
      connected_at: new Date().toISOString(),
    };
    await saveJSON(channelsFile, channelData);

    console.log(`✅ Telegram bot @${botUsername} connected for user ${userId}`);
    res.json({ success: true, channel: { bot_username: botUsername, bot_id: botId, bot_first_name: botInfo.data.first_name, webhook_url: webhookUrl } });
  } catch (e) {
    console.error('Telegram connect error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/csa/telegram/disconnect
app.post('/api/csa/telegram/disconnect', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const channelsFile = path.join(__dirname, `data/csa-telegram-${userId}.json`);
    const channel = await loadJSON(channelsFile, null);
    if (!channel || !channel.is_active) return res.status(404).json({ success: false, error: 'No active Telegram channel found' });

    if (channel.bot_token) await deleteTelegramWebhookAPI(channel.bot_token);

    channel.is_active = false;
    channel.webhook_set = false;
    channel.disconnected_at = new Date().toISOString();
    await saveJSON(channelsFile, channel);

    console.log(`🔌 Telegram bot @${channel.bot_username} disconnected for user ${userId}`);
    res.json({ success: true, message: 'Telegram bot disconnected' });
  } catch (e) {
    console.error('Telegram disconnect error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/csa/telegram/status/:userId
app.get('/api/csa/telegram/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const channelsFile = path.join(__dirname, `data/csa-telegram-${userId}.json`);
    const channel = await loadJSON(channelsFile, null);

    if (!channel || !channel.is_active) return res.json({ connected: false });

    res.json({
      connected: true,
      bot_username: channel.bot_username,
      bot_id: channel.bot_id,
      bot_first_name: channel.bot_first_name,
      connected_at: channel.connected_at,
    });
  } catch (e) {
    res.status(500).json({ connected: false, error: e.message });
  }
});

// POST /api/csa/telegram/webhook/:userId — Receives Telegram messages, auto-responds
app.post('/api/csa/telegram/webhook/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const body = req.body;

    const message = body.message || body.edited_message;
    if (!message || !message.text) return res.json({ ok: true });

    const chatId = message.chat.id.toString();
    const messageText = message.text;
    const userName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || message.from?.username || 'Customer';
    const telegramUserId = message.from?.id?.toString();

    console.log(`📨 Telegram message from ${userName} (chat ${chatId}) for user ${userId}: ${messageText.substring(0, 100)}`);

    const channelsFile = path.join(__dirname, `data/csa-telegram-${userId}.json`);
    const channel = await loadJSON(channelsFile, null);
    if (!channel || !channel.is_active || !channel.bot_token) {
      console.error(`❌ No active Telegram channel for user ${userId}`);
      return res.json({ ok: true });
    }

    // Load KB
    const kbFile = path.join(__dirname, `data/csa-kb-${userId}.json`);
    const savedKb = await loadJSON(kbFile, []);
    const activeKb = savedKb.filter(kb => kb.is_active !== false);
    let kbContext = '';
    if (activeKb.length > 0) {
      kbContext = '\n\nKnowledge Base (use this to answer accurately):\n' +
        activeKb.map(kb => `Q: ${kb.title}\nA: ${kb.content}`).join('\n\n');
    }

    // Load tone
    const settingsFile = path.join(__dirname, `data/csa-settings-${userId}.json`);
    const settings = await loadJSON(settingsFile, {});
    let toneInstructions = '';
    if (settings.tone) toneInstructions += `\nTone: ${settings.tone}.`;
    if (settings.language) toneInstructions += `\nLanguage: ${settings.language}.`;
    if (settings.response_length) toneInstructions += `\nResponse length: ${settings.response_length}.`;
    if (settings.custom_instructions) toneInstructions += `\nAdditional instructions: ${settings.custom_instructions}`;

    const users = await loadJSON(path.join(__dirname, 'data/users.json'), []);
    const user = users.find(u => u.id === userId);
    const businessName = user?.business_name || 'our business';

    const systemPrompt = `You are a professional customer support agent for ${businessName}. You help customers via Telegram.
Be empathetic, clear, and solution-oriented. Keep responses concise and mobile-friendly.
Customer name: ${userName}.${toneInstructions}${kbContext}`;

    const aiResponse = await openaiChat(systemPrompt, messageText, 512);
    await sendTelegramMessage(channel.bot_token, chatId, aiResponse);

    // Store conversation
    const convoFile = path.join(__dirname, `data/csa-telegram-convos-${userId}.json`);
    const convos = await loadJSON(convoFile, []);
    convos.push({
      id: crypto.randomUUID(), channel: 'telegram', chat_id: chatId,
      telegram_user_id: telegramUserId, user_name: userName,
      customer_message: messageText, ai_response: aiResponse,
      timestamp: new Date().toISOString(),
    });
    if (convos.length > 500) convos.splice(0, convos.length - 500);
    await saveJSON(convoFile, convos);

    // Also save to main CSA conversations
    const csaFile = path.join(__dirname, `data/csa-${userId}.json`);
    const csaConvos = await loadJSON(csaFile, []);
    csaConvos.push({
      id: crypto.randomUUID(),
      customer_message: `[Telegram - ${userName}] ${messageText}`,
      ai_response: aiResponse,
      business_context: `Telegram bot @${channel.bot_username}`,
      channel: 'telegram',
      timestamp: new Date().toISOString(),
    });
    await saveJSON(csaFile, csaConvos);

    console.log(`✅ AI replied to ${userName} on Telegram`);
    res.json({ ok: true });
  } catch (e) {
    console.error('Telegram webhook error:', e);
    res.json({ ok: true, error: e.message });
  }
});

// ============================================
// 6. CFO — AI Financial Intelligence
// ============================================

// Helper: parse JSON from AI response (tolerant of markdown fences)
function parseAIJson(raw) {
  try { return JSON.parse(raw); } catch {}
  const arrM = raw.match(/\[[\s\S]*\]/);
  if (arrM) try { return JSON.parse(arrM[0]); } catch {}
  const objM = raw.match(/\{[\s\S]*\}/);
  if (objM) try { return JSON.parse(objM[0]); } catch {}
  return null;
}

// POST /api/cfo/generate — Generate financial projections using GPT-4o
app.post('/api/cfo/generate', async (req, res) => {
  try {
    const { userId, industry, location, businessName, monthlyRevenue, monthlyExpenses } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const now = new Date();
    const months = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push(d.toLocaleString('en-US', { month: 'short', year: 'numeric' }));
    }

    const systemPrompt = `You are an expert CFO and financial analyst. Generate realistic financial data and projections for a business. 
Be specific to their industry and location. Use realistic numbers — not too optimistic, not too pessimistic.

Return ONLY valid JSON (no markdown, no code fences, no explanation). The JSON must match this EXACT structure:
{
  "monthlyRevenue": number,
  "monthlyExpenses": number,
  "netProfit": number,
  "profitMargin": "string with %",
  "projections": [
    { "month": "Mon YYYY", "revenue": number, "expenses": number }
  ],
  "insights": [
    "string — specific, actionable insight about their business"
  ],
  "kpis": {
    "cashRunway": "string",
    "burnRate": number,
    "breakEvenPoint": "string",
    "customerAcquisitionCost": number
  }
}

The projections array must have exactly 6 entries for these months: ${months.join(', ')}.
The insights array must have exactly 4 entries.
All numbers should be realistic for the given industry and location.`;

    const userPrompt = `Generate financial data for:
- Business: ${businessName || 'Small business'}
- Industry: ${industry || 'General services'}
- Location: ${location || 'UAE'}
${monthlyRevenue ? `- Current monthly revenue: $${monthlyRevenue}` : ''}
${monthlyExpenses ? `- Current monthly expenses: $${monthlyExpenses}` : ''}

If no revenue/expenses given, estimate realistic numbers for a ${industry || 'general'} business in ${location || 'the UAE'}.
Show moderate growth (5-15% over 6 months). Be realistic.`;

    const rawResponse = await openaiChat(systemPrompt, userPrompt, 2000);
    const financialData = parseAIJson(rawResponse);
    if (!financialData || !financialData.monthlyRevenue) {
      return res.status(500).json({ error: 'Failed to parse financial data from AI' });
    }

    // Store the generated data
    const cfoFile = path.join(__dirname, 'data', `cfo-${userId}.json`);
    const stored = {
      ...financialData,
      userId,
      industry: industry || 'General',
      location: location || 'UAE',
      businessName: businessName || '',
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveJSON(cfoFile, stored);

    res.json({ success: true, data: stored });
  } catch (e) {
    console.error('CFO generate error:', e);
    res.status(500).json({ error: 'Financial projection generation failed', details: e.message });
  }
});

// GET /api/cfo/transactions/:userId — Get transactions (MUST be before /api/cfo/:userId)
app.get('/api/cfo/transactions/:userId', async (req, res) => {
  try {
    const txFile = path.join(__dirname, 'data', `cfo-transactions-${req.params.userId}.json`);
    const transactions = await loadJSON(txFile, []);
    res.json({ transactions });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch transactions' }); }
});

// POST /api/cfo/transaction — Add a transaction (income/expense)
app.post('/api/cfo/transaction', async (req, res) => {
  try {
    const { userId, type, amount, category, description, date } = req.body;
    if (!userId || !type || !amount) return res.status(400).json({ error: 'userId, type, and amount required' });
    if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'type must be income or expense' });

    const txFile = path.join(__dirname, 'data', `cfo-transactions-${userId}.json`);
    const transactions = await loadJSON(txFile, []);
    const tx = {
      id: crypto.randomUUID(),
      type,
      amount: parseFloat(amount),
      category: category || (type === 'income' ? 'Revenue' : 'Operating'),
      description: description || '',
      date: date || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };
    transactions.unshift(tx);
    await saveJSON(txFile, transactions);
    res.json({ success: true, transaction: tx });
  } catch (e) {
    console.error('Transaction error:', e);
    res.status(500).json({ error: 'Failed to add transaction' });
  }
});

// DELETE /api/cfo/transaction/:userId/:txId — Delete a transaction
app.delete('/api/cfo/transaction/:userId/:txId', async (req, res) => {
  try {
    const { userId, txId } = req.params;
    const txFile = path.join(__dirname, 'data', `cfo-transactions-${userId}.json`);
    const transactions = await loadJSON(txFile, []);
    const filtered = transactions.filter(t => t.id !== txId);
    if (filtered.length === transactions.length) return res.status(404).json({ error: 'Transaction not found' });
    await saveJSON(txFile, filtered);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Delete failed' }); }
});

// GET /api/cfo/:userId — Get stored financial data (AFTER specific routes)
app.get('/api/cfo/:userId', async (req, res) => {
  try {
    const cfoFile = path.join(__dirname, 'data', `cfo-${req.params.userId}.json`);
    const data = await loadJSON(cfoFile, null);
    if (!data) return res.json({ data: null });
    res.json({ data });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch CFO data' }); }
});

// ============================================
// ============================================
// MOUNT MUBYN ROUTES (additional endpoints from mubyn-routes.js)
// These provide: Settings, Smart Caesar, User SMTP, CSA Email channel
// ============================================
try {
  const mubynRoutes = require('./lib/mubyn-routes.js');
  app.use('/api', mubynRoutes);
  console.log('✅ Mubyn extended routes mounted at /api');
} catch (e) {
  console.error('⚠️ Could not load mubyn-routes.js:', e.message);
}

// ============================================
// WEBSITE WIDGET — Embeddable Chat for Any Site
// ============================================

// POST /api/website/widget/config — Save widget configuration
app.post('/api/website/widget/config', async (req, res) => {
  try {
    const { userId, primaryColor, position, welcomeMessage, botName, buttonText } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const settingsFile = path.join(__dirname, `data/csa-settings-${userId}.json`);
    const settings = await loadJSON(settingsFile, {});
    settings.widget = {
      ...(settings.widget || {}),
      primaryColor: primaryColor || settings.widget?.primaryColor || '#D4A843',
      position: position || settings.widget?.position || 'bottom-right',
      welcomeMessage: welcomeMessage !== undefined ? welcomeMessage : (settings.widget?.welcomeMessage || 'Hi! How can I help you today?'),
      botName: botName !== undefined ? botName : (settings.widget?.botName || 'Support'),
      buttonText: buttonText !== undefined ? buttonText : (settings.widget?.buttonText || 'Chat with us'),
    };
    settings.updated_at = new Date().toISOString();
    await saveJSON(settingsFile, settings);
    res.json({ success: true, config: settings.widget });
  } catch (e) {
    console.error('Widget config save error:', e);
    res.status(500).json({ error: 'Failed to save widget config' });
  }
});

// GET /api/website/widget/:userId — Returns embed code + config
app.get('/api/website/widget/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const settingsFile = path.join(__dirname, `data/csa-settings-${userId}.json`);
    const settings = await loadJSON(settingsFile, {});
    const widget = settings.widget || {};
    const baseUrl = 'https://natural-energy-production-df04.up.railway.app';
    const embedCode = `<!-- Mubyn OS Chat Widget -->\n<script src="${baseUrl}/api/widget.js?id=${userId}" async></script>`;
    res.json({ success: true, embed_code: embedCode, widget_id: userId, config: widget });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// GET /api/widget.js — Serve the self-contained chat widget JavaScript
app.get('/api/widget.js', async (req, res) => {
  const userId = req.query.id;
  if (!userId) {
    res.set('Content-Type', 'application/javascript');
    return res.send('console.error("Mubyn Widget: Missing id parameter");');
  }

  // Allow from ANY origin
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');

  // Load widget config
  let config = {};
  try {
    const settingsFile = path.join(__dirname, `data/csa-settings-${userId}.json`);
    const settings = await loadJSON(settingsFile, {});
    config = settings.widget || {};
  } catch (e) { /* defaults */ }

  // Load user business name
  let businessName = 'Support';
  try {
    const users = await loadJSON(path.join(__dirname, 'data/users.json'), []);
    const user = users.find(u => u.id === userId);
    if (user && user.business_name) businessName = user.business_name;
  } catch (e) { /* default */ }

  const primaryColor = config.primaryColor || '#D4A843';
  const position = config.position || 'bottom-right';
  const welcomeMessage = config.welcomeMessage || 'Hi! How can I help you today?';
  const botName = config.botName || businessName || 'Support';
  const apiBase = 'https://natural-energy-production-df04.up.railway.app';

  const widgetJS = `(function(){
  if(window.__mubynWidgetLoaded)return;
  window.__mubynWidgetLoaded=true;
  var USER_ID="${userId}";
  var API="${apiBase}";
  var COLOR="${primaryColor}";
  var POS="${position}";
  var WELCOME=${JSON.stringify(welcomeMessage)};
  var BOT_NAME=${JSON.stringify(botName)};
  var SESSION_KEY="mubyn_session_"+USER_ID;
  var messages=[];
  var isOpen=false;
  var isLoading=false;

  var host=document.createElement("div");
  host.id="mubyn-widget-host";
  host.style.cssText="position:fixed;bottom:0;${position === 'bottom-left' ? 'left' : 'right'}:0;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  document.body.appendChild(host);

  try{var saved=localStorage.getItem(SESSION_KEY);if(saved)messages=JSON.parse(saved);}catch(e){}
  if(messages.length===0){messages.push({role:"agent",content:WELCOME,ts:Date.now()});}

  function saveSession(){try{localStorage.setItem(SESSION_KEY,JSON.stringify(messages.slice(-50)));}catch(e){}}
  function escHtml(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML;}

  function render(){
    var posStyle=POS==="bottom-left"?"left:20px":"right:20px";
    var posStyleMob=POS==="bottom-left"?"left:16px":"right:16px";
    var html='<style>'
      +'#mw-bubble{position:fixed;bottom:20px;'+posStyle+';width:60px;height:60px;border-radius:50%;background:'+COLOR+';cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(0,0,0,0.3);transition:transform 0.2s,box-shadow 0.2s;border:none;z-index:2147483647;}'
      +'#mw-bubble:hover{transform:scale(1.08);box-shadow:0 6px 32px rgba(0,0,0,0.4);}'
      +'#mw-bubble svg{width:28px;height:28px;fill:white;}'
      +'#mw-panel{position:fixed;bottom:90px;'+posStyle+';width:380px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);background:#1C1C24;border-radius:16px;box-shadow:0 8px 48px rgba(0,0,0,0.5);display:'+(isOpen?'flex':'none')+';flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,0.08);z-index:2147483647;animation:'+(isOpen?'mwSlideUp 0.25s ease':'none')+';}'
      +'@keyframes mwSlideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}'
      +'#mw-header{padding:16px 20px;background:'+COLOR+';display:flex;align-items:center;gap:12px;flex-shrink:0;}'
      +'#mw-header-avatar{width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;}'
      +'#mw-header-avatar svg{width:20px;height:20px;fill:rgba(0,0,0,0.7);}'
      +'#mw-header-info{flex:1;}'
      +'#mw-header-name{font-size:15px;font-weight:600;color:rgba(0,0,0,0.87);margin:0;line-height:1.3;}'
      +'#mw-header-status{font-size:11px;color:rgba(0,0,0,0.55);margin:0;}'
      +'#mw-close{width:32px;height:32px;border-radius:8px;background:rgba(0,0,0,0.1);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;}'
      +'#mw-close:hover{background:rgba(0,0,0,0.2);}'
      +'#mw-close svg{width:16px;height:16px;fill:rgba(0,0,0,0.6);}'
      +'#mw-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}'
      +'#mw-messages::-webkit-scrollbar{width:4px;}#mw-messages::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px;}'
      +'.mw-msg{max-width:85%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap;}'
      +'.mw-msg-agent{align-self:flex-start;background:rgba(255,255,255,0.08);color:#e0e0e0;border-bottom-left-radius:4px;}'
      +'.mw-msg-customer{align-self:flex-end;background:'+COLOR+';color:rgba(0,0,0,0.87);border-bottom-right-radius:4px;}'
      +'.mw-typing{align-self:flex-start;padding:12px 18px;background:rgba(255,255,255,0.08);border-radius:16px;border-bottom-left-radius:4px;display:'+(isLoading?'flex':'none')+';gap:5px;align-items:center;}'
      +'.mw-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,0.35);animation:mwBounce 1.2s infinite;}'
      +'.mw-dot:nth-child(2){animation-delay:0.15s;}.mw-dot:nth-child(3){animation-delay:0.3s;}'
      +'@keyframes mwBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}'
      +'#mw-input-area{padding:12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;flex-shrink:0;background:#1C1C24;}'
      +'#mw-input{flex:1;border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:10px 16px;font-size:14px;color:#fff;background:rgba(255,255,255,0.04);outline:none;font-family:inherit;resize:none;}'
      +'#mw-input:focus{border-color:'+COLOR+';}'
      +'#mw-input::placeholder{color:rgba(255,255,255,0.3);}'
      +'#mw-send{width:40px;height:40px;border-radius:50%;background:'+COLOR+';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity 0.15s;flex-shrink:0;}'
      +'#mw-send:hover{opacity:0.85;}#mw-send:disabled{opacity:0.4;cursor:default;}'
      +'#mw-send svg{width:18px;height:18px;fill:rgba(0,0,0,0.7);}'
      +'#mw-powered{text-align:center;padding:6px;font-size:10px;color:rgba(255,255,255,0.2);flex-shrink:0;}'
      +'#mw-powered a{color:rgba(255,255,255,0.3);text-decoration:none;}#mw-powered a:hover{color:rgba(255,255,255,0.5);}'
      +'@media(max-width:480px){#mw-panel{width:100%;max-width:100%;height:100%;max-height:100%;bottom:0;left:0;right:0;border-radius:0;}#mw-bubble{bottom:16px;'+posStyleMob+';width:56px;height:56px;}}'
      +'</style>';

    html+='<div id="mw-panel">'
      +'<div id="mw-header">'
      +'<div id="mw-header-avatar"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg></div>'
      +'<div id="mw-header-info"><p id="mw-header-name">'+escHtml(BOT_NAME)+'</p><p id="mw-header-status">Online \\u2014 typically replies instantly</p></div>'
      +'<button id="mw-close" onclick="window.__mubynToggle()"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>'
      +'</div>';

    html+='<div id="mw-messages">';
    for(var i=0;i<messages.length;i++){
      var m=messages[i];
      html+='<div class="mw-msg mw-msg-'+m.role+'">'+escHtml(m.content)+'</div>';
    }
    html+='<div class="mw-typing"><div class="mw-dot"></div><div class="mw-dot"></div><div class="mw-dot"></div></div>';
    html+='</div>';

    html+='<div id="mw-input-area">'
      +'<input id="mw-input" placeholder="Type your message..." autocomplete="off"/>'
      +'<button id="mw-send" '+(isLoading?'disabled':'')+' onclick="window.__mubynSend()"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>'
      +'</div>';
    html+='<div id="mw-powered">Powered by <a href="https://mubyn.com" target="_blank">Mubyn</a></div>';
    html+='</div>';

    html+='<button id="mw-bubble" onclick="window.__mubynToggle()">'
      +(isOpen
        ?'<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
        :'<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>')
      +'</button>';

    host.innerHTML=html;

    if(isOpen){
      var msgs=host.querySelector("#mw-messages");
      if(msgs)msgs.scrollTop=msgs.scrollHeight;
      var inp=host.querySelector("#mw-input");
      if(inp){
        inp.addEventListener("keydown",function(e){
          if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();window.__mubynSend();}
        });
        setTimeout(function(){inp.focus();},100);
      }
    }
  }

  window.__mubynToggle=function(){isOpen=!isOpen;render();};

  window.__mubynSend=function(){
    var inp=host.querySelector("#mw-input");
    if(!inp)return;
    var text=inp.value.trim();
    if(!text||isLoading)return;
    messages.push({role:"customer",content:text,ts:Date.now()});
    isLoading=true;
    saveSession();
    render();

    fetch(API+"/api/csa/respond",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({customer_message:text,userId:USER_ID,business_context:"Website visitor chat via Mubyn widget. Page: "+location.href})
    })
    .then(function(r){return r.json();})
    .then(function(data){
      var reply=data.response||data.message||"Sorry, I couldn't process that. Please try again.";
      messages.push({role:"agent",content:reply,ts:Date.now()});
      isLoading=false;saveSession();render();
    })
    .catch(function(err){
      messages.push({role:"agent",content:"Sorry, something went wrong. Please try again.",ts:Date.now()});
      isLoading=false;saveSession();render();
    });
  };

  render();

  try{
    fetch(API+"/api/widget/event",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({userId:USER_ID,event:"pageview",url:location.href,referrer:document.referrer,ua:navigator.userAgent,ts:Date.now()})
    }).catch(function(){});
  }catch(e){}
})();`;

  res.send(widgetJS);
});

// Widget CORS pre-flight for cross-origin widget chat
app.options('/api/csa/respond', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

// Widget analytics event
app.post('/api/widget/event', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const { userId, event, url, referrer, ua, ts } = req.body || {};
  if (userId && event) {
    const eventFile = path.join(__dirname, `data/widget-events-${userId}.jsonl`);
    const entry = JSON.stringify({ event, url, referrer, ua, ts: ts || Date.now(), recorded: new Date().toISOString() });
    fs.appendFile(eventFile, entry + '\n').catch(() => {});
  }
  res.json({ ok: true });
});

app.options('/api/widget/event', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});

// ============================================
// 🌐 AI WEBSITE BUILDER — Generate + Preview + Publish + Edit
// ============================================

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

// POST /api/website/generate — AI generates a full website
app.post('/api/website/generate', async (req, res) => {
  try {
    const { userId, businessName, description, industry, style, language, phone, email: bizEmail, address, whatsapp } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!businessName) return res.status(400).json({ error: 'businessName required' });

    const subdomain = slugify(businessName);
    const lang = language || 'en';
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    const fontLink = lang === 'ar'
      ? `<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">`
      : `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">`;
    const fontFamily = lang === 'ar' ? 'Tajawal' : 'Inter';

    console.log(`🌐 [Website Builder] Generating site for "${businessName}" (${industry || 'general'}) — user ${userId}`);

    const systemPrompt = `You are a world-class web designer and developer. You create stunning, modern, 2026-quality single-page websites.

CRITICAL RULES:
1. Return ONLY the complete HTML document. No markdown fences, no explanation — just raw HTML starting with <!DOCTYPE html>.
2. Use Tailwind CSS via CDN (<script src="https://cdn.tailwindcss.com"></script>).
3. The site MUST be responsive (mobile-first), visually stunning, and production-ready.
4. Use modern design: subtle gradients, glassmorphism effects, smooth scroll, hover animations, CSS transitions.
5. Include a Tailwind config script to define custom colors based on the business industry.
6. All images use placeholder URLs from https://images.unsplash.com (pick relevant search terms and use source.unsplash.com/800x600/?keyword format).
7. Include smooth scroll behavior, intersection observer animations (fade-in on scroll), and a mobile hamburger menu.
8. Language: ${lang}. Direction: ${dir}. Font: ${fontFamily}.
9. Must include these sections: Navigation (sticky), Hero (full viewport, gradient overlay on image), About/Story, Services/Features (grid), Testimonials (carousel or cards), Stats/Numbers, CTA section, Contact info, Footer with "Powered by Mubyn" link.
10. The design quality should match Vercel, Linear, or Stripe's website — clean, modern, premium feel.
11. Use the business's industry to pick appropriate colors, imagery keywords, and tone.
12. Add subtle CSS animations: @keyframes for fade-in, slide-up effects. Use Tailwind's animate utilities and custom ones.
13. Include meta tags for SEO (title, description, og:tags).
14. WhatsApp CTA button (floating, bottom-right) if whatsapp number is provided.
15. Make the hero section impactful — large text, gradient overlay on a relevant background image, compelling CTA.
16. Include a mobile hamburger menu that works with pure CSS/JS (no frameworks needed).
17. Ensure text contrast is readable, buttons have hover states, and spacing is generous.`;

    const userPrompt = `Create a complete, stunning website for this business:

Business Name: ${businessName}
Industry: ${industry || 'General Business'}
Description: ${description || `A professional ${industry || 'business'} providing quality services.`}
Language: ${lang}
${phone ? `Phone: ${phone}` : ''}
${bizEmail ? `Email: ${bizEmail}` : ''}
${address ? `Address: ${address}` : ''}
${whatsapp ? `WhatsApp: ${whatsapp}` : ''}
${style ? `Style preference: ${style}` : ''}

Generate the COMPLETE HTML file. Start with <!DOCTYPE html> and end with </html>. No explanations.`;

    const htmlResponse = await openaiChat(systemPrompt, userPrompt, 16000);

    // Extract HTML — strip markdown fences if present
    let html = htmlResponse.trim();
    if (html.startsWith('```')) {
      html = html.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    // Ensure it starts with DOCTYPE
    if (!html.toLowerCase().startsWith('<!doctype')) {
      const dtIdx = html.toLowerCase().indexOf('<!doctype');
      if (dtIdx > -1) html = html.slice(dtIdx);
    }

    // Inject "Powered by Mubyn" if not present
    if (!html.includes('mubyn.com') && !html.includes('Mubyn')) {
      html = html.replace('</body>', `
<!-- Powered by Mubyn -->
<div style="text-align:center;padding:12px;font-size:11px;color:#888;border-top:1px solid rgba(255,255,255,0.05);">
  <a href="https://mubyn.com" target="_blank" style="color:#D4A843;text-decoration:none;">Powered by Mubyn</a>
</div>
</body>`);
    }

    // Save the generated HTML
    const websiteDir = path.join(__dirname, 'data', 'websites', userId);
    await fs.mkdir(websiteDir, { recursive: true });
    await fs.writeFile(path.join(websiteDir, 'index.html'), html, 'utf8');

    // Save metadata
    const metaFile = path.join(websiteDir, 'meta.json');
    const meta = {
      userId,
      businessName,
      subdomain,
      industry: industry || 'general',
      description: description || '',
      language: lang,
      style: style || '',
      phone: phone || '',
      email: bizEmail || '',
      address: address || '',
      whatsapp: whatsapp || '',
      status: 'draft',
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: null,
    };
    await saveJSON(metaFile, meta);

    const baseUrl = process.env.BASE_URL || `https://natural-energy-production-df04.up.railway.app`;
    const previewUrl = `${baseUrl}/api/website/preview/${userId}`;
    const siteUrl = `${baseUrl}/site/${subdomain}`;

    console.log(`✅ [Website Builder] Generated for "${businessName}" → ${siteUrl}`);

    res.json({
      success: true,
      html,
      subdomain,
      previewUrl,
      siteUrl,
      meta,
    });
  } catch (error) {
    console.error('❌ Website generate error:', error);
    res.status(500).json({ error: 'Website generation failed', details: error.message });
  }
});

// GET /api/website/preview/:userId — Returns the generated HTML
app.get('/api/website/preview/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const htmlFile = path.join(__dirname, 'data', 'websites', userId, 'index.html');
    const html = await fs.readFile(htmlFile, 'utf8');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(404).send('<html><body><h1>No website generated yet</h1><p>Use Mubyn OS to generate your website.</p></body></html>');
  }
});

// GET /api/website/meta/:userId — Returns website metadata
app.get('/api/website/meta/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const metaFile = path.join(__dirname, 'data', 'websites', userId, 'meta.json');
    const meta = await loadJSON(metaFile, null);
    if (!meta) return res.json({ exists: false });
    res.json({ exists: true, meta });
  } catch (error) {
    res.json({ exists: false });
  }
});

// POST /api/website/publish — Makes the site live at /site/:subdomain
app.post('/api/website/publish', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const websiteDir = path.join(__dirname, 'data', 'websites', userId);
    const metaFile = path.join(websiteDir, 'meta.json');
    const meta = await loadJSON(metaFile, null);
    if (!meta) return res.status(404).json({ error: 'No website found. Generate one first.' });

    // Check for subdomain collision
    const publishedDir = path.join(__dirname, 'data', 'websites', '_published');
    await fs.mkdir(publishedDir, { recursive: true });

    let subdomain = meta.subdomain;
    const mappingFile = path.join(publishedDir, 'subdomain-map.json');
    const mapping = await loadJSON(mappingFile, {});

    // If another user already has this subdomain, add a suffix
    if (mapping[subdomain] && mapping[subdomain] !== userId) {
      const suffix = Math.random().toString(36).slice(2, 6);
      subdomain = `${subdomain}-${suffix}`;
    }

    // Register subdomain → userId mapping
    mapping[subdomain] = userId;
    await saveJSON(mappingFile, mapping);

    // Update meta
    meta.subdomain = subdomain;
    meta.status = 'published';
    meta.publishedAt = new Date().toISOString();
    meta.updatedAt = new Date().toISOString();
    await saveJSON(metaFile, meta);

    const baseUrl = process.env.BASE_URL || 'https://natural-energy-production-df04.up.railway.app';
    const siteUrl = `${baseUrl}/site/${subdomain}`;

    console.log(`🚀 [Website Builder] Published "${meta.businessName}" → ${siteUrl}`);

    res.json({
      success: true,
      subdomain,
      siteUrl,
      publishedAt: meta.publishedAt,
    });
  } catch (error) {
    console.error('❌ Website publish error:', error);
    res.status(500).json({ error: 'Publish failed', details: error.message });
  }
});

// PUT /api/website/edit — AI modifies the existing site based on instruction
app.put('/api/website/edit', async (req, res) => {
  try {
    const { userId, instruction } = req.body;
    if (!userId || !instruction) return res.status(400).json({ error: 'userId and instruction required' });

    const htmlFile = path.join(__dirname, 'data', 'websites', userId, 'index.html');
    let currentHtml;
    try {
      currentHtml = await fs.readFile(htmlFile, 'utf8');
    } catch {
      return res.status(404).json({ error: 'No website found. Generate one first.' });
    }

    console.log(`✏️ [Website Builder] Editing site for user ${userId}: "${instruction}"`);

    const systemPrompt = `You are a world-class web designer editing an existing HTML website. 
The user will give you the current HTML and an edit instruction.

RULES:
1. Return the COMPLETE modified HTML. Start with <!DOCTYPE html>, end with </html>.
2. Make ONLY the requested changes — preserve everything else.
3. Maintain the same design quality and consistency.
4. No markdown fences, no explanation — just the raw HTML.
5. Keep all existing animations, responsive design, and functionality.
6. If the edit is about style (colors, fonts, sizes), apply it tastefully.
7. If the edit is about content (text, images, sections), update accordingly.`;

    const userPrompt = `Here is the current website HTML:

${currentHtml}

---

EDIT INSTRUCTION: ${instruction}

Return the complete modified HTML. No explanation, just the HTML starting with <!DOCTYPE html>.`;

    const editedHtml = await openaiChat(systemPrompt, userPrompt, 16000);

    // Extract HTML
    let html = editedHtml.trim();
    if (html.startsWith('```')) {
      html = html.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    if (!html.toLowerCase().startsWith('<!doctype')) {
      const dtIdx = html.toLowerCase().indexOf('<!doctype');
      if (dtIdx > -1) html = html.slice(dtIdx);
    }

    // Save
    await fs.writeFile(htmlFile, html, 'utf8');

    // Update meta
    const metaFile = path.join(__dirname, 'data', 'websites', userId, 'meta.json');
    const meta = await loadJSON(metaFile, {});
    meta.updatedAt = new Date().toISOString();
    meta.lastEdit = instruction;
    await saveJSON(metaFile, meta);

    console.log(`✅ [Website Builder] Edit applied for user ${userId}`);

    res.json({ success: true, html });
  } catch (error) {
    console.error('❌ Website edit error:', error);
    res.status(500).json({ error: 'Edit failed', details: error.message });
  }
});

// GET /site/:subdomain — Serve published websites (the actual live site!)
app.get('/site/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;

    // Look up subdomain → userId
    const mappingFile = path.join(__dirname, 'data', 'websites', '_published', 'subdomain-map.json');
    const mapping = await loadJSON(mappingFile, {});
    const userId = mapping[subdomain];

    if (!userId) {
      return res.status(404).send(`<!DOCTYPE html><html><head><title>Site Not Found</title><style>body{font-family:Inter,sans-serif;background:#0B0B0F;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;}a{color:#D4A843;}</style></head><body><div><h1>🔍 Site Not Found</h1><p>No site exists at this address.</p><p><a href="https://mubyn.com">Build yours with Mubyn →</a></p></div></body></html>`);
    }

    const htmlFile = path.join(__dirname, 'data', 'websites', userId, 'index.html');
    const html = await fs.readFile(htmlFile, 'utf8');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (error) {
    res.status(500).send('<html><body><h1>Error loading site</h1></body></html>');
  }
});

// ============================================

// SERVE DASHBOARD STATIC FILES
// ============================================
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

app.listen(PORT, () => {
  console.log(`🏛️ Caesar's Legions API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`   🚀 Mubyn OS endpoints ready for VC demo!`);
  console.log(`   🔌 Widget: /api/widget.js?id=USER_ID`);
  console.log(`   🌐 Website Builder: /api/website/generate, /site/:subdomain`);
});
