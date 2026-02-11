// Mubyn OS API Routes — mounted in dashboard-server.js (v2.1 — CFO endpoints)
const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { generatePatterns } = require('./email-guesser');
const { scoreProspect } = require('./prospect-scorer');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mubyn-demo-secret-2026';
const APOLLO_API_KEY = process.env.APOLLO_API_KEY || 'vndGs9TB42TIG7zcdO6zVQ';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATA_DIR = path.join(__dirname, '..', 'data');

// ─── SMTP Singleton ───────────────────────────────────────────────
let _smtpTransporter = null;
const SMTP_DAILY_LIMIT = 45; // stay under Zoho's 50/day safety margin
let _smtpDailySent = 0;
let _smtpLastReset = new Date().toISOString().split('T')[0];

function resetSmtpIfNewDay() {
  const today = new Date().toISOString().split('T')[0];
  if (today !== _smtpLastReset) { _smtpDailySent = 0; _smtpLastReset = today; }
}

async function getSmtp() {
  if (_smtpTransporter) return _smtpTransporter;
  const host = process.env.SMTP_HOST || 'smtp.zoho.com';
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  _smtpTransporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  try { await _smtpTransporter.verify(); console.log('✓ SMTP ready'); } catch (e) { console.error('SMTP verify failed:', e.message); _smtpTransporter = null; }
  return _smtpTransporter;
}

// OpenAI chat helper
async function openaiChat(systemPrompt, userMessage, maxTokens = 1024) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      max_tokens: maxTokens, temperature: 0.7
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`OpenAI ${res.status}: ${err}`); }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function loadJSON(filePath, def = []) { try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { return def; } }
async function saveJSON(filePath, data) { await fs.mkdir(path.dirname(filePath), { recursive: true }); await fs.writeFile(filePath, JSON.stringify(data, null, 2)); }

function authenticateToken(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  jwt.verify(token, JWT_SECRET, (err, user) => { if (err) return res.status(403).json({ error: 'Invalid token' }); req.user = user; next(); });
}

// AUTH
router.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name, business_name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password, and name required' });
    const usersFile = path.join(DATA_DIR, 'users.json');
    const users = await loadJSON(usersFile, []);
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'User already exists' });
    const user = { id: crypto.randomUUID(), email, name, business_name: business_name || '', password: await bcrypt.hash(password, 10), created_at: new Date().toISOString() };
    users.push(user);
    await saveJSON(usersFile, users);
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, business_name: user.business_name } });
  } catch (e) { console.error('Signup error:', e); res.status(500).json({ error: 'Signup failed' }); }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const users = await loadJSON(path.join(DATA_DIR, 'users.json'), []);
    const user = users.find(u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, business_name: user.business_name } });
  } catch (e) { console.error('Login error:', e); res.status(500).json({ error: 'Login failed' }); }
});

router.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const users = await loadJSON(path.join(DATA_DIR, 'users.json'), []);
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, email: user.email, name: user.name, business_name: user.business_name });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ═══════════════════════════════════════════════════════════════════
// SETTINGS — Business info + SMTP email connection
// ═══════════════════════════════════════════════════════════════════

router.post('/settings', async (req, res) => {
  try {
    const { userId, business_name, industry, description, website, country } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    // Update user data file
    const userFile = path.join(DATA_DIR, `user-${userId}.json`);
    const existing = await loadJSON(userFile, {});
    const updated = { ...existing, business_name, industry, description, website, country, updatedAt: new Date().toISOString() };
    await saveJSON(userFile, updated);
    // Also update in users.json
    const usersFile = path.join(DATA_DIR, 'users.json');
    const users = await loadJSON(usersFile, []);
    const idx = users.findIndex(u => u.id === userId);
    if (idx >= 0) { users[idx] = { ...users[idx], business_name, industry, country, website }; await saveJSON(usersFile, users); }
    res.json({ success: true });
  } catch (e) { console.error('Settings error:', e); res.status(500).json({ error: 'Save failed' }); }
});

