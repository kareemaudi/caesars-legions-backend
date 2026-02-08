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

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - restrict to allowed domains
const ALLOWED_ORIGINS = [
  'https://caesarslegions.ai',
  'https://promptabusiness.com',
  'https://www.promptabusiness.com',
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

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
// CLIENT DASHBOARD API
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
// SERVE DASHBOARD STATIC FILES
// ============================================
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

app.listen(PORT, () => {
  console.log(`🏛️ Caesar's Legions API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Dashboard: http://localhost:${PORT}/dashboard`);
});
