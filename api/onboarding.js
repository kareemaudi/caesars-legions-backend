// ============================================================================
// AUTO-ONBOARDING - Caesar's Legions
// ============================================================================
// Purpose: Automatically onboard new paying clients
// Triggered by: Stripe webhook (checkout.session.completed)
// ============================================================================

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const ONBOARDING_STEPS = {
  WELCOME_EMAIL: 'welcome_email',
  CREATE_CLIENT_PROFILE: 'create_profile',
  GENERATE_ICP: 'generate_icp',
  SETUP_CAMPAIGN: 'setup_campaign',
  SCHEDULE_CALL: 'schedule_call',
  NOTIFY_TEAM: 'notify_team'
};

const CALENDLY_LINK = process.env.CALENDLY_LINK || 'https://calendly.com/caesars-legions/onboarding';

// ============================================================================
// MAIN ONBOARDING FUNCTION
// ============================================================================

async function startOnboarding(clientData) {
  const {
    customerId,
    email,
    name,
    company,
    website,
    painPoint,
    targetAudience,
    subscriptionId,
    sessionId
  } = clientData;

  console.log(`[ONBOARDING] 🎉 Starting onboarding for ${name} (${company})`);

  const onboardingId = `onb_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const onboardingLog = {
    id: onboardingId,
    started_at: new Date().toISOString(),
    client: { customerId, email, name, company, website },
    steps: [],
    status: 'in_progress'
  };

  try {
    // Step 1: Create client profile
    const profile = await createClientProfile({
      customerId,
      email,
      name,
      company,
      website,
      painPoint,
      targetAudience,
      subscriptionId
    });
    onboardingLog.steps.push({
      step: ONBOARDING_STEPS.CREATE_CLIENT_PROFILE,
      status: 'completed',
      timestamp: new Date().toISOString(),
      output: { clientId: profile.id }
    });

    // Step 2: Generate ICP (Ideal Customer Profile) from their input
    const icp = await generateICP({
      company,
      website,
      targetAudience,
      painPoint
    });
    onboardingLog.steps.push({
      step: ONBOARDING_STEPS.GENERATE_ICP,
      status: 'completed',
      timestamp: new Date().toISOString(),
      output: icp
    });

    // Step 3: Set up initial campaign structure
    const campaign = await setupInitialCampaign(profile.id, icp);
    onboardingLog.steps.push({
      step: ONBOARDING_STEPS.SETUP_CAMPAIGN,
      status: 'completed',
      timestamp: new Date().toISOString(),
      output: { campaignId: campaign.id }
    });

    // Step 4: Send welcome email
    await sendWelcomeEmail({
      email,
      name,
      company,
      clientId: profile.id,
      calendlyLink: CALENDLY_LINK
    });
    onboardingLog.steps.push({
      step: ONBOARDING_STEPS.WELCOME_EMAIL,
      status: 'completed',
      timestamp: new Date().toISOString()
    });

    // Step 5: Notify team (via Telegram if configured)
    await notifyTeam({
      type: 'new_client',
      name,
      company,
      email,
      mrr: 250, // Early bird pricing
      painPoint,
      targetAudience
    });
    onboardingLog.steps.push({
      step: ONBOARDING_STEPS.NOTIFY_TEAM,
      status: 'completed',
      timestamp: new Date().toISOString()
    });

    // Mark onboarding complete
    onboardingLog.status = 'completed';
    onboardingLog.completed_at = new Date().toISOString();

    console.log(`[ONBOARDING] ✅ Completed for ${name} (${company})`);
  } catch (err) {
    console.error(`[ONBOARDING] ❌ Error:`, err);
    onboardingLog.status = 'failed';
    onboardingLog.error = err.message;
  }

  // Save onboarding log
  saveOnboardingLog(onboardingLog);
  
  return onboardingLog;
}

// ============================================================================
// STEP IMPLEMENTATIONS
// ============================================================================

async function createClientProfile(data) {
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  const profile = {
    id: clientId,
    stripe_customer_id: data.customerId,
    stripe_subscription_id: data.subscriptionId,
    email: data.email,
    name: data.name,
    company: data.company,
    website: data.website,
    pain_point: data.painPoint,
    target_audience: data.targetAudience,
    plan: 'early_bird',
    mrr: 250,
    status: 'onboarding',
    created_at: new Date().toISOString(),
    campaigns: [],
    settings: {
      emails_per_week: 100,
      follow_up_enabled: true,
      follow_up_days: [3, 7],
      timezone: 'UTC',
      send_hours: { start: 9, end: 17 }
    }
  };

  // Save to clients directory
  const clientsDir = path.join(__dirname, '..', 'data', 'clients');
  if (!fs.existsSync(clientsDir)) {
    fs.mkdirSync(clientsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(clientsDir, `${clientId}.json`),
    JSON.stringify(profile, null, 2)
  );

  console.log(`[ONBOARDING] Created client profile: ${clientId}`);
  return profile;
}

async function generateICP(data) {
  const { company, website, targetAudience, painPoint } = data;

  // Basic ICP generation (can be enhanced with AI)
  const icp = {
    company_info: {
      name: company,
      website: website
    },
    target: {
      description: targetAudience,
      parsed: parseTargetAudience(targetAudience)
    },
    pain_points: [painPoint],
    suggested_verticals: inferVerticals(targetAudience),
    lead_criteria: {
      company_size: inferCompanySize(targetAudience),
      titles: inferTitles(targetAudience),
      industries: inferIndustries(targetAudience)
    }
  };

  console.log(`[ONBOARDING] Generated ICP for ${company}`);
  return icp;
}

async function setupInitialCampaign(clientId, icp) {
  const campaignId = `camp_${Date.now()}`;
  
  const campaign = {
    id: campaignId,
    client_id: clientId,
    name: `Initial Outreach - ${icp.company_info.name}`,
    status: 'draft',
    icp: icp,
    created_at: new Date().toISOString(),
    email_sequence: [
      {
        step: 1,
        type: 'initial',
        delay_days: 0,
        template: 'initial_outreach'
      },
      {
        step: 2,
        type: 'follow_up',
        delay_days: 3,
        template: 'follow_up_1'
      },
      {
        step: 3,
        type: 'follow_up',
        delay_days: 7,
        template: 'follow_up_2'
      }
    ],
    metrics: {
      emails_sent: 0,
      opens: 0,
      clicks: 0,
      replies: 0,
      positive_replies: 0
    }
  };

  // Save campaign
  const campaignsDir = path.join(__dirname, '..', 'data', 'campaigns');
  if (!fs.existsSync(campaignsDir)) {
    fs.mkdirSync(campaignsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(campaignsDir, `${campaignId}.json`),
    JSON.stringify(campaign, null, 2)
  );

  console.log(`[ONBOARDING] Created campaign: ${campaignId}`);
  return campaign;
}

async function sendWelcomeEmail(data) {
  const { email, name, company, clientId, calendlyLink } = data;

  const emailContent = {
    to: email,
    subject: `Welcome to Caesar's Legions, ${name.split(' ')[0]}! 🏛️`,
    body: `
Hey ${name.split(' ')[0]}!

Welcome to the Legion! You made a great call. Here's what happens next:

**1. Schedule Your Onboarding Call (Required)**
Book a 30-minute slot here: ${calendlyLink}

We'll review your ICP, approve your first email templates, and launch your first campaign together.

**2. What I Need From You (Before the Call)**
Reply to this email with:
- 2-3 examples of your ideal customers (LinkedIn profiles or company names)
- Any specific messaging angles you want to test
- Days/times when you DON'T want emails sent

**3. Your Dashboard**
Your client portal is being set up. I'll send credentials after our call.

**Quick Timeline:**
- Today: You're in the system ✅
- Within 48h: Onboarding call
- Within 72h: First campaign live

If anything's urgent, just reply to this email.

Welcome aboard!

— The Caesar's Legions Team

P.S. Follow the build journey: https://x.com/agenticCaesar
    `.trim(),
    from: 'team@caesars-legions.com',
    client_id: clientId,
    type: 'onboarding'
  };

  // Log the email (actual sending would use your email provider)
  const emailsDir = path.join(__dirname, '..', 'data', 'emails', 'outbound');
  if (!fs.existsSync(emailsDir)) {
    fs.mkdirSync(emailsDir, { recursive: true });
  }

  const emailFile = path.join(emailsDir, `welcome_${clientId}_${Date.now()}.json`);
  fs.writeFileSync(emailFile, JSON.stringify(emailContent, null, 2));

  console.log(`[ONBOARDING] Welcome email queued for ${email}`);
  
  // TODO: Integrate with actual email sending (Buttondown, Resend, etc.)
  // For now, log to send manually or via separate process
  
  return emailContent;
}

