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
const PORT = process.env.PORT || 3000;

// CORS - restrict to allowed domains
const ALLOWED_ORIGINS = [
  'https://caesarslegions.ai',
  'https://promptabusiness.com',
  'https://www.promptabusiness.com',
  'https://makhlab.promptabusiness.com',
  'https://luna.promptabusiness.com',
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
// SERVE DASHBOARD STATIC FILES
// ============================================
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

app.listen(PORT, () => {
  console.log(`🏛️ Caesar's Legions API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Dashboard: http://localhost:${PORT}/dashboard`);
});