router.post('/settings/smtp', async (req, res) => {
  try {
    const { userId, email, password, host, port } = req.body;
    if (!userId || !email) return res.status(400).json({ error: 'userId and email required' });
    // Encrypt password before storing
    const cipher = require('crypto').createCipheriv('aes-256-cbc',
      Buffer.from((process.env.ENCRYPTION_KEY || 'mubyn-default-encryption-key-32b').padEnd(32, '0').slice(0, 32)),
      Buffer.alloc(16, 0));
    let encrypted = cipher.update(password || '', 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const smtpFile = path.join(DATA_DIR, `smtp-${userId}.json`);
    await saveJSON(smtpFile, { email, password_encrypted: encrypted, host, port: port || 587, updatedAt: new Date().toISOString() });
    res.json({ success: true, email });
  } catch (e) { console.error('SMTP settings error:', e); res.status(500).json({ error: 'Save failed' }); }
});

router.get('/settings/:userId', async (req, res) => {
  try {
    const userData = await loadJSON(path.join(DATA_DIR, `user-${req.params.userId}.json`), null);
    const smtpData = await loadJSON(path.join(DATA_DIR, `smtp-${req.params.userId}.json`), null);
    res.json({
      business: userData,
      smtp: smtpData ? { email: smtpData.email, host: smtpData.host, port: smtpData.port, connected: true } : null,
    });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// CHAT
router.post('/chat', async (req, res) => {
  try {
    const { message, userId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    // Build context-aware system prompt
    let userContext = '';
    if (userId) {
      try {
        const [userData, leads, content, cfo, csaSettings, kb] = await Promise.all([
          loadJSON(path.join(DATA_DIR, `user-${userId}.json`), null),
          loadJSON(path.join(DATA_DIR, `leads-${userId}.json`), []),
          loadJSON(path.join(DATA_DIR, `content-${userId}.json`), []),
          loadJSON(path.join(DATA_DIR, `cfo-${userId}.json`), null),
          loadJSON(path.join(DATA_DIR, `csa-settings-${userId}.json`), null),
          loadJSON(path.join(DATA_DIR, `csa-knowledge-${userId}.json`), []),
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
        inactive.push('Website Builder (coming soon)');
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
5. **Website Builder** (Website tab) — Coming soon: AI builds complete websites in 60 seconds

YOUR BEHAVIOR:
- If user just signed up: Welcome them warmly, summarize what Mubyn can do, suggest starting with Lead Gen or CMO
- If modules are not set up: Proactively suggest them ("I noticed you haven't set up your content calendar yet — want me to help?")
- If user asks about a feature: Explain it clearly and tell them which tab to go to
- Be concise (2-4 paragraphs max), actionable, and warm
- Match the user's language (Arabic or English)
- Never say "I'm just an AI" — you ARE their AI CEO
- Use markdown formatting${userContext}`;

    const reply = await openaiChat(systemPrompt, message, 1024);
    if (userId) {
      const f = path.join(DATA_DIR, `conversations-${userId}.json`);
      const c = await loadJSON(f, []);
      c.push({ id: crypto.randomUUID(), userId, message, response: reply, timestamp: new Date().toISOString() });
      await saveJSON(f, c);
    }
    res.json({ response: reply });
  } catch (e) { console.error('Chat error:', e); res.status(500).json({ error: 'Chat failed', details: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// LEADS — Full pipeline: Generate → Enrich → Email Draft → Send
// Merges: GPT-4o discovery, email-guesser, email-generator-v2,
//         smtp-sender, prospect-scorer, campaign-engine, follow-ups
// ═══════════════════════════════════════════════════════════════════

// Helper: parse JSON from AI response (tolerant of markdown fences)
function parseAIJson(raw) {
  try { return JSON.parse(raw); } catch {}
  const arrM = raw.match(/\[[\s\S]*\]/);
  if (arrM) try { return JSON.parse(arrM[0]); } catch {}
  const objM = raw.match(/\{[\s\S]*\}/);
  if (objM) try { return JSON.parse(objM[0]); } catch {}
  return null;
}

// ── GET /leads/:userId — fetch all leads ──
router.get('/leads/:userId', async (req, res) => {
  try { res.json({ leads: await loadJSON(path.join(DATA_DIR, `leads-${req.params.userId}.json`), []) }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ── POST /leads/search — legacy Apollo search (kept for compat) ──
router.post('/leads/search', async (req, res) => {
  try {
    const { query, location, industry, userId } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const r = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_API_KEY },
      body: JSON.stringify({ q_organization_name: query, person_locations: location ? [location] : undefined, per_page: 10 })
    });
    const data = await r.json();
    const leads = (data.people || []).map(p => ({ id: crypto.randomUUID(), name: p.name || '', email: p.email || '', company: p.organization?.name || '', title: p.title || '', location: p.city || p.country || '', source: 'apollo', created_at: new Date().toISOString() }));
    if (userId) { const f = path.join(DATA_DIR, `leads-${userId}.json`); const ex = await loadJSON(f, []); ex.push(...leads); await saveJSON(f, ex); }
    res.json({ leads });
  } catch (e) { console.error('Lead search error:', e); res.status(500).json({ error: 'Lead search failed', details: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// POST /leads/generate — AI-powered lead discovery + email enrichment
// 1. GPT-4o finds real businesses in city/industry
// 2. email-guesser generates likely email patterns from name + domain
// 3. prospect-scorer assigns quality score
// 4. Stored and returned to client
// ══════════════════════════════════════════════════════════════════
router.post('/leads/generate', async (req, res) => {
  try {
    const { industry, country, city, count, userId, campaignId } = req.body;
    if (!industry || !city) return res.status(400).json({ error: 'Industry and city are required' });
    const numLeads = Math.min(Math.max(parseInt(count) || 10, 1), 50);
    const location = city + (country ? `, ${country}` : '');

    // ── Step 1: GPT-4o finds real businesses ──
    const systemPrompt = `You are a business research assistant. Find REAL, currently operating businesses.

RULES:
- Return businesses verifiable on Google Maps / Google Search
- Include actual business names people can look up
- For contact, use the owner/manager name if publicly known; otherwise a realistic name + title
- For website, include real domains (company website or social page)
- Phone numbers must use the correct country code
- Google rating: use real rating if well-known, or estimate 3.5-4.5

Return ONLY a valid JSON array. No markdown, no code fences, no explanation.

Each object:
{ "businessName": "str", "contactName": "str", "contactTitle": "str", "phone": "str", "website": "str", "address": "str", "googleRating": number, "industry": "str", "description": "str" }

Do NOT include an "email" field — we will generate emails separately.`;

    const userMessage = `Find ${numLeads} real ${industry} businesses in ${location}. Mix of well-known and smaller local businesses. Phone numbers must have the correct country code for ${country || city}.`;

    const rawResponse = await openaiChat(systemPrompt, userMessage, numLeads * 250);
    const businesses = parseAIJson(rawResponse);
    if (!Array.isArray(businesses) || businesses.length === 0) {
      return res.status(500).json({ error: 'Failed to parse lead results from AI' });
    }

    // ── Step 2: Enrich each lead with guessed email + score ──
    const leads = businesses.map(b => {
      const bName = b.businessName || b.business_name || b.name || 'Unknown';
      const cName = b.contactName || b.contact_name || b.owner || '';
      const cTitle = b.contactTitle || b.contact_title || b.title || 'Manager';
      const website = (b.website || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

      // email-guesser: generate most likely email from contact name + domain
      let email = 'N/A';
      if (cName && website && website.includes('.')) {
        const parts = cName.trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        if (firstName && lastName) {
          const patterns = generatePatterns(firstName, lastName, website, { companySize: 'smb' });
          email = patterns[0] || `info@${website}`;
        } else if (firstName) {
          email = `${firstName.toLowerCase()}@${website}`;
        } else {
          email = `info@${website}`;
        }
      } else if (website && website.includes('.')) {
        email = `info@${website}`;
      }

      // prospect-scorer: score based on available signals
      const scoring = scoreProspect({
        name: cName,
        title: cTitle,
        company: bName,
        employees: null,
        twitter: null,
        recentTweets: null,
        signals: null,
      });

      return {
        id: crypto.randomUUID(),
        businessName: bName,
        contactName: cName || 'N/A',
        contactTitle: cTitle,
        email,
        emailVerified: false,
        emailPatterns: (cName && website && website.includes('.'))
          ? generatePatterns(cName.split(/\s+/)[0] || '', cName.split(/\s+/).slice(1).join(' ') || '', website)
          : [],
        phone: b.phone || 'N/A',
        website: b.website || 'N/A',
        address: b.address || b.location || location,
        googleRating: parseFloat(b.googleRating || b.google_rating || b.rating) || 4.0,
        industry: b.industry || industry,
        description: b.description || '',
        location,
        country: country || '',
        city: city || '',
        status: 'new',            // new → contacted → replied → meeting_booked
        source: 'ai-generated',
        score: scoring.score,
        scoreTier: scoring.tier,   // hot | warm | cold
        campaignId: campaignId || null,
        notes: '',
        emailDraft: null,
        sentEmails: [],            // tracks every email sent to this lead
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    // ── Step 3: Store ──
    const uid = userId || 'anonymous';
    const leadsFile = path.join(DATA_DIR, `leads-${uid}.json`);
    const existingLeads = await loadJSON(leadsFile, []);
    await saveJSON(leadsFile, [...leads, ...existingLeads]);

    // If campaign, update campaign lead count
    if (campaignId && userId) {
      const campsFile = path.join(DATA_DIR, `campaigns-${userId}.json`);
      const camps = await loadJSON(campsFile, []);
      const ci = camps.findIndex(c => c.id === campaignId);
      if (ci !== -1) {
        camps[ci].leadCount = (camps[ci].leadCount || 0) + leads.length;
        camps[ci].updatedAt = new Date().toISOString();
        await saveJSON(campsFile, camps);
      }
    }

    res.json({
      success: true,
      leads,
      total: leads.length,
      message: `Generated ${leads.length} ${industry} leads in ${location}`,
    });
  } catch (e) {
    console.error('Lead generation error:', e);
    res.status(500).json({ error: 'Lead generation failed', details: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// PATCH /leads/:userId/:leadId — update any field on a lead
// ══════════════════════════════════════════════════════════════════
router.patch('/leads/:userId/:leadId', async (req, res) => {
  try {
    const { userId, leadId } = req.params;
    const updates = req.body;
    const leadsFile = path.join(DATA_DIR, `leads-${userId}.json`);
    const leads = await loadJSON(leadsFile, []);
    const idx = leads.findIndex(l => l.id === leadId);
    if (idx === -1) return res.status(404).json({ error: 'Lead not found' });
    leads[idx] = { ...leads[idx], ...updates, updatedAt: new Date().toISOString() };
    await saveJSON(leadsFile, leads);
    res.json({ success: true, lead: leads[idx] });
  } catch (e) { res.status(500).json({ error: 'Update failed' }); }
});

// ══════════════════════════════════════════════════════════════════
// POST /leads/:userId/:leadId/email-draft — AI personalized email
// Merges email-generator-v2 quality: pattern-interrupt hooks,
// specific social proof, transparent CTA, follow-up sequence
// ══════════════════════════════════════════════════════════════════
router.post('/leads/:userId/:leadId/email-draft', async (req, res) => {
  try {
    const { userId, leadId } = req.params;
    const { businessContext, objective, campaignType } = req.body;
    const leadsFile = path.join(DATA_DIR, `leads-${userId}.json`);
    const leads = await loadJSON(leadsFile, []);
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Load user profile for sender context
    const users = await loadJSON(path.join(DATA_DIR, 'users.json'), []);
    const user = users.find(u => u.id === userId);
    const senderName = user?.name || 'Caesar';
    const senderBusiness = user?.business_name || 'our team';

    const systemPrompt = `You are a top cold email copywriter. Your emails get 25%+ reply rates.

WHAT FOUNDERS HATE (avoid these):
- Generic AI personalization ("I noticed your company...")
- Vague claims ("We help companies like yours grow")
- Long-winded emails over 150 words
- Overly salesy CTAs
- "I hope this email finds you well" openers

WHAT WORKS (use these patterns):
- Pattern interrupt hook (reference their specific business/industry/location)
- ONE specific benefit with a number or metric
- Specific proof/case study reference
- Low-commitment CTA (quick call, Loom video, send more info)
- Easy out ("No worries if timing's bad")
- Human, conversational tone — not robotic

STRICT FORMAT: Return ONLY valid JSON, no markdown:
{
  "subject": "4-6 words max, no hype, no emojis",
  "body": "120-150 words max. Use \\n for line breaks. Sign off with just first name.",
  "followUp1": "Day 3 follow-up. 60-80 words. Add NEW value (insight, tip). Not just a bump.",
  "followUp2": "Day 7 final follow-up. 40-60 words. Permission to close loop. Professional breakup."
}`;

    const userMessage = `Write a cold outreach email to:
- Business: ${lead.businessName}
- Contact: ${lead.contactName} (${lead.contactTitle})
- Industry: ${lead.industry}
- Location: ${lead.address}
- Website: ${lead.website}
- Google Rating: ${lead.googleRating}/5

Sender: ${senderName} from ${senderBusiness}
${businessContext ? `Sender's context: ${businessContext}` : ''}
${objective ? `Campaign objective: ${objective}` : 'Offer services and book a discovery call.'}
Campaign type: ${campaignType || 'founder_outreach'}`;

    const rawResponse = await openaiChat(systemPrompt, userMessage, 1200);
    const emailData = parseAIJson(rawResponse);
    if (!emailData || !emailData.subject) throw new Error('Could not parse email draft');

    // Store draft on the lead
    const idx = leads.findIndex(l => l.id === leadId);
    leads[idx].emailDraft = emailData;
    leads[idx].status = leads[idx].status === 'new' ? 'new' : leads[idx].status; // don't regress status
    leads[idx].updatedAt = new Date().toISOString();
    await saveJSON(leadsFile, leads);

    res.json({ success: true, email: emailData });
  } catch (e) {
    console.error('Email draft error:', e);
    res.status(500).json({ error: 'Email draft generation failed', details: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /leads/email — batch generate email drafts (for campaigns)
// Generates drafts for multiple leads at once
// ══════════════════════════════════════════════════════════════════
router.post('/leads/email', async (req, res) => {
  try {
    const { userId, leadIds, businessContext, objective } = req.body;
    if (!userId || !leadIds || !Array.isArray(leadIds)) {
      return res.status(400).json({ error: 'userId and leadIds[] required' });
    }
    const leadsFile = path.join(DATA_DIR, `leads-${userId}.json`);
    const leads = await loadJSON(leadsFile, []);
    const results = [];

    for (const leadId of leadIds.slice(0, 20)) { // max 20 at a time
      const lead = leads.find(l => l.id === leadId);
      if (!lead) { results.push({ leadId, success: false, error: 'Not found' }); continue; }
      if (lead.emailDraft && lead.emailDraft.subject) {
        results.push({ leadId, success: true, email: lead.emailDraft, cached: true });
        continue;
      }

      try {
        const users = await loadJSON(path.join(DATA_DIR, 'users.json'), []);
        const user = users.find(u => u.id === userId);
        const senderName = user?.name || 'Caesar';
        const senderBusiness = user?.business_name || 'our team';

        const prompt = `Write a 120-word cold email to ${lead.contactName} (${lead.contactTitle}) at ${lead.businessName} (${lead.industry}, ${lead.address}).
Sender: ${senderName} from ${senderBusiness}. ${objective || 'Book a discovery call.'}
Return JSON: {"subject":"...","body":"...","followUp1":"...","followUp2":"..."}`;

        const raw = await openaiChat(
          'You write high-converting cold emails. Return ONLY valid JSON. 120 words max for body.',
          prompt, 800
        );
        const emailData = parseAIJson(raw);
        if (emailData && emailData.subject) {
          const idx = leads.findIndex(l => l.id === leadId);
          leads[idx].emailDraft = emailData;
          leads[idx].updatedAt = new Date().toISOString();
          results.push({ leadId, success: true, email: emailData });
        } else {
          results.push({ leadId, success: false, error: 'Parse failed' });
        }
      } catch (err) {
        results.push({ leadId, success: false, error: err.message });
      }
    }

    await saveJSON(leadsFile, leads);
    res.json({ success: true, results, generated: results.filter(r => r.success).length });
  } catch (e) {
    console.error('Batch email error:', e);
    res.status(500).json({ error: 'Batch email generation failed', details: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /leads/send — send email via Zoho SMTP
// Sends the stored emailDraft (or custom subject/body) to a lead
// Tracks sent emails on the lead for follow-up sequencing
// ══════════════════════════════════════════════════════════════════
router.post('/leads/send', async (req, res) => {
  try {
    const { userId, leadId, subject, body, sequence } = req.body;
    if (!userId || !leadId) return res.status(400).json({ error: 'userId and leadId required' });

    // Rate limit
    resetSmtpIfNewDay();
    if (_smtpDailySent >= SMTP_DAILY_LIMIT) {
      return res.status(429).json({
        error: 'Daily email limit reached',
        limit: SMTP_DAILY_LIMIT,
        sent: _smtpDailySent,
        resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
      });
    }

    // Load lead
    const leadsFile = path.join(DATA_DIR, `leads-${userId}.json`);
    const leads = await loadJSON(leadsFile, []);
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.email || lead.email === 'N/A') return res.status(400).json({ error: 'Lead has no email address' });

    // Determine content: use provided subject/body OR fall back to stored draft
    const seqKey = sequence || 'initial';
    let emailSubject, emailBody;
    if (subject && body) {
      emailSubject = subject;
      emailBody = body;
    } else if (lead.emailDraft) {
      const draft = typeof lead.emailDraft === 'string' ? JSON.parse(lead.emailDraft) : lead.emailDraft;
      if (seqKey === 'followUp1' && draft.followUp1) {
        emailSubject = `Re: ${draft.subject}`;
        emailBody = draft.followUp1;
      } else if (seqKey === 'followUp2' && draft.followUp2) {
        emailSubject = `Re: ${draft.subject}`;
        emailBody = draft.followUp2;
      } else {
        emailSubject = draft.subject;
        emailBody = draft.body;
      }
    } else {
      return res.status(400).json({ error: 'No email content. Generate a draft first.' });
    }

    // Get SMTP
    const transporter = await getSmtp();
    if (!transporter) return res.status(500).json({ error: 'SMTP not configured. Set SMTP_HOST/USER/PASS in env.' });

    const fromEmail = process.env.SMTP_USER;
    const users = await loadJSON(path.join(DATA_DIR, 'users.json'), []);
    const user = users.find(u => u.id === userId);
    const fromName = user?.name || 'Mubyn';

    // Build HTML
    const htmlBody = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
<div>${emailBody.replace(/\n/g, '<br>')}</div>
</body></html>`;

    // Send
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: lead.email,
      subject: emailSubject,
      text: emailBody,
      html: htmlBody,
    });

    _smtpDailySent++;

    // Track on lead
    const idx = leads.findIndex(l => l.id === leadId);
    if (!leads[idx].sentEmails) leads[idx].sentEmails = [];
    leads[idx].sentEmails.push({
      messageId: info.messageId,
      subject: emailSubject,
      sequence: seqKey,
      sentAt: new Date().toISOString(),
    });
    leads[idx].status = leads[idx].status === 'new' ? 'contacted' : leads[idx].status;
    leads[idx].lastEmailSentAt = new Date().toISOString();
    leads[idx].updatedAt = new Date().toISOString();
    await saveJSON(leadsFile, leads);

    // Log to send-log
    const logFile = path.join(DATA_DIR, `send-log-${userId}.jsonl`);
    const logEntry = JSON.stringify({
      leadId, email: lead.email, subject: emailSubject, sequence: seqKey,
      messageId: info.messageId, sentAt: new Date().toISOString(),
    });
    await fs.appendFile(logFile, logEntry + '\n').catch(() => {});

    res.json({
      success: true,
      messageId: info.messageId,
      to: lead.email,
      sequence: seqKey,
      remainingToday: SMTP_DAILY_LIMIT - _smtpDailySent,
    });
  } catch (e) {
    console.error('Email send error:', e);
    res.status(500).json({ error: 'Email send failed', details: e.message });
  }
});

// ── GET /leads/send/status — daily send quota info ──
router.get('/leads/send/status', async (req, res) => {
  resetSmtpIfNewDay();
  const smtpConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  res.json({
    smtpConfigured,
    dailyLimit: SMTP_DAILY_LIMIT,
    sentToday: _smtpDailySent,
    remaining: SMTP_DAILY_LIMIT - _smtpDailySent,
    resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
  });
});

// ══════════════════════════════════════════════════════════════════
// CAMPAIGNS — create, list, update, get stats
// ══════════════════════════════════════════════════════════════════
router.post('/leads/campaign', async (req, res) => {
  try {
    const { userId, name, objective, industry, country, city, status } = req.body;
    if (!userId || !name) return res.status(400).json({ error: 'userId and name required' });
    const campsFile = path.join(DATA_DIR, `campaigns-${userId}.json`);
    const camps = await loadJSON(campsFile, []);
    const campaign = {
      id: crypto.randomUUID(),
      userId,
      name,
      objective: objective || '',
      industry: industry || '',
      country: country || '',
      city: city || '',
      status: status || 'active',    // active | paused | completed
      leadCount: 0,
      emailsSent: 0,
      replies: 0,
      meetings: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    camps.unshift(campaign);
    await saveJSON(campsFile, camps);
    res.json({ success: true, campaign });
  } catch (e) { res.status(500).json({ error: 'Campaign creation failed', details: e.message }); }
});

router.get('/leads/campaigns/:userId', async (req, res) => {
  try {
    const camps = await loadJSON(path.join(DATA_DIR, `campaigns-${req.params.userId}.json`), []);
    res.json({ campaigns: camps });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

router.patch('/leads/campaign/:userId/:campaignId', async (req, res) => {
  try {
    const { userId, campaignId } = req.params;
    const updates = req.body;
    const campsFile = path.join(DATA_DIR, `campaigns-${userId}.json`);
    const camps = await loadJSON(campsFile, []);
    const idx = camps.findIndex(c => c.id === campaignId);
    if (idx === -1) return res.status(404).json({ error: 'Campaign not found' });
    camps[idx] = { ...camps[idx], ...updates, updatedAt: new Date().toISOString() };
    await saveJSON(campsFile, camps);
    res.json({ success: true, campaign: camps[idx] });
  } catch (e) { res.status(500).json({ error: 'Update failed' }); }
});

// Campaign stats: compute live from leads data
router.get('/leads/campaign/:userId/:campaignId/stats', async (req, res) => {
  try {
    const { userId, campaignId } = req.params;
    const leads = await loadJSON(path.join(DATA_DIR, `leads-${userId}.json`), []);
    const campLeads = leads.filter(l => l.campaignId === campaignId);
    const total = campLeads.length;
    const contacted = campLeads.filter(l => l.status !== 'new').length;
    const replied = campLeads.filter(l => l.status === 'replied' || l.status === 'meeting_booked').length;
    const meetings = campLeads.filter(l => l.status === 'meeting_booked').length;
    const withEmail = campLeads.filter(l => l.email && l.email !== 'N/A').length;
    res.json({
      total, contacted, replied, meetings, withEmail,
      replyRate: contacted > 0 ? Math.round((replied / contacted) * 100) : 0,
      meetingRate: contacted > 0 ? Math.round((meetings / contacted) * 100) : 0,
    });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ══════════════════════════════════════════════════════════════════
// DELETE /leads/:userId/:leadId — delete a lead
// ══════════════════════════════════════════════════════════════════
router.delete('/leads/:userId/:leadId', async (req, res) => {
  try {
    const { userId, leadId } = req.params;
    const leadsFile = path.join(DATA_DIR, `leads-${userId}.json`);
    const leads = await loadJSON(leadsFile, []);
    const filtered = leads.filter(l => l.id !== leadId);
    if (filtered.length === leads.length) return res.status(404).json({ error: 'Lead not found' });
    await saveJSON(leadsFile, filtered);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Delete failed' }); }
});

// CONTENT
router.post('/content/generate', async (req, res) => {
  try {
    const { topic, platform, language, userId } = req.body;
    if (!topic || !platform) return res.status(400).json({ error: 'Topic and platform required' });
    const content = await openaiChat('You are a social media content expert. Generate engaging platform-appropriate posts.', `Create a ${platform} post about: ${topic}. Language: ${language || 'en'}`, 512);
    const item = { id: crypto.randomUUID(), content, topic, platform, language: language || 'en', status: 'draft', created_at: new Date().toISOString() };
    if (userId) { const f = path.join(DATA_DIR, `content-${userId}.json`); const ex = await loadJSON(f, []); ex.push(item); await saveJSON(f, ex); }
    res.json(item);
  } catch (e) { console.error('Content error:', e); res.status(500).json({ error: 'Content generation failed', details: e.message }); }
});

router.post('/content/calendar', async (req, res) => {
  try {
    const { business_name, industry, language, userId } = req.body;
    const prompt = `Create a full month content calendar for: Business: ${business_name || 'A growing business'}, Industry: ${industry || 'Technology'}, Language: ${language || 'en'}. Return a JSON array with 12 posts (3/week x 4 weeks), each: {week, day, platform (twitter/linkedin/instagram), content (ready to publish), hashtags (array), type}. ${language === 'ar' ? 'Write ALL in Arabic.' : ''} Return ONLY the JSON array.`;
    const text = await openaiChat('You are a world-class social media strategist. Return ONLY a JSON array.', prompt, 4096);
    let calendar; try { const m = text.match(/\[[\s\S]*\]/); calendar = m ? JSON.parse(m[0]) : JSON.parse(text); } catch { calendar = [{ week: 1, day: 'Monday', platform: 'twitter', content: text, hashtags: [], type: 'general' }]; }
    const enriched = calendar.map((p, i) => ({ id: crypto.randomUUID(), ...p, status: 'draft', created_at: new Date().toISOString(), order: i + 1 }));
    if (userId) await saveJSON(path.join(DATA_DIR, `content-${userId}.json`), enriched);
    res.json({ calendar: enriched, total: enriched.length });
  } catch (e) { console.error('Calendar error:', e); res.status(500).json({ error: 'Calendar failed', details: e.message }); }
});

router.get('/content/:userId', async (req, res) => {
  try { res.json({ content: await loadJSON(path.join(DATA_DIR, `content-${req.params.userId}.json`), []) }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// CONTENT IMAGE GENERATION (DALL-E 3)
router.post('/content/image', async (req, res) => {
  try {
    const { prompt, size, platform } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });
    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

    // World-class prompt enhancement via GPT-4o
    const enhancedPrompt = await openaiChat(
      `You are an elite creative director and prompt engineer for DALL-E 3. Your job is to transform basic social media post descriptions into stunning, photorealistic image prompts that look like they were shot by a professional photographer or designed by a top agency.

Rules:
- Output ONLY the enhanced prompt, nothing else
- Style: Modern, clean, editorial quality. Think Apple product shots, National Geographic, Vogue editorial
- Lighting: Always specify (golden hour, soft studio, dramatic rim light, etc.)
- Composition: Rule of thirds, leading lines, negative space for text overlay
- Color grading: Rich, cinematic, slightly desaturated with one accent color pop
- NO text, logos, or watermarks in the image
- NO cartoon, clipart, or stock photo vibes
- Platform-aware: ${platform === 'instagram' ? 'Square 1:1, lifestyle/editorial feel' : platform === 'linkedin' ? 'Professional, corporate elegance, wide format' : platform === 'twitter' ? 'Eye-catching, bold colors, wide format' : 'Versatile, works across platforms'}
- Mood: Aspirational, premium, trustworthy
- Keep it to 2-3 sentences max`,
      `Enhance this into a world-class DALL-E 3 prompt: "${prompt}"`,
      300
    );

    // Platform-aware sizing
    const imageSize = size || (platform === 'instagram' ? '1024x1024' : '1792x1024');

    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'dall-e-3', prompt: enhancedPrompt, n: 1, size: imageSize, quality: 'hd' })
    });
    if (!r.ok) { const err = await r.text(); return res.status(r.status).json({ error: `DALL-E error: ${err}` }); }
    const data = await r.json();
    const imageUrl = data.data?.[0]?.url || null;
    const revisedPrompt = data.data?.[0]?.revised_prompt || null;
    res.json({ success: true, image_url: imageUrl, revised_prompt: revisedPrompt, enhanced_prompt: enhancedPrompt });
  } catch (e) { console.error('Image generation error:', e); res.status(500).json({ error: 'Image generation failed', details: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// CFO — AI Financial Intelligence
// Generate projections, track transactions, store per-user data
// ═══════════════════════════════════════════════════════════════════

// POST /cfo/generate — Generate financial projections using GPT-4o
router.post('/cfo/generate', async (req, res) => {
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
    const cfoFile = path.join(DATA_DIR, `cfo-${userId}.json`);
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

// GET /cfo/transactions/:userId — Get transactions (MUST be before /cfo/:userId)
router.get('/cfo/transactions/:userId', async (req, res) => {
  try {
    const txFile = path.join(DATA_DIR, `cfo-transactions-${req.params.userId}.json`);
    const transactions = await loadJSON(txFile, []);
    res.json({ transactions });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch transactions' }); }
});

// POST /cfo/transaction — Add a transaction (income/expense)
router.post('/cfo/transaction', async (req, res) => {
  try {
    const { userId, type, amount, category, description, date } = req.body;
    if (!userId || !type || !amount) return res.status(400).json({ error: 'userId, type, and amount required' });
    if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'type must be income or expense' });

    const txFile = path.join(DATA_DIR, `cfo-transactions-${userId}.json`);
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
    transactions.unshift(tx); // newest first
    await saveJSON(txFile, transactions);
    res.json({ success: true, transaction: tx });
  } catch (e) {
    console.error('Transaction error:', e);
    res.status(500).json({ error: 'Failed to add transaction' });
  }
});

// DELETE /cfo/transaction/:userId/:txId — Delete a transaction
router.delete('/cfo/transaction/:userId/:txId', async (req, res) => {
  try {
    const { userId, txId } = req.params;
    const txFile = path.join(DATA_DIR, `cfo-transactions-${userId}.json`);
    const transactions = await loadJSON(txFile, []);
    const filtered = transactions.filter(t => t.id !== txId);
    if (filtered.length === transactions.length) return res.status(404).json({ error: 'Transaction not found' });
    await saveJSON(txFile, filtered);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Delete failed' }); }
});

// GET /cfo/:userId — Get stored financial data (AFTER specific routes)
router.get('/cfo/:userId', async (req, res) => {
  try {
    const cfoFile = path.join(DATA_DIR, `cfo-${req.params.userId}.json`);
    const data = await loadJSON(cfoFile, null);
    if (!data) return res.json({ data: null });
    res.json({ data });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch CFO data' }); }
});

// CSA - Customer Support Agent
router.post('/csa/respond', async (req, res) => {
  try {
    const { customer_message, business_context, userId, knowledge_base, tone, language } = req.body;
    if (!customer_message) return res.status(400).json({ error: 'Message required' });

    // Build context with knowledge base
    let kbContext = '';
    if (knowledge_base && Array.isArray(knowledge_base) && knowledge_base.length > 0) {
      kbContext = '\n\nKnowledge Base (use this to answer accurately):\n' +
        knowledge_base.map(kb => `Q: ${kb.title}\nA: ${kb.content}`).join('\n\n');
    } else if (userId) {
      // Auto-load user's knowledge base
      const kbFile = path.join(DATA_DIR, `csa-kb-${userId}.json`);
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
      const settingsFile = path.join(DATA_DIR, `csa-settings-${userId}.json`);
      const settings = await loadJSON(settingsFile, {});
      if (settings.tone) toneInstructions += `\nTone: ${settings.tone}.`;
      if (settings.language) toneInstructions += `\nLanguage: ${settings.language}.`;
      if (settings.response_length) toneInstructions += `\nResponse length: ${settings.response_length}.`;
      if (settings.custom_instructions) toneInstructions += `\nAdditional instructions: ${settings.custom_instructions}`;
    }
    if (tone) toneInstructions += `\nTone: ${tone}.`;
    if (language) toneInstructions += `\nRespond in: ${language}.`;

    const systemPrompt = `You are a professional customer support agent. ${business_context || 'Help the customer.'} Be empathetic and solution-oriented.${toneInstructions}${kbContext}`;
    const reply = await openaiChat(systemPrompt, customer_message, 512);
    if (userId) { const f = path.join(DATA_DIR, `csa-${userId}.json`); const c = await loadJSON(f, []); c.push({ id: crypto.randomUUID(), customer_message, ai_response: reply, business_context: business_context || '', timestamp: new Date().toISOString() }); await saveJSON(f, c); }
    res.json({ response: reply });
  } catch (e) { console.error('CSA error:', e); res.status(500).json({ error: 'CSA failed', details: e.message }); }
});

router.get('/csa/conversations/:userId', async (req, res) => {
  try { res.json({ conversations: await loadJSON(path.join(DATA_DIR, `csa-${req.params.userId}.json`), []) }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// CSA Knowledge Base
router.post('/csa/knowledge', async (req, res) => {
  try {
    const { userId, title, content, category, tags, is_active } = req.body;
    if (!userId || !title || !content) return res.status(400).json({ error: 'userId, title, and content required' });
    const f = path.join(DATA_DIR, `csa-kb-${userId}.json`);
    const entries = await loadJSON(f, []);
    const entry = { id: crypto.randomUUID(), title, content, category: category || 'faq', tags: tags || [], is_active: is_active !== false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    entries.push(entry);
    await saveJSON(f, entries);
    res.json({ success: true, entry });
  } catch (e) { console.error('KB save error:', e); res.status(500).json({ error: 'Failed to save knowledge entry' }); }
});

router.get('/csa/knowledge/:userId', async (req, res) => {
  try { res.json({ entries: await loadJSON(path.join(DATA_DIR, `csa-kb-${req.params.userId}.json`), []) }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

router.put('/csa/knowledge/:userId/:entryId', async (req, res) => {
  try {
    const { userId, entryId } = req.params;
    const updates = req.body;
    const f = path.join(DATA_DIR, `csa-kb-${userId}.json`);
    const entries = await loadJSON(f, []);
    const idx = entries.findIndex(e => e.id === entryId);
    if (idx === -1) return res.status(404).json({ error: 'Entry not found' });
    entries[idx] = { ...entries[idx], ...updates, updated_at: new Date().toISOString() };
    await saveJSON(f, entries);
    res.json({ success: true, entry: entries[idx] });
  } catch (e) { res.status(500).json({ error: 'Update failed' }); }
});

router.delete('/csa/knowledge/:userId/:entryId', async (req, res) => {
  try {
    const { userId, entryId } = req.params;
    const f = path.join(DATA_DIR, `csa-kb-${userId}.json`);
    const entries = await loadJSON(f, []);
    const filtered = entries.filter(e => e.id !== entryId);
    if (filtered.length === entries.length) return res.status(404).json({ error: 'Entry not found' });
    await saveJSON(f, filtered);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Delete failed' }); }
});

// CSA Settings (tone, widget config)
router.post('/csa/settings', async (req, res) => {
  try {
    const { userId, ...settings } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const f = path.join(DATA_DIR, `csa-settings-${userId}.json`);
    const existing = await loadJSON(f, {});
    const merged = { ...existing, ...settings, updated_at: new Date().toISOString() };
    await saveJSON(f, merged);
    res.json({ success: true, settings: merged });
  } catch (e) { console.error('Settings save error:', e); res.status(500).json({ error: 'Failed to save settings' }); }
});

router.get('/csa/settings/:userId', async (req, res) => {
  try { res.json({ settings: await loadJSON(path.join(DATA_DIR, `csa-settings-${req.params.userId}.json`), {}) }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// CSA Widget embed code
router.get('/csa/widget/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const settingsFile = path.join(DATA_DIR, `csa-settings-${userId}.json`);
    const settings = await loadJSON(settingsFile, {});
    const widget = settings.widget || {};
    const embedCode = `<script src="https://app.mubyn.com/widget/${userId}.js" async></script>`;
    res.json({ success: true, embed_code: embedCode, widget_id: userId, config: widget });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