async function notifyTeam(data) {
  const { type, name, company, email, mrr, painPoint, targetAudience } = data;

  const notification = {
    timestamp: new Date().toISOString(),
    type,
    title: `🎉 New Client: ${company}`,
    message: `
**${name}** from **${company}** just signed up!

💰 MRR: $${mrr}
📧 Email: ${email}
🎯 Target: ${targetAudience}
😫 Pain: ${painPoint?.substring(0, 200) || 'Not specified'}

Next: Wait for them to book onboarding call.
    `.trim(),
    priority: 'high'
  };

  // Log notification
  const notifyDir = path.join(__dirname, '..', 'data', 'notifications');
  if (!fs.existsSync(notifyDir)) {
    fs.mkdirSync(notifyDir, { recursive: true });
  }

  fs.appendFileSync(
    path.join(notifyDir, 'team-notifications.jsonl'),
    JSON.stringify(notification) + '\n'
  );

  // Try to send via Telegram if configured
  try {
    const telegramNotifier = path.join(__dirname, '..', '..', 'telegram-notifier.js');
    if (fs.existsSync(telegramNotifier)) {
      const { sendTelegramMessage } = require(telegramNotifier);
      await sendTelegramMessage(notification.message, 'urgent');
      console.log(`[ONBOARDING] Team notified via Telegram`);
    }
  } catch (err) {
    console.log(`[ONBOARDING] Telegram notification skipped: ${err.message}`);
  }

  console.log(`[ONBOARDING] Team notification logged`);
  return notification;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseTargetAudience(audience) {
  if (!audience) return {};
  
  const result = {
    raw: audience,
    keywords: []
  };

  // Extract potential titles
  const titlePatterns = /\b(CEO|CTO|CFO|CMO|COO|VP|Director|Manager|Head of|Founder|Owner|President|Chief)\b/gi;
  const titles = audience.match(titlePatterns) || [];
  if (titles.length) result.keywords.push(...titles);

  // Extract company sizes
  const sizePatterns = /(\d+[-–]\d+|\d+\+)\s*(employees?|people|person)/gi;
  const sizes = audience.match(sizePatterns) || [];
  if (sizes.length) result.company_sizes = sizes;

  return result;
}

function inferVerticals(targetAudience) {
  if (!targetAudience) return ['SaaS', 'Technology'];
  
  const verticals = [];
  const lower = targetAudience.toLowerCase();

  const verticalMap = {
    'saas': 'SaaS',
    'software': 'Software',
    'tech': 'Technology',
    'fintech': 'FinTech',
    'healthcare': 'Healthcare',
    'hr': 'HR Tech',
    'recruiting': 'Recruiting',
    'marketing': 'MarTech',
    'sales': 'Sales Tech',
    'ecommerce': 'E-commerce',
    'retail': 'Retail',
    'real estate': 'Real Estate',
    'construction': 'Construction',
    'manufacturing': 'Manufacturing',
    'logistics': 'Logistics',
    'agency': 'Agencies',
    'consulting': 'Consulting'
  };

  for (const [key, value] of Object.entries(verticalMap)) {
    if (lower.includes(key)) verticals.push(value);
  }

  return verticals.length ? verticals : ['SaaS', 'Technology'];
}

function inferCompanySize(targetAudience) {
  if (!targetAudience) return { min: 10, max: 500 };
  
  const lower = targetAudience.toLowerCase();

  if (lower.includes('enterprise') || lower.includes('1000+')) {
    return { min: 1000, max: 10000 };
  }
  if (lower.includes('mid-market') || lower.includes('100-500')) {
    return { min: 100, max: 500 };
  }
  if (lower.includes('smb') || lower.includes('small')) {
    return { min: 1, max: 100 };
  }
  if (lower.includes('startup')) {
    return { min: 1, max: 50 };
  }

  return { min: 10, max: 500 }; // Default
}

function inferTitles(targetAudience) {
  if (!targetAudience) return ['Founder', 'CEO', 'Head of Marketing'];
  
  const lower = targetAudience.toLowerCase();
  const titles = [];

  const titleMap = {
    'founder': 'Founder',
    'ceo': 'CEO',
    'cto': 'CTO',
    'cmo': 'CMO',
    'cfo': 'CFO',
    'vp': 'VP',
    'director': 'Director',
    'head of': 'Head of',
    'manager': 'Manager',
    'marketing': 'Marketing',
    'sales': 'Sales',
    'hr': 'HR',
    'engineering': 'Engineering',
    'product': 'Product',
    'operations': 'Operations'
  };

  for (const [key, value] of Object.entries(titleMap)) {
    if (lower.includes(key)) titles.push(value);
  }

  // Combine related titles
  const result = [];
  if (titles.includes('Marketing')) {
    result.push('Head of Marketing', 'VP Marketing', 'CMO');
  }
  if (titles.includes('Sales')) {
    result.push('Head of Sales', 'VP Sales', 'Sales Director');
  }
  if (titles.includes('HR')) {
    result.push('Head of HR', 'HR Director', 'VP People');
  }
  if (titles.includes('Founder') || titles.includes('CEO')) {
    result.push('Founder', 'CEO', 'Co-Founder');
  }

  return result.length ? [...new Set(result)] : ['Founder', 'CEO', 'Head of Marketing'];
}

function inferIndustries(targetAudience) {
  return inferVerticals(targetAudience); // Same logic for now
}

// ============================================================================
// LOGGING
// ============================================================================

function saveOnboardingLog(log) {
  const logsDir = path.join(__dirname, '..', 'data', 'onboarding');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Save individual log
  fs.writeFileSync(
    path.join(logsDir, `${log.id}.json`),
    JSON.stringify(log, null, 2)
  );

  // Append to daily log
  fs.appendFileSync(
    path.join(logsDir, `${new Date().toISOString().split('T')[0]}.jsonl`),
    JSON.stringify(log) + '\n'
  );
}

// ============================================================================
// ROUTE SETUP
// ============================================================================

function setupOnboardingRoutes(app) {
  // Get onboarding status
  app.get('/api/onboarding/:clientId', (req, res) => {
    const clientFile = path.join(__dirname, '..', 'data', 'clients', `${req.params.clientId}.json`);
    
    if (!fs.existsSync(clientFile)) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = JSON.parse(fs.readFileSync(clientFile, 'utf8'));
    res.json({
      status: client.status,
      created_at: client.created_at,
      next_step: client.status === 'onboarding' ? 'Book onboarding call' : 'Active'
    });
  });

  // List all clients (admin)
  app.get('/api/clients', (req, res) => {
    const clientsDir = path.join(__dirname, '..', 'data', 'clients');
    
    if (!fs.existsSync(clientsDir)) {
      return res.json({ clients: [] });
    }

    const files = fs.readdirSync(clientsDir).filter(f => f.endsWith('.json'));
    const clients = files.map(f => {
      const client = JSON.parse(fs.readFileSync(path.join(clientsDir, f), 'utf8'));
      return {
        id: client.id,
        company: client.company,
        email: client.email,
        status: client.status,
        mrr: client.mrr,
        created_at: client.created_at
      };
    });

    res.json({ 
      clients,
      total_mrr: clients.reduce((sum, c) => sum + (c.mrr || 0), 0),
      total_clients: clients.length
    });
  });

  console.log('[ONBOARDING] Routes configured');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  startOnboarding,
  createClientProfile,
  generateICP,
  setupInitialCampaign,
  sendWelcomeEmail,
  notifyTeam,
  setupOnboardingRoutes,
  ONBOARDING_STEPS
};
