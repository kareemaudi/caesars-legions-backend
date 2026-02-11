// Mubyn OS Routes v2.2 - PostgreSQL + JSON fallback
const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { generatePatterns } = require('./email-guesser');
const { scoreProspect } = require('./prospect-scorer');
const storage = require('./storage');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mubyn-demo-secret-2026';
const APOLLO_API_KEY = process.env.APOLLO_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATA_DIR = path.join(__dirname, '..', 'data');

// Initialize storage (PostgreSQL if DATABASE_URL set, else JSON files)
storage.init().then(mode => console.log(`✅ Routes storage ready: ${mode}`));

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

// loadJSON/saveJSON now route through PostgreSQL when DATABASE_URL is set
async function loadJSON(filePath, def = []) { return storage.loadJSON(filePath, def); }
async function saveJSON(filePath, data) { return storage.saveJSON(filePath, data); }
function slugify(str) { return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50); }

function authenticateToken(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  jwt.verify(token, JWT_SECRET, (err, user) => { if (err) return res.status(403).json({ error: 'Invalid token' }); req.user = user; next(); });
}

// ─── Multi-tenant ownership enforcement ───────────────────────────
// Patterns where userId is embedded in the URL path
const USERID_PATH_PATTERNS = [
  /^\/leads\/([0-9a-f-]{36})(?:\/|$)/,
  /^\/leads\/campaigns\/([0-9a-f-]{36})/,
  /^\/leads\/campaign\/([0-9a-f-]{36})/,
  /^\/cfo\/([0-9a-f-]{36})/,
  /^\/cfo\/transactions\/([0-9a-f-]{36})/,
  /^\/cfo\/transaction\/([0-9a-f-]{36})/,
  /^\/content\/([0-9a-f-]{36})/,
  /^\/settings\/([0-9a-f-]{36})/,
  /^\/csa\/conversations\/([0-9a-f-]{36})/,
  /^\/csa\/knowledge\/([0-9a-f-]{36})/,
  /^\/csa\/settings\/([0-9a-f-]{36})/,
  /^\/csa\/widget\/([0-9a-f-]{36})/,
  /^\/csa\/telegram\/status\/([0-9a-f-]{36})/,
  /^\/csa\/telegram\/webhook\/([0-9a-f-]{36})/,
  /^\/csa\/email\/status\/([0-9a-f-]{36})/,
  /^\/csa\/email\/disconnect\/([0-9a-f-]{36})/,
  /^\/csa\/email\/poll\/([0-9a-f-]{36})/,
  /^\/csa\/email\/conversations\/([0-9a-f-]{36})/,
  /^\/csa\/email\/oauth\/status\/([0-9a-f-]{36})/,
  /^\/csa\/whatsapp\/status\/([0-9a-f-]{36})/,
  /^\/csa\/whatsapp\/disconnect\/([0-9a-f-]{36})/,
  /^\/csa\/whatsapp\/auto-reply\/([0-9a-f-]{36})/,
  /^\/csa\/whatsapp\/conversations\/([0-9a-f-]{36})/,
  /^\/website\/meta\/([0-9a-f-]{36})/,
  /^\/website\/widget\/([0-9a-f-]{36})/,
  /^\/integrations\/shopify\/status\/([0-9a-f-]{36})/,
  /^\/integrations\/shopify\/disconnect\/([0-9a-f-]{36})/,
  /^\/integrations\/shopify\/products\/([0-9a-f-]{36})/,
  /^\/integrations\/shopify\/orders\/([0-9a-f-]{36})/,
  /^\/integrations\/shopify\/analytics\/([0-9a-f-]{36})/,
  /^\/integrations\/meta\/status\/([0-9a-f-]{36})/,
  /^\/integrations\/meta\/disconnect\/([0-9a-f-]{36})/,
  /^\/integrations\/meta\/campaigns\/([0-9a-f-]{36})/,
  /^\/integrations\/meta\/insights\/([0-9a-f-]{36})/,
  /^\/integrations\/google-ads\/status\/([0-9a-f-]{36})/,
  /^\/integrations\/google-ads\/disconnect\/([0-9a-f-]{36})/,
  /^\/integrations\/google-ads\/campaigns\/([0-9a-f-]{36})/,
  /^\/integrations\/google-ads\/insights\/([0-9a-f-]{36})/,
];

function enforceOwnership(req, res, next) {
  // Check userId from parsed route params first
  let requestedUserId = req.params.userId || req.body.userId;
  
  // If no params parsed yet (global middleware), extract from URL path
  if (!requestedUserId) {
    for (const pattern of USERID_PATH_PATTERNS) {
      const match = req.path.match(pattern);
      if (match) {
        requestedUserId = match[1];
        break;
      }
    }
  }
  
  if (requestedUserId && requestedUserId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  // Inject userId from JWT if not specified in request
  if (!req.body.userId && req.method !== 'GET') req.body.userId = req.user.id;
  if (!req.params.userId) req.userId = req.user.id;
  next();
}

// ─── Route-level auth middleware ──────────────────────────────────
// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  { method: 'POST', path: '/auth/signup' },
  { method: 'POST', path: '/auth/login' },
  { method: 'POST', path: '/auth/forgot-password' },
  { method: 'POST', path: '/auth/reset-password' },
  { method: 'GET',  path: '/health' },
  { method: 'GET',  path: '/version' },
];

// Patterns that are public (checked via startsWith or regex)
const PUBLIC_PATTERNS = [
  { method: 'GET',  pattern: /^\/website\/preview\/[^/]+$/ },       // iframe embedding
  { method: 'GET',  pattern: /^\/csa\/widget\/[^/]+$/ },            // public widget JS
  { method: 'GET',  pattern: /^\/widget\.js/ },                     // widget script
  { method: 'POST', pattern: /^\/csa\/respond$/ },                  // widget responses (public)
  { method: 'POST', pattern: /^\/widget\/event$/ },                 // widget analytics
  { method: 'OPTIONS', pattern: /^\/csa\/respond$/ },               // CORS preflight
  { method: 'POST', pattern: /^\/csa\/telegram\/webhook\// },       // Telegram webhooks
  { method: 'POST', pattern: /^\/csa\/whatsapp\/webhook/ },         // WhatsApp webhooks
  { method: 'GET',  pattern: /^\/csa\/whatsapp\/webhook/ },         // WhatsApp verification
  { method: 'GET',  pattern: /^\/csa\/email\/oauth\/google\/callback/ },  // OAuth callbacks
  { method: 'GET',  pattern: /^\/integrations\/shopify\/oauth\/callback/ },
  { method: 'GET',  pattern: /^\/integrations\/meta\/oauth\/callback/ },
  { method: 'GET',  pattern: /^\/integrations\/google-ads\/oauth\/callback/ },
  { method: 'GET',  pattern: /^\/settings\/logo\/[^/]+$/ },         // public logo serving
];

function isPublicRoute(method, routePath) {
  // Check exact matches
  for (const r of PUBLIC_ROUTES) {
    if (r.method === method && r.path === routePath) return true;
  }
  // Check patterns
  for (const p of PUBLIC_PATTERNS) {
    if (p.method === method && p.pattern.test(routePath)) return true;
  }
  return false;
}

// Apply auth globally to all routes on this router (except public ones)
router.use((req, res, next) => {
  if (isPublicRoute(req.method, req.path)) return next();
  // Authenticate
  authenticateToken(req, res, () => {
    // Enforce ownership
    enforceOwnership(req, res, next);
  });
});

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

router.get('/auth/me', async (req, res) => {
  try {
    const users = await loadJSON(path.join(DATA_DIR, 'users.json'), []);
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, email: user.email, name: user.name, business_name: user.business_name });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// POST /auth/forgot-password — Send password reset (or just reset directly for now)
router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const users = await loadJSON(path.join(DATA_DIR, 'users.json'), []);
    const user = users.find(u => u.email === email);
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' }); // Don't reveal if email exists
    // Generate reset token
    const resetToken = crypto.randomUUID();
    const resetFile = path.join(DATA_DIR, 'password-resets.json');
    const resets = await loadJSON(resetFile, {});
    resets[resetToken] = { userId: user.id, email, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() };
    await saveJSON(resetFile, resets);
    // TODO: Send email with reset link. For now, just return success.
    console.log(`🔑 Password reset for ${email}: token=${resetToken}`);
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (e) { res.status(500).json({ error: 'Reset failed' }); }
});

// POST /auth/reset-password — Reset password with token
router.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const resetFile = path.join(DATA_DIR, 'password-resets.json');
    const resets = await loadJSON(resetFile, {});
    const reset = resets[token];
    if (!reset) return res.status(400).json({ error: 'Invalid or expired reset token' });
    if (new Date(reset.expiresAt) < new Date()) { delete resets[token]; await saveJSON(resetFile, resets); return res.status(400).json({ error: 'Reset token expired' }); }
    // Update password
    const usersFile = path.join(DATA_DIR, 'users.json');
    const users = await loadJSON(usersFile, []);
    const idx = users.findIndex(u => u.id === reset.userId);
    if (idx < 0) return res.status(400).json({ error: 'User not found' });
    users[idx].password = await bcrypt.hash(newPassword, 10);
    await saveJSON(usersFile, users);
    // Delete used token
    delete resets[token];
    await saveJSON(resetFile, resets);
    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (e) { res.status(500).json({ error: 'Reset failed' }); }
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
    // Auto-populate CS Knowledge Base from business details if KB is empty
    if (business_name) {
      try {
        const kbFile = path.join(DATA_DIR, `kb-${userId}.json`);
        const existingKB = await loadJSON(kbFile, []);
        if (existingKB.length === 0) {
          const autoKB = [
            { id: crypto.randomUUID(), title: `About ${business_name}`, content: `${business_name} is a ${industry || 'business'} company${country ? ` based in ${country}` : ''}. ${description || ''}${website ? `\nWebsite: ${website}` : ''}`, category: 'about', createdAt: new Date().toISOString() },
            { id: crypto.randomUUID(), title: 'Our Services', content: description || `${business_name} provides professional ${industry || 'business'} services.`, category: 'services', createdAt: new Date().toISOString() },
            { id: crypto.randomUUID(), title: 'Contact Us', content: `Company: ${business_name}${country ? `\nLocation: ${country}` : ''}${website ? `\nWebsite: ${website}` : ''}\nFor inquiries, please use the chat widget or contact us directly.`, category: 'contact', createdAt: new Date().toISOString() }
          ];
          await saveJSON(kbFile, autoKB);
          console.log(`[Settings] Auto-populated KB with ${autoKB.length} entries for ${business_name}`);
        }
      } catch (kbErr) { console.error('KB auto-populate error:', kbErr); }
    }
    res.json({ success: true });
  } catch (e) { console.error('Settings error:', e); res.status(500).json({ error: 'Save failed' }); }
});

// POST /settings/logo - Upload business logo (base64)
router.post('/settings/logo', async (req, res) => {
  try {
    const { userId, logo } = req.body; // logo = base64 data URL (data:image/png;base64,...)
    if (!userId || !logo) return res.status(400).json({ error: 'userId and logo required' });
    const logoDir = path.join(__dirname, '..', 'data', 'logos');
    await fs.mkdir(logoDir, { recursive: true });
    // Extract format and data
    const match = logo.match(/^data:image\/(png|jpe?g|svg\+xml|webp);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid logo format. Use base64 data URL.' });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1] === 'svg+xml' ? 'svg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'Logo too large. Max 2MB.' });
    const filename = `${userId}.${ext}`;
    await storage.saveLogoFile(path.join(logoDir, filename), buffer);
    // Save reference in user data
    const userFile = path.join(DATA_DIR, `user-${userId}.json`);
    const existing = await loadJSON(userFile, {});
    existing.logo = `/api/settings/logo/${userId}`;
    existing.logoFile = filename;
    await saveJSON(userFile, existing);
    res.json({ success: true, logoUrl: `/api/settings/logo/${userId}` });
  } catch (e) { console.error('Logo upload error:', e); res.status(500).json({ error: 'Upload failed' }); }
});

// GET /settings/logo/:userId - Serve logo
router.get('/settings/logo/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const logoDir = path.join(__dirname, '..', 'data', 'logos');
    const userFile = path.join(DATA_DIR, `user-${req.params.userId}.json`);
    const user = await loadJSON(userFile, {});
    if (!user.logoFile) return res.status(404).json({ error: 'No logo uploaded' });
    const logoPath = path.join(logoDir, user.logoFile);
    res.sendFile(logoPath);
  } catch (e) { res.status(404).json({ error: 'Logo not found' }); }
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
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
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
        // Check Shopify/Meta/Google integrations
        try {
          const shopify = await loadJSON(path.join(DATA_DIR, `integrations-shopify-${userId}.json`), null);
          if (shopify && shopify.connected) active.push('Shopify Connected'); else inactive.push('Shopify (connect in Settings → Integrations)');
        } catch { inactive.push('Shopify (connect in Settings → Integrations)'); }
        try {
          const meta = await loadJSON(path.join(DATA_DIR, `integrations-meta-${userId}.json`), null);
          if (meta && meta.connected) active.push('Meta Ads Connected'); else inactive.push('Meta Ads (connect in Settings → Integrations)');
        } catch { inactive.push('Meta Ads (connect in Settings → Integrations)'); }
        if (parts.length) userContext += `\n\nCLIENT INFO: ${parts.join(' | ')}`;
        if (active.length) userContext += `\nACTIVE MODULES: ${active.join(', ')}`;
        if (inactive.length) userContext += `\nNOT SET UP YET: ${inactive.join(', ')}`;
      } catch (_) { /* still respond even if context fails */ }
    }

    const systemPrompt = `You are Caesar (قيصر), the AI COO powering Mubyn OS — an AI business operating system for SMEs in MENA. "Palantir for SMEs."

You start as COO (learning about the business), then grow into CEO as you prove value. In the early stages, you ASK before acting, PROPOSE strategies, and WAIT for approval before executing campaigns. Over time, as trust builds, you become more autonomous.

You manage 7 departments for each client:
1. **Lead Generation** (Leads tab) — AI discovers real businesses, scores leads, drafts personalized emails, sends via YOUR SMTP
2. **CMO / Marketing** (CMO tab) — Analytics dashboard (revenue, ad spend, ROAS), content calendar, campaign tracking. Pulls live data from Shopify + Meta Ads + Google Ads.
3. **Financial Intelligence** (CFO tab) — Revenue tracking, expense management, 6-month projections, AI insights, transactions
4. **Customer Support** (CS tab) — AI chat agent with knowledge base, tone settings. 5 channels: embeddable website widget, email (IMAP/SMTP), Telegram bot, WhatsApp Business, live chat
5. **Website Builder** (Website tab) — AI builds complete websites in 60 seconds. Or connect your existing website and add our AI chat widget.
6. **Integrations** (Settings tab) — Connect Shopify (products, orders, revenue), Meta Ads (campaigns, spend), Google Ads (campaigns, insights). Data flows into CMO analytics.
7. **Settings** (Settings tab) — Business info, SMTP email for outreach, integrations, billing

YOUR BEHAVIOR:
- If user just signed up (no leads, no content): Welcome warmly, introduce yourself as their AI COO. Say: "I'm going to learn your business and start building your growth engine. First, let me find potential customers for you — head to the Leads tab and I'll generate your first batch of leads based on your industry."
- If modules are not set up: Proactively suggest next steps ("I noticed you haven't connected your email yet — once you do, I can start sending personalized outreach to your leads. Go to Settings → Email.")
- If user asks about a feature: Explain it clearly, tell them which tab, guide step by step
- Be concise (2-4 paragraphs max), actionable, and warm
- MATCH THE USER'S LANGUAGE — if they write in Arabic, respond in Arabic. If English, respond in English. If mixed, respond bilingually.
- Never say "I'm just an AI" — you ARE their AI CEO running their business 24/7
- Use markdown formatting
- When relevant, mention specific data: "You have X leads, Y content posts planned, Z in revenue"${userContext}`;

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
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    res.json({ leads: await loadJSON(path.join(DATA_DIR, `leads-${req.params.userId}.json`), []) });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
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
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
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
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
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

    // Check for user's own SMTP settings first, fall back to default
    let transporter, fromEmail, fromName;
    const userSmtp = await loadJSON(path.join(DATA_DIR, `smtp-${userId}.json`), null);
    const users = await loadJSON(path.join(DATA_DIR, 'users.json'), []);
    const user = users.find(u => u.id === userId);

    if (userSmtp && userSmtp.email && userSmtp.password_encrypted) {
      // Decrypt user's SMTP password
      const decipher = require('crypto').createDecipheriv('aes-256-cbc',
        Buffer.from((process.env.ENCRYPTION_KEY || 'mubyn-default-encryption-key-32b').padEnd(32, '0').slice(0, 32)),
        Buffer.alloc(16, 0));
      let pass = decipher.update(userSmtp.password_encrypted, 'hex', 'utf8');
      pass += decipher.final('utf8');
      transporter = nodemailer.createTransport({ host: userSmtp.host, port: userSmtp.port || 587, secure: (userSmtp.port || 587) === 465, auth: { user: userSmtp.email, pass } });
      fromEmail = userSmtp.email;
      fromName = user?.business_name || user?.name || 'Mubyn';
    } else {
      transporter = await getSmtp();
      if (!transporter) return res.status(500).json({ error: 'No email configured. Go to Settings → Email for Outreach to connect your email.' });
      fromEmail = process.env.SMTP_USER;
      fromName = user?.name || 'Mubyn';
    }

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
    await storage.appendFile(logFile, logEntry + '\n').catch(() => {});

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
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const camps = await loadJSON(path.join(DATA_DIR, `campaigns-${req.params.userId}.json`), []);
    res.json({ campaigns: camps });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

router.patch('/leads/campaign/:userId/:campaignId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
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
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
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
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
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
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' }); res.json({ content: await loadJSON(path.join(DATA_DIR, `content-${req.params.userId}.json`), []) }); }
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

    // Pull real data from connected integrations
    let shopifyContext = '';
    let metaContext = '';
    try {
      const shopifyData = await loadJSON(path.join(DATA_DIR, `integrations-shopify-${userId}.json`), null);
      if (shopifyData && shopifyData.connected && shopifyData.accessToken) {
        try {
          const ordersRes = await shopifyFetch(shopifyData.storeUrl, shopifyData.accessToken, 'orders.json?status=any&limit=50');
          const orders = ordersRes.orders || [];
          if (orders.length > 0) {
            const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
            const avgOrderValue = totalRevenue / orders.length;
            shopifyContext = `\n\nREAL SHOPIFY DATA (use this as the baseline, not estimates):
- Total orders: ${orders.length}
- Total revenue from orders: $${totalRevenue.toFixed(2)}
- Average order value: $${avgOrderValue.toFixed(2)}
- Most recent order: ${orders[0]?.created_at || 'N/A'}`;
          }
        } catch (e) { /* Shopify fetch failed, continue without */ }
      }
    } catch { /* No Shopify data */ }

    try {
      const metaData = await loadJSON(path.join(DATA_DIR, `integrations-meta-${userId}.json`), null);
      if (metaData && metaData.connected) {
        metaContext = `\n\nMeta Ads connected — factor in advertising costs and ROAS in your analysis.`;
      }
    } catch { /* No Meta data */ }

    const systemPrompt = `You are an expert CFO and financial analyst. Generate realistic financial data and projections for a business. 
Be specific to their industry and location. Use realistic numbers — not too optimistic, not too pessimistic.
${shopifyContext ? 'IMPORTANT: Real Shopify data is provided below. Use it as the SOURCE OF TRUTH for revenue figures. Build projections from actual data.' : ''}

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
  },
  "dataSources": ["string — list of connected data sources used"]
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
${shopifyContext}${metaContext}

${shopifyContext ? 'Use the real Shopify data above as your baseline. Project forward from actual numbers.' : `If no revenue/expenses given, estimate realistic numbers for a ${industry || 'general'} business in ${location || 'the UAE'}.`}
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
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
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
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
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
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
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
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' }); res.json({ conversations: await loadJSON(path.join(DATA_DIR, `csa-${req.params.userId}.json`), []) }); }
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
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' }); res.json({ entries: await loadJSON(path.join(DATA_DIR, `csa-kb-${req.params.userId}.json`), []) }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

router.put('/csa/knowledge/:userId/:entryId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
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
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
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
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' }); res.json({ settings: await loadJSON(path.join(DATA_DIR, `csa-settings-${req.params.userId}.json`), {}) }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// CSA Widget embed code
router.get('/csa/widget/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const { userId } = req.params;
    const settingsFile = path.join(DATA_DIR, `csa-settings-${userId}.json`);
    const settings = await loadJSON(settingsFile, {});
    const widget = settings.widget || {};
    const embedCode = `<script src="https://app.mubyn.com/widget/${userId}.js" async></script>`;
    res.json({ success: true, embed_code: embedCode, widget_id: userId, config: widget });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ═══════════════════════════════════════════════════════════════════
// CSA EMAIL CHANNEL — IMAP Poll + SMTP Send
// Ported from Supabase Edge Functions to Express + JSON file storage
// ═══════════════════════════════════════════════════════════════════
const imapSimple = require('imap-simple');
const { simpleParser } = require('mailparser');

// Encryption helpers for storing email credentials
const EMAIL_CRYPT_KEY = (process.env.EMAIL_CRYPT_KEY || 'mubyn-email-crypt-key-2026!!').slice(0, 32).padEnd(32, '0');

function encryptCredential(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(EMAIL_CRYPT_KEY), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptCredential(encrypted) {
  if (!encrypted || !encrypted.includes(':')) return encrypted;
  try {
    const [ivHex, encData] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(EMAIL_CRYPT_KEY), iv);
    let decrypted = decipher.update(encData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('Decrypt failed:', e.message);
    return encrypted;
  }
}

// IMAP presets per provider
const IMAP_PRESETS = {
  gmail: { imap_host: 'imap.gmail.com', imap_port: 993, smtp_host: 'smtp.gmail.com', smtp_port: 587 },
  outlook: { imap_host: 'outlook.office365.com', imap_port: 993, smtp_host: 'smtp.office365.com', smtp_port: 587 },
  yahoo: { imap_host: 'imap.mail.yahoo.com', imap_port: 993, smtp_host: 'smtp.mail.yahoo.com', smtp_port: 587 },
  zoho: { imap_host: 'imap.zoho.com', imap_port: 993, smtp_host: 'smtp.zoho.com', smtp_port: 587 },
  icloud: { imap_host: 'imap.mail.me.com', imap_port: 993, smtp_host: 'smtp.mail.me.com', smtp_port: 587 },
};

// Senders to ignore (automated/system emails)
const EMAIL_IGNORE_SENDERS = [
  'noreply@', 'no-reply@', 'mailer-daemon@', 'postmaster@', 'notifications@',
  'newsletter@', 'marketing@', 'donotreply@', '@calendar.google.com',
  '@facebookmail.com', '@linkedin.com', '@github.com', '@slack.com',
];

const EMAIL_IGNORE_SUBJECTS = [
  'password reset', 'verify your email', 'email verification', 'meeting invitation',
  'calendar invitation', 'out of office', 'automatic reply', 'auto-reply',
  'delivery failure', 'undeliverable', 'unsubscribe', 'newsletter',
];

function shouldProcessEmail(from, subject) {
  const fromLower = (from || '').toLowerCase();
  const subjectLower = (subject || '').toLowerCase();
  for (const p of EMAIL_IGNORE_SENDERS) { if (fromLower.includes(p)) return false; }
  for (const p of EMAIL_IGNORE_SUBJECTS) { if (subjectLower.includes(p)) return false; }
  const reCount = (subject || '').match(/\bRe:/gi)?.length || 0;
  if (reCount >= 4) return false;
  return true;
}

function extractEmailAddress(fromHeader) {
  if (!fromHeader) return '';
  const match = fromHeader.match(/<([^>]+)>/);
  return match ? match[1] : fromHeader.trim();
}

// ── POST /csa/email/connect — Connect email via IMAP/SMTP credentials ──
router.post('/csa/email/connect', async (req, res) => {
  try {
    const { userId, email, password, provider, imap_host, imap_port, smtp_host, smtp_port } = req.body;
    if (!userId || !email || !password) {
      return res.status(400).json({ error: 'userId, email, and password are required' });
    }

    const preset = IMAP_PRESETS[provider] || {};
    const imapHost = imap_host || preset.imap_host;
    const imapPort = parseInt(imap_port || preset.imap_port || '993');
    const smtpHost = smtp_host || preset.smtp_host;
    const smtpPort = parseInt(smtp_port || preset.smtp_port || '587');

    if (!imapHost || !smtpHost) {
      return res.status(400).json({ error: 'IMAP/SMTP host required. Pick a provider or supply custom settings.' });
    }

    // Test IMAP connection
    try {
      const testConfig = {
        imap: { user: email, password, host: imapHost, port: imapPort, tls: true, tlsOptions: { rejectUnauthorized: false }, authTimeout: 10000 }
      };
      const connection = await imapSimple.connect(testConfig);
      connection.end();
      console.log(`✅ IMAP test passed for ${email}`);
    } catch (imapErr) {
      console.error(`❌ IMAP test failed for ${email}:`, imapErr.message);
      return res.status(400).json({ error: `IMAP connection failed: ${imapErr.message}. Check credentials/app password.` });
    }

    // Test SMTP connection
    try {
      const testTransport = nodemailer.createTransport({
        host: smtpHost, port: smtpPort, secure: smtpPort === 465,
        auth: { user: email, pass: password },
        connectionTimeout: 10000,
      });
      await testTransport.verify();
      testTransport.close();
      console.log(`✅ SMTP test passed for ${email}`);
    } catch (smtpErr) {
      console.error(`❌ SMTP test failed for ${email}:`, smtpErr.message);
      return res.status(400).json({ error: `SMTP connection failed: ${smtpErr.message}. Check credentials/app password.` });
    }

    // Save encrypted credentials
    const emailChannelFile = path.join(DATA_DIR, `csa-email-${userId}.json`);
    const channelData = {
      id: crypto.randomUUID(),
      userId,
      email,
      provider: provider || 'custom',
      imap_host: imapHost,
      imap_port: imapPort,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      password_encrypted: encryptCredential(password),
      is_active: true,
      last_poll_at: null,
      last_message_uid: null,
      connected_at: new Date().toISOString(),
    };
    await saveJSON(emailChannelFile, channelData);

    console.log(`📧 Email channel connected: ${email} (${provider || 'custom'}) for user ${userId}`);
    res.json({
      success: true,
      channel: { id: channelData.id, email, provider: channelData.provider, connected_at: channelData.connected_at },
    });
  } catch (e) {
    console.error('Email connect error:', e);
    res.status(500).json({ error: 'Email connection failed', details: e.message });
  }
});

// ── GET /csa/email/status/:userId — Check if email channel is connected ──
router.get('/csa/email/status/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const channelFile = path.join(DATA_DIR, `csa-email-${req.params.userId}.json`);
    const channel = await loadJSON(channelFile, null);
    if (!channel || !channel.is_active) return res.json({ connected: false });
    res.json({
      connected: true,
      email: channel.email,
      provider: channel.provider,
      oauth_provider: channel.oauth?.provider || null,
      connected_at: channel.connected_at,
      last_poll_at: channel.last_poll_at,
    });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ── DELETE /csa/email/disconnect/:userId — Disconnect email channel ──
router.delete('/csa/email/disconnect/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const channelFile = path.join(DATA_DIR, `csa-email-${req.params.userId}.json`);
    const channel = await loadJSON(channelFile, null);
    if (!channel) return res.status(404).json({ error: 'No email channel found' });
    channel.is_active = false;
    channel.disconnected_at = new Date().toISOString();
    await saveJSON(channelFile, channel);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Disconnect failed' }); }
});

// ── GET /csa/email/poll/:userId — Poll for new emails, AI auto-respond ──
router.get('/csa/email/poll/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const { userId } = req.params;
    const channelFile = path.join(DATA_DIR, `csa-email-${userId}.json`);
    const channel = await loadJSON(channelFile, null);
    if (!channel || !channel.is_active) {
      return res.status(404).json({ error: 'No active email channel. Connect one first.' });
    }

    console.log(`📧 Polling email for ${channel.email}...`);

    let imapConfig;
    if (channel.oauth && channel.oauth.provider === 'google') {
      // OAuth2 XOAUTH2 authentication
      const accessToken = await getGoogleAccessToken(channel);
      if (!accessToken) {
        return res.status(500).json({ error: 'Failed to get OAuth access token. Try reconnecting Google.' });
      }
      const xoauth2Token = buildXOAuth2Token(channel.email, accessToken);
      imapConfig = {
        imap: {
          user: channel.email, xoauth2: xoauth2Token,
          host: channel.imap_host, port: channel.imap_port,
          tls: true, tlsOptions: { rejectUnauthorized: false }, authTimeout: 15000,
        }
      };
    } else {
      // Traditional password auth
      const password = decryptCredential(channel.password_encrypted);
      imapConfig = {
        imap: {
          user: channel.email, password,
          host: channel.imap_host, port: channel.imap_port,
          tls: true, tlsOptions: { rejectUnauthorized: false }, authTimeout: 15000,
        }
      };
    }

    let connection;
    try {
      connection = await imapSimple.connect(imapConfig);
    } catch (imapErr) {
      console.error(`❌ IMAP connect failed for ${channel.email}:`, imapErr.message);
      return res.status(500).json({ error: `IMAP connection failed: ${imapErr.message}` });
    }

    try {
      await connection.openBox('INBOX');
      const searchCriteria = ['UNSEEN'];
      const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false, struct: true };
      const messages = await connection.search(searchCriteria, fetchOptions);
      console.log(`📧 Found ${messages.length} unread emails for ${channel.email}`);

      // Load state
      const convoFile = path.join(DATA_DIR, `csa-email-conversations-${userId}.json`);
      const conversations = await loadJSON(convoFile, []);
      const processedFile = path.join(DATA_DIR, `csa-email-processed-${userId}.json`);
      const processedIds = new Set(await loadJSON(processedFile, []));

      // Load AI context
      const kbFile = path.join(DATA_DIR, `csa-kb-${userId}.json`);
      const kb = await loadJSON(kbFile, []);
      const activeKb = kb.filter(k => k.is_active !== false);
      const settingsFile = path.join(DATA_DIR, `csa-settings-${userId}.json`);
      const csaSettings = await loadJSON(settingsFile, {});
      const users = await loadJSON(path.join(DATA_DIR, 'users.json'), []);
      const user = users.find(u => u.id === userId);

      let newCount = 0;
      let repliedCount = 0;
      const errors = [];
      const MAX_PER_CYCLE = 5;

      for (const msg of messages.slice(0, MAX_PER_CYCLE)) {
        try {
          const allParts = msg.parts.find(p => p.which === '');
          if (!allParts) continue;

          const parsed = await simpleParser(allParts.body);
          const uid = msg.attributes.uid;
          const messageId = parsed.messageId || `uid-${uid}`;

          if (processedIds.has(messageId)) continue;

          const from = extractEmailAddress(parsed.from?.text || '');
          const subject = parsed.subject || '(No Subject)';
          const body = (parsed.text || '').substring(0, 2000);

          // Skip self-emails & system emails
          if (from.toLowerCase() === channel.email.toLowerCase()) { processedIds.add(messageId); continue; }
          if (!shouldProcessEmail(from, subject)) { processedIds.add(messageId); continue; }

          console.log(`📨 Processing email from ${from}: ${subject}`);
          newCount++;

          // Find or create conversation
          let convo = conversations.find(c => c.external_id === from && c.status === 'active');
          if (!convo) {
            convo = {
              id: crypto.randomUUID(), external_id: from, user_email: from,
              user_name: from.split('@')[0], channel: 'email', status: 'active',
              messages: [], created_at: new Date().toISOString(),
            };
            conversations.push(convo);
          }

          convo.messages.push({
            id: crypto.randomUUID(), role: 'customer',
            content: `**${subject}**\n\n${body}`, email_subject: subject,
            email_message_id: messageId,
            timestamp: new Date(parsed.date || Date.now()).toISOString(),
          });
          convo.updated_at = new Date().toISOString();

          // Build AI prompt
          let kbContext = '';
          if (activeKb.length > 0) {
            kbContext = '\n\nKnowledge Base:\n' + activeKb.map(k => `Q: ${k.title}\nA: ${k.content}`).join('\n\n');
          }
          let toneInstructions = '';
          if (csaSettings.tone) toneInstructions += `\nTone: ${csaSettings.tone}.`;
          if (csaSettings.language) toneInstructions += `\nLanguage: ${csaSettings.language}.`;
          if (csaSettings.response_length) toneInstructions += `\nResponse length: ${csaSettings.response_length}.`;
          if (csaSettings.custom_instructions) toneInstructions += `\nAdditional: ${csaSettings.custom_instructions}`;

          const businessName = user?.business_name || 'our company';
          const systemPrompt = `You are a professional customer support agent for ${businessName}. You are responding to a customer email.
Be empathetic, solution-oriented, and helpful. Keep it concise for email (2-4 short paragraphs max).
Do NOT include subject lines — just the body text.
Do NOT use markdown formatting — write plain text suitable for email.
Sign off with "Best regards" and the team name.${toneInstructions}${kbContext}`;

          const aiReply = await openaiChat(systemPrompt, `Customer email:\nSubject: ${subject}\n\n${body}`, 512);

          convo.messages.push({
            id: crypto.randomUUID(), role: 'agent', content: aiReply,
            email_subject: `Re: ${subject}`, timestamp: new Date().toISOString(),
          });

          // Send reply via SMTP
          try {
            const smtpTransport = nodemailer.createTransport({
              host: channel.smtp_host, port: channel.smtp_port,
              secure: channel.smtp_port === 465,
              auth: { user: channel.email, pass: password },
            });

            const htmlBody = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
<div>${aiReply.replace(/\n/g, '<br>')}</div></body></html>`;

            await smtpTransport.sendMail({
              from: `"${businessName}" <${channel.email}>`,
              to: from, subject: `Re: ${subject}`,
              text: aiReply, html: htmlBody,
              inReplyTo: messageId, references: messageId,
            });
            smtpTransport.close();
            repliedCount++;
            console.log(`✅ AI reply sent to ${from}`);

            try { await connection.addFlags(uid, ['\\Seen']); } catch (_) {}
          } catch (smtpErr) {
            console.error(`❌ SMTP send failed to ${from}:`, smtpErr.message);
            errors.push(`Send to ${from}: ${smtpErr.message}`);
          }

          processedIds.add(messageId);
        } catch (msgErr) {
          console.error('Error processing email:', msgErr.message);
          errors.push(msgErr.message);
        }
      }

      // Save state
      await saveJSON(convoFile, conversations);
      await saveJSON(processedFile, Array.from(processedIds));
      channel.last_poll_at = new Date().toISOString();
      await saveJSON(channelFile, channel);
      connection.end();

      // Also save to main CSA conversations for dashboard visibility
      if (newCount > 0) {
        const csaFile = path.join(DATA_DIR, `csa-${userId}.json`);
        const csaConvos = await loadJSON(csaFile, []);
        for (const convo of conversations) {
          for (let i = 0; i < convo.messages.length; i += 2) {
            const custMsg = convo.messages[i];
            const agentMsg = convo.messages[i + 1];
            if (custMsg && agentMsg && !csaConvos.find(c => c.id === custMsg.id)) {
              csaConvos.push({
                id: custMsg.id, customer_message: custMsg.content,
                ai_response: agentMsg?.content || '',
                business_context: `Email from ${convo.user_email}`,
                channel: 'email', timestamp: custMsg.timestamp,
              });
            }
          }
        }
        await saveJSON(csaFile, csaConvos);
      }

      console.log(`📧 Poll complete: ${newCount} new, ${repliedCount} replied`);
      res.json({ success: true, new_emails: newCount, replied: repliedCount, errors, last_poll: channel.last_poll_at });
    } catch (boxErr) {
      connection.end();
      throw boxErr;
    }
  } catch (e) {
    console.error('Email poll error:', e);
    res.status(500).json({ error: 'Email poll failed', details: e.message });
  }
});

// ── POST /csa/email/send — Send a manual email reply ──
router.post('/csa/email/send', async (req, res) => {
  try {
    const { userId, to, subject, body, inReplyTo } = req.body;
    if (!userId || !to || !subject || !body) {
      return res.status(400).json({ error: 'userId, to, subject, and body are required' });
    }

    const channelFile = path.join(DATA_DIR, `csa-email-${userId}.json`);
    const channel = await loadJSON(channelFile, null);
    if (!channel || !channel.is_active) {
      return res.status(404).json({ error: 'No active email channel. Connect one first.' });
    }

    const users = await loadJSON(path.join(DATA_DIR, 'users.json'), []);
    const user = users.find(u => u.id === userId);
    const fromName = user?.business_name || user?.name || 'Support';

    let smtpTransport;
    if (channel.oauth && channel.oauth.provider === 'google') {
      // OAuth2 SMTP authentication
      const accessToken = await getGoogleAccessToken(channel);
      if (!accessToken) {
        return res.status(500).json({ error: 'Failed to get OAuth access token. Try reconnecting Google.' });
      }
      smtpTransport = nodemailer.createTransport({
        host: channel.smtp_host, port: channel.smtp_port,
        secure: channel.smtp_port === 465,
        auth: {
          type: 'OAuth2',
          user: channel.email,
          accessToken: accessToken,
        },
      });
    } else {
      const password = decryptCredential(channel.password_encrypted);
      smtpTransport = nodemailer.createTransport({
        host: channel.smtp_host, port: channel.smtp_port,
        secure: channel.smtp_port === 465,
        auth: { user: channel.email, pass: password },
      });
    }

    const htmlBody = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
<div>${body.replace(/\n/g, '<br>')}</div></body></html>`;

    const info = await smtpTransport.sendMail({
      from: `"${fromName}" <${channel.email}>`,
      to, subject, text: body, html: htmlBody,
      ...(inReplyTo ? { inReplyTo, references: inReplyTo } : {}),
    });
    smtpTransport.close();

    // Save to conversations
    const convoFile = path.join(DATA_DIR, `csa-email-conversations-${userId}.json`);
    const conversations = await loadJSON(convoFile, []);
    let convo = conversations.find(c => c.external_id === to && c.status === 'active');
    if (!convo) {
      convo = {
        id: crypto.randomUUID(), external_id: to, user_email: to,
        user_name: to.split('@')[0], channel: 'email', status: 'active',
        messages: [], created_at: new Date().toISOString(),
      };
      conversations.push(convo);
    }
    convo.messages.push({
      id: crypto.randomUUID(), role: 'agent', content: body,
      email_subject: subject, email_message_id: info.messageId,
      timestamp: new Date().toISOString(),
    });
    convo.updated_at = new Date().toISOString();
    await saveJSON(convoFile, conversations);

    console.log(`📧 Manual email sent to ${to}: ${subject}`);
    res.json({ success: true, messageId: info.messageId, to, subject });
  } catch (e) {
    console.error('Email send error:', e);
    res.status(500).json({ error: 'Email send failed', details: e.message });
  }
});

// ── GET /csa/email/conversations/:userId — Get email conversations ──
router.get('/csa/email/conversations/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const convoFile = path.join(DATA_DIR, `csa-email-conversations-${req.params.userId}.json`);
    res.json({ conversations: await loadJSON(convoFile, []) });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ═══════════════════════════════════════════════════════════════════
// CSA TELEGRAM BOT — Connect, Webhook, Disconnect, Status
// ═══════════════════════════════════════════════════════════════════

const TELEGRAM_WEBHOOK_BASE = 'https://natural-energy-production-df04.up.railway.app/api/csa/telegram/webhook';

// Helper: validate bot token via Telegram getMe
async function validateTelegramToken(botToken) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await res.json();
    if (!data.ok) return { success: false, error: data.description || 'Invalid bot token' };
    return { success: true, data: data.result };
  } catch (err) {
    return { success: false, error: 'Failed to reach Telegram API' };
  }
}

// Helper: set Telegram webhook
async function setTelegramWebhook(botToken, webhookUrl) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'callback_query'] }),
    });
    const data = await res.json();
    if (!data.ok) return { success: false, error: data.description };
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to set webhook' };
  }
}

// Helper: delete Telegram webhook
async function deleteTelegramWebhook(botToken) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
    const data = await res.json();
    if (!data.ok) return { success: false, error: data.description };
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to delete webhook' };
  }
}

// Helper: send Telegram message
async function sendTelegramMessage(botToken, chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Telegram send error:', err);
    return null;
  }
}

// ── POST /csa/telegram/connect — Validate token, set webhook, store channel ──
router.post('/csa/telegram/connect', async (req, res) => {
  try {
    const { userId, bot_token } = req.body;
    if (!userId || !bot_token) return res.status(400).json({ error: 'userId and bot_token required' });

    // 1. Validate token
    const botInfo = await validateTelegramToken(bot_token);
    if (!botInfo.success) return res.status(400).json({ success: false, error: botInfo.error });

    const botId = String(botInfo.data.id);
    const botUsername = botInfo.data.username;

    // 2. Set webhook — route to /api/csa/telegram/webhook/:userId
    const webhookUrl = `${TELEGRAM_WEBHOOK_BASE}/${userId}`;
    const whResult = await setTelegramWebhook(bot_token, webhookUrl);
    if (!whResult.success) return res.status(400).json({ success: false, error: `Webhook failed: ${whResult.error}` });

    // 3. Store channel data
    const channelsFile = path.join(DATA_DIR, `csa-telegram-${userId}.json`);
    const channelData = {
      userId,
      channel_type: 'telegram',
      bot_token,
      bot_id: botId,
      bot_username: botUsername,
      bot_first_name: botInfo.data.first_name,
      webhook_url: webhookUrl,
      webhook_set: true,
      is_active: true,
      connected_at: new Date().toISOString(),
    };
    await saveJSON(channelsFile, channelData);

    console.log(`✅ Telegram bot @${botUsername} connected for user ${userId}`);

    res.json({
      success: true,
      channel: {
        bot_username: botUsername,
        bot_id: botId,
        bot_first_name: botInfo.data.first_name,
        webhook_url: webhookUrl,
      },
    });
  } catch (e) {
    console.error('Telegram connect error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /csa/telegram/disconnect — Remove webhook, deactivate ──
router.post('/csa/telegram/disconnect', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const channelsFile = path.join(DATA_DIR, `csa-telegram-${userId}.json`);
    const channel = await loadJSON(channelsFile, null);
    if (!channel || !channel.is_active) return res.status(404).json({ success: false, error: 'No active Telegram channel found' });

    // Remove webhook
    if (channel.bot_token) await deleteTelegramWebhook(channel.bot_token);

    // Deactivate
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

// ── GET /csa/telegram/status/:userId — Check bot connection status ──
router.get('/csa/telegram/status/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const { userId } = req.params;
    const channelsFile = path.join(DATA_DIR, `csa-telegram-${userId}.json`);
    const channel = await loadJSON(channelsFile, null);

    if (!channel || !channel.is_active) {
      return res.json({ connected: false });
    }

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

// ── POST /csa/telegram/webhook/:userId — Receives Telegram messages, auto-responds ──
router.post('/csa/telegram/webhook/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const { userId } = req.params;
    const body = req.body;

    // Telegram sends update objects: { message, edited_message, callback_query, ... }
    const message = body.message || body.edited_message;
    if (!message || !message.text) {
      // Acknowledge non-text updates silently
      return res.json({ ok: true });
    }

    const chatId = message.chat.id.toString();
    const messageText = message.text;
    const userName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || message.from?.username || 'Customer';
    const telegramUserId = message.from?.id?.toString();

    console.log(`📨 Telegram message from ${userName} (chat ${chatId}) for user ${userId}: ${messageText.substring(0, 100)}`);

    // Load channel data (contains bot token)
    const channelsFile = path.join(DATA_DIR, `csa-telegram-${userId}.json`);
    const channel = await loadJSON(channelsFile, null);
    if (!channel || !channel.is_active || !channel.bot_token) {
      console.error(`❌ No active Telegram channel for user ${userId}`);
      return res.json({ ok: true }); // still acknowledge to Telegram
    }

    // Load knowledge base
    const kbFile = path.join(DATA_DIR, `csa-kb-${userId}.json`);
    const savedKb = await loadJSON(kbFile, []);
    const activeKb = savedKb.filter(kb => kb.is_active !== false);
    let kbContext = '';
    if (activeKb.length > 0) {
      kbContext = '\n\nKnowledge Base (use this to answer accurately):\n' +
        activeKb.map(kb => `Q: ${kb.title}\nA: ${kb.content}`).join('\n\n');
    }

    // Load tone settings
    const settingsFile = path.join(DATA_DIR, `csa-settings-${userId}.json`);
    const settings = await loadJSON(settingsFile, {});
    let toneInstructions = '';
    if (settings.tone) toneInstructions += `\nTone: ${settings.tone}.`;
    if (settings.language) toneInstructions += `\nLanguage: ${settings.language}.`;
    if (settings.response_length) toneInstructions += `\nResponse length: ${settings.response_length}.`;
    if (settings.custom_instructions) toneInstructions += `\nAdditional instructions: ${settings.custom_instructions}`;

    // Load user business info for context
    const users = await loadJSON(path.join(DATA_DIR, 'users.json'), []);
    const user = users.find(u => u.id === userId);
    const businessName = user?.business_name || 'our business';

    // Build system prompt
    const systemPrompt = `You are a professional customer support agent for ${businessName}. You help customers via Telegram.
Be empathetic, clear, and solution-oriented. Keep responses concise and mobile-friendly.
Customer name: ${userName}.${toneInstructions}${kbContext}`;

    // Generate AI response
    const aiResponse = await openaiChat(systemPrompt, messageText, 512);

    // Send response back via Telegram
    await sendTelegramMessage(channel.bot_token, chatId, aiResponse);

    // Store conversation for dashboard history
    const convoFile = path.join(DATA_DIR, `csa-telegram-convos-${userId}.json`);
    const convos = await loadJSON(convoFile, []);
    convos.push({
      id: crypto.randomUUID(),
      channel: 'telegram',
      chat_id: chatId,
      telegram_user_id: telegramUserId,
      user_name: userName,
      customer_message: messageText,
      ai_response: aiResponse,
      timestamp: new Date().toISOString(),
    });
    // Keep last 500 conversations
    if (convos.length > 500) convos.splice(0, convos.length - 500);
    await saveJSON(convoFile, convos);

    // Also save to main CSA conversations for unified view
    const csaFile = path.join(DATA_DIR, `csa-${userId}.json`);
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
    // Always return 200 to Telegram to prevent retry storms
    res.json({ ok: true, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// CSA WHATSAPP BUSINESS — Connect, Webhook, Send, Conversations
// ═══════════════════════════════════════════════════════════════════

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v19.0';

// ── POST /csa/whatsapp/connect — Store WhatsApp Business API credentials ──
router.post('/csa/whatsapp/connect', async (req, res) => {
  try {
    const { userId, phoneNumberId, accessToken, businessAccountId, webhookVerifyToken } = req.body;
    if (!userId || !phoneNumberId || !accessToken) {
      return res.status(400).json({ error: 'userId, phoneNumberId, and accessToken are required' });
    }

    // Test by fetching phone number info
    let phoneInfo;
    try {
      const testRes = await fetch(`${WHATSAPP_API_BASE}/${phoneNumberId}?access_token=${accessToken}`);
      if (!testRes.ok) {
        const err = await testRes.json().catch(() => ({}));
        return res.status(400).json({ error: `WhatsApp API error: ${err.error?.message || 'Invalid credentials'}` });
      }
      phoneInfo = await testRes.json();
    } catch (apiErr) {
      return res.status(400).json({ error: `Cannot reach WhatsApp API: ${apiErr.message}` });
    }

    const verifyToken = webhookVerifyToken || crypto.randomBytes(16).toString('hex');

    const channelFile = path.join(DATA_DIR, `cs-whatsapp-${userId}.json`);
    const channelData = {
      userId,
      phoneNumberId,
      accessToken,
      businessAccountId: businessAccountId || '',
      webhookVerifyToken: verifyToken,
      displayPhoneNumber: phoneInfo.display_phone_number || phoneInfo.verified_name || phoneNumberId,
      verifiedName: phoneInfo.verified_name || '',
      qualityRating: phoneInfo.quality_rating || '',
      autoReply: true,
      is_active: true,
      connected_at: new Date().toISOString(),
    };
    await saveJSON(channelFile, channelData);

    console.log(`✅ WhatsApp Business connected for user ${userId}: ${channelData.displayPhoneNumber}`);

    res.json({
      success: true,
      channel: {
        displayPhoneNumber: channelData.displayPhoneNumber,
        verifiedName: channelData.verifiedName,
        qualityRating: channelData.qualityRating,
        webhookVerifyToken: verifyToken,
      },
    });
  } catch (e) {
    console.error('WhatsApp connect error:', e);
    res.status(500).json({ error: 'WhatsApp connection failed', details: e.message });
  }
});

// ── GET /csa/whatsapp/status/:userId — Check WhatsApp connection ──
router.get('/csa/whatsapp/status/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const channelFile = path.join(DATA_DIR, `cs-whatsapp-${req.params.userId}.json`);
    const channel = await loadJSON(channelFile, null);
    if (!channel || !channel.is_active) return res.json({ connected: false });
    res.json({
      connected: true,
      displayPhoneNumber: channel.displayPhoneNumber,
      verifiedName: channel.verifiedName,
      qualityRating: channel.qualityRating,
      autoReply: channel.autoReply !== false,
      connected_at: channel.connected_at,
    });
  } catch (e) { res.status(500).json({ connected: false, error: e.message }); }
});

// ── DELETE /csa/whatsapp/disconnect/:userId — Remove WhatsApp credentials ──
router.delete('/csa/whatsapp/disconnect/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const channelFile = path.join(DATA_DIR, `cs-whatsapp-${req.params.userId}.json`);
    const channel = await loadJSON(channelFile, null);
    if (!channel) return res.status(404).json({ error: 'No WhatsApp channel found' });
    channel.is_active = false;
    channel.disconnected_at = new Date().toISOString();
    await saveJSON(channelFile, channel);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Disconnect failed' }); }
});

// ── PATCH /csa/whatsapp/auto-reply/:userId — Toggle auto-reply ──
router.patch('/csa/whatsapp/auto-reply/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const channelFile = path.join(DATA_DIR, `cs-whatsapp-${req.params.userId}.json`);
    const channel = await loadJSON(channelFile, null);
    if (!channel || !channel.is_active) return res.status(404).json({ error: 'No active WhatsApp channel' });
    channel.autoReply = req.body.autoReply !== false;
    await saveJSON(channelFile, channel);
    res.json({ success: true, autoReply: channel.autoReply });
  } catch (e) { res.status(500).json({ error: 'Update failed' }); }
});

// ── GET /csa/whatsapp/webhook — Webhook verification (Meta sends GET to verify) ──
router.get('/csa/whatsapp/webhook', async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const userId = req.query.userId;

    if (!mode || !token || !userId) {
      return res.status(400).send('Missing parameters');
    }

    if (mode === 'subscribe') {
      const channelFile = path.join(DATA_DIR, `cs-whatsapp-${userId}.json`);
      const channel = await loadJSON(channelFile, null);
      if (channel && channel.webhookVerifyToken === token) {
        console.log(`✅ WhatsApp webhook verified for user ${userId}`);
        return res.status(200).send(challenge);
      }
    }

    console.warn(`❌ WhatsApp webhook verification failed for user ${userId}`);
    res.status(403).send('Forbidden');
  } catch (e) {
    console.error('WhatsApp webhook verify error:', e);
    res.status(500).send('Error');
  }
});

// ── POST /csa/whatsapp/webhook — Incoming WhatsApp messages ──
router.post('/csa/whatsapp/webhook', async (req, res) => {
  try {
    const userId = req.query.userId;
    const body = req.body;

    // Always return 200 immediately to WhatsApp
    res.status(200).json({ ok: true });

    if (!userId || !body?.entry) return;

    const channelFile = path.join(DATA_DIR, `cs-whatsapp-${userId}.json`);
    const channel = await loadJSON(channelFile, null);
    if (!channel || !channel.is_active) return;

    // Process each entry
    for (const entry of body.entry) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value?.messages) continue;

        for (const msg of value.messages) {
          if (msg.type !== 'text' || !msg.text?.body) continue;

          const senderPhone = msg.from; // e.g. "971501234567"
          const messageText = msg.text.body;
          const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000).toISOString() : new Date().toISOString();
          const senderName = (value.contacts && value.contacts.find(c => c.wa_id === senderPhone))?.profile?.name || senderPhone;

          console.log(`📱 WhatsApp from ${senderName} (${senderPhone}) for user ${userId}: ${messageText.substring(0, 100)}`);

          // Store in conversations
          const convoFile = path.join(DATA_DIR, `cs-whatsapp-conversations-${userId}.json`);
          const conversations = await loadJSON(convoFile, []);

          let convo = conversations.find(c => c.phone === senderPhone && c.status === 'active');
          if (!convo) {
            convo = {
              id: crypto.randomUUID(),
              phone: senderPhone,
              name: senderName,
              status: 'active',
              messages: [],
              created_at: new Date().toISOString(),
            };
            conversations.push(convo);
          }

          convo.messages.push({
            id: crypto.randomUUID(),
            role: 'customer',
            content: messageText,
            timestamp,
          });
          convo.updated_at = new Date().toISOString();

          // Auto-reply if enabled
          if (channel.autoReply !== false) {
            try {
              // Load KB + settings (same pattern as Telegram/Email)
              const kbFile = path.join(DATA_DIR, `csa-kb-${userId}.json`);
              const savedKb = await loadJSON(kbFile, []);
              const activeKb = savedKb.filter(kb => kb.is_active !== false);
              let kbContext = '';
              if (activeKb.length > 0) {
                kbContext = '\n\nKnowledge Base:\n' + activeKb.map(kb => `Q: ${kb.title}\nA: ${kb.content}`).join('\n\n');
              }

              const settingsFile = path.join(DATA_DIR, `csa-settings-${userId}.json`);
              const csaSettings = await loadJSON(settingsFile, {});
              let toneInstructions = '';
              if (csaSettings.tone) toneInstructions += `\nTone: ${csaSettings.tone}.`;
              if (csaSettings.language) toneInstructions += `\nLanguage: ${csaSettings.language}.`;
              if (csaSettings.response_length) toneInstructions += `\nResponse length: ${csaSettings.response_length}.`;
              if (csaSettings.custom_instructions) toneInstructions += `\nAdditional: ${csaSettings.custom_instructions}`;

              const users = await loadJSON(path.join(DATA_DIR, 'users.json'), []);
              const user = users.find(u => u.id === userId);
              const businessName = user?.business_name || 'our business';

              const systemPrompt = `You are a professional customer support agent for ${businessName}. You help customers via WhatsApp.
Be empathetic, clear, and solution-oriented. Keep responses concise and mobile-friendly (max 3-4 short paragraphs).
Customer: ${senderName}.${toneInstructions}${kbContext}`;

              const aiResponse = await openaiChat(systemPrompt, messageText, 512);

              // Send reply via WhatsApp API
              const sendRes = await fetch(`${WHATSAPP_API_BASE}/${channel.phoneNumberId}/messages`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${channel.accessToken}`,
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: senderPhone,
                  type: 'text',
                  text: { body: aiResponse },
                }),
              });

              if (sendRes.ok) {
                console.log(`✅ WhatsApp AI reply sent to ${senderPhone}`);
              } else {
                const sendErr = await sendRes.text().catch(() => '');
                console.error(`❌ WhatsApp send failed: ${sendErr}`);
              }

              convo.messages.push({
                id: crypto.randomUUID(),
                role: 'agent',
                content: aiResponse,
                timestamp: new Date().toISOString(),
              });
            } catch (aiErr) {
              console.error('WhatsApp AI reply error:', aiErr.message);
            }
          }

          await saveJSON(convoFile, conversations);

          // Also save to main CSA conversations for unified view
          const csaFile = path.join(DATA_DIR, `csa-${userId}.json`);
          const csaConvos = await loadJSON(csaFile, []);
          csaConvos.push({
            id: crypto.randomUUID(),
            customer_message: `[WhatsApp - ${senderName}] ${messageText}`,
            ai_response: convo.messages[convo.messages.length - 1]?.role === 'agent' ? convo.messages[convo.messages.length - 1].content : '',
            business_context: `WhatsApp ${channel.displayPhoneNumber}`,
            channel: 'whatsapp',
            timestamp,
          });
          await saveJSON(csaFile, csaConvos);
        }
      }
    }
  } catch (e) {
    console.error('WhatsApp webhook error:', e);
    // Don't throw — already sent 200
  }
});

// ── GET /csa/whatsapp/conversations/:userId — List WhatsApp conversations ──
router.get('/csa/whatsapp/conversations/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const convoFile = path.join(DATA_DIR, `cs-whatsapp-conversations-${req.params.userId}.json`);
    res.json({ conversations: await loadJSON(convoFile, []) });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ── POST /csa/whatsapp/send — Send a WhatsApp message manually ──
router.post('/csa/whatsapp/send', async (req, res) => {
  try {
    const { userId, to, message } = req.body;
    if (!userId || !to || !message) {
      return res.status(400).json({ error: 'userId, to, and message are required' });
    }

    const channelFile = path.join(DATA_DIR, `cs-whatsapp-${userId}.json`);
    const channel = await loadJSON(channelFile, null);
    if (!channel || !channel.is_active) {
      return res.status(404).json({ error: 'No active WhatsApp channel. Connect one first.' });
    }

    const sendRes = await fetch(`${WHATSAPP_API_BASE}/${channel.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channel.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.json().catch(() => ({}));
      return res.status(sendRes.status).json({ error: err.error?.message || 'WhatsApp send failed' });
    }

    const result = await sendRes.json();

    // Save to conversations
    const convoFile = path.join(DATA_DIR, `cs-whatsapp-conversations-${userId}.json`);
    const conversations = await loadJSON(convoFile, []);
    let convo = conversations.find(c => c.phone === to && c.status === 'active');
    if (!convo) {
      convo = {
        id: crypto.randomUUID(),
        phone: to,
        name: to,
        status: 'active',
        messages: [],
        created_at: new Date().toISOString(),
      };
      conversations.push(convo);
    }
    convo.messages.push({
      id: crypto.randomUUID(),
      role: 'agent',
      content: message,
      timestamp: new Date().toISOString(),
    });
    convo.updated_at = new Date().toISOString();
    await saveJSON(convoFile, conversations);

    console.log(`📱 WhatsApp message sent to ${to}`);
    res.json({ success: true, messageId: result.messages?.[0]?.id, to });
  } catch (e) {
    console.error('WhatsApp send error:', e);
    res.status(500).json({ error: 'WhatsApp send failed', details: e.message });
  }
});

// ==================== WEBSITE BUILDER ====================

// POST /website/generate — AI generates a full website
router.post('/website/generate', async (req, res) => {
  try {
    const { userId, businessName, description, industry, style, language, phone, email: bizEmail, address, whatsapp } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!businessName) return res.status(400).json({ error: 'businessName required' });

    const subdomain = slugify(businessName);
    const lang = language || 'en';
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    const fontFamily = lang === 'ar' ? 'Tajawal' : 'Inter';

    console.log(`🌐 [Website Builder] Generating for "${businessName}" (${industry || 'general'})`);

    const systemPrompt = `You are an elite frontend engineer who builds websites that rival Stripe.com, Linear.app, and Vercel.com. You produce PRODUCTION-GRADE, world-class single-page websites.

OUTPUT RULES:
- Return ONLY the complete HTML. No markdown fences, no explanations. Start with <!DOCTYPE html>.
- The HTML must be fully self-contained. The ONLY external resources allowed are:
  • <script src="https://cdn.tailwindcss.com"></script>
  • Google Fonts via <link> (use "${fontFamily}" + a display font like "Playfair Display" or "Plus Jakarta Sans")
  • Images from source.unsplash.com (format: https://source.unsplash.com/800x600/?keyword1,keyword2)

DESIGN SYSTEM (follow precisely):
- Primary background: #0F1B2D (deep navy) for dark sections, #F8FAFC for light sections
- Accent color: #D4A843 (gold) for CTAs, highlights, borders, hover states
- Secondary accent: #3B82F6 (blue) for links and secondary buttons
- Text: #F1F5F9 on dark, #1E293B on light. Subtext: #94A3B8
- Border radius: rounded-2xl for cards, rounded-full for buttons and avatars
- Glassmorphism cards: background: rgba(255,255,255,0.05); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.08)
- Shadows: Use shadow-2xl on cards, shadow-[0_0_60px_-12px_rgba(212,168,67,0.3)] for gold glow effects
- Spacing: generous — py-24 between sections minimum, lots of whitespace

REQUIRED SECTIONS (in this order):

1. **NAVBAR** — Sticky top, semi-transparent with backdrop-blur. Logo (business name in bold + gold dot), nav links, CTA button. Mobile: hamburger menu with slide-in drawer (implement with JS).

2. **HERO** — Full viewport height (min-h-screen). Must include:
   - A large gradient mesh background (use radial gradients with gold and blue tones on dark navy)
   - Headline: Bold, 4xl-6xl, with a gold gradient text effect on key words (background: linear-gradient, -webkit-background-clip: text)
   - Subtitle: text-lg text-slate-400, max-w-2xl, elegant description
   - Two buttons: primary (gold bg, dark text, rounded-full, px-8) and secondary (glass border, text-white)
   - Floating decorative elements: subtle gradient orbs (absolute positioned, opacity-20, blur-3xl, animate-pulse)
   - Optional: a hero image/mockup or pattern

3. **SOCIAL PROOF BAR** — Logos or trust badges. "Trusted by 500+ businesses" with a row of placeholder company names in muted text, or star rating display (★★★★★ 4.9/5 from 200+ reviews).

4. **FEATURES/SERVICES** — Grid of 3-4 cards. Each card:
   - Glass card style (see glassmorphism above)
   - Large emoji icon (2xl-3xl size) at top
   - Bold title, subtle description
   - Hover: translateY(-4px) transition, gold border glow
   Format: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8

5. **ABOUT / STORY** — Split layout: text on one side, image on the other. Include:
   - "About Us" or "Our Story" heading
   - 2-3 paragraphs of compelling copy (generate realistic content based on the business)
   - A stats row: 3-4 metrics (e.g., "10+ Years", "500+ Clients", "98% Satisfaction") with large numbers and gold accents

6. **TESTIMONIALS** — 3 testimonial cards in a grid. Each has:
   - Quote text in italic
   - Avatar (use source.unsplash.com/100x100/?portrait,person)
   - Name, title, star rating (★★★★★)
   - Glass card style

7. **PRICING or SERVICES GRID** (if applicable) — 3 tiers or service cards. Highlight the middle/recommended one with a gold border and "Popular" badge.

8. **CTA SECTION** — Full-width, gradient background (gold to amber), bold headline, large CTA button. Make it compelling.

9. **CONTACT** — Two-column layout:
   - Left: Contact info (phone with tel: link, email with mailto:, address, WhatsApp button green #25D366)
   - Right: Contact form (name, email, message, submit button). Form doesn't need to actually submit — just look beautiful.
   - If WhatsApp number provided: prominent green WhatsApp button with "Chat on WhatsApp"

10. **FOOTER** — Dark (#0A1628), multi-column:
    - Column 1: Business name + short description
    - Column 2: Quick links
    - Column 3: Contact info
    - Bottom bar: "© 2026 {businessName}. All rights reserved." and "Powered by <a href='https://mubyn.com'>Mubyn</a>" in gold
    - Social media icon links (use simple SVG icons for Facebook, Instagram, X/Twitter, LinkedIn)

ANIMATIONS (implement with CSS + minimal JS):
- Intersection Observer for fade-in-up on scroll (elements start opacity-0 translateY(20px), animate to visible)
- Navbar: changes background opacity on scroll
- Buttons: hover:scale-105 transition-all duration-300
- Cards: hover:-translate-y-1 transition-all duration-300
- Gold accent elements: subtle pulse or glow animation
- Smooth scroll behavior on html element
- Counter animation for stats numbers (animate from 0 to target on scroll into view)

TAILWIND CONFIG — Add this right after the tailwind script:
<script>tailwind.config={theme:{extend:{colors:{navy:'#0F1B2D','navy-deep':'#0A1628',gold:'#D4A843','gold-light':'#E8C97A'},fontFamily:{sans:['${fontFamily}','sans-serif'],display:['Playfair Display','serif']}}}}</script>

LANGUAGE & RTL:
- Language: ${lang}
- Direction: ${dir}
- If Arabic (ar): use dir="rtl" on html, use Tajawal font, mirror all layouts, Arabic typography best practices
- Generate ALL text content in the specified language
- For Arabic: right-align text, flip flex directions, use Arabic quotation marks «»

SEO:
- Proper <title>, <meta description>, <meta viewport>
- Open Graph tags (og:title, og:description, og:image)
- Schema.org LocalBusiness JSON-LD script

CODE QUALITY:
- Clean, well-structured HTML5
- Semantic elements (header, main, section, footer, nav)
- Accessible: proper alt texts, aria-labels, focus states
- All CSS via Tailwind classes + minimal inline <style> for animations only
- JavaScript at the bottom of body, clean and minimal`;

    const userPrompt = `Build a stunning, premium website for this business:

BUSINESS NAME: ${businessName}
INDUSTRY: ${industry || 'General Business'}
DESCRIPTION: ${description || `A professional ${industry || 'business'} providing top-quality services to clients.`}
LANGUAGE: ${lang} (generate ALL visible text in this language)
${phone ? `PHONE: ${phone}` : ''}
${bizEmail ? `EMAIL: ${bizEmail}` : ''}
${address ? `ADDRESS: ${address}` : ''}
${whatsapp ? `WHATSAPP: ${whatsapp} (add a floating WhatsApp chat button in bottom-left, green, with pulse animation)` : ''}
${style ? `STYLE PREFERENCE: ${style}` : ''}

Generate realistic, compelling copy for each section — headlines, descriptions, testimonials, feature descriptions — all tailored to this specific business and industry. Do NOT use placeholder Lorem Ipsum. Every piece of text should feel like it was written by a professional copywriter.

Use relevant Unsplash images: https://source.unsplash.com/1200x800/?${encodeURIComponent(industry || businessName)},professional

Return the COMPLETE HTML document. Start with <!DOCTYPE html>. No markdown. No explanations.`;

    const htmlResponse = await openaiChat(systemPrompt, userPrompt, 16000);

    let html = htmlResponse.trim();
    if (html.startsWith('```')) html = html.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    if (!html.toLowerCase().startsWith('<!doctype')) {
      const dtIdx = html.toLowerCase().indexOf('<!doctype');
      if (dtIdx > -1) html = html.slice(dtIdx);
    }
    if (!html.includes('mubyn.com')) {
      html = html.replace('</body>', '<div style="text-align:center;padding:12px;font-size:11px;color:#888;border-top:1px solid rgba(255,255,255,0.05);"><a href="https://mubyn.com" target="_blank" style="color:#D4A843;text-decoration:none;">Powered by Mubyn</a></div></body>');
    }
    // Auto-inject CS Agent widget into generated websites
    const widgetBaseUrl = process.env.BASE_URL || 'https://natural-energy-production-df04.up.railway.app';
    const widgetScript = `<script src="${widgetBaseUrl}/api/csa/widget/${userId}" async></script>`;
    if (!html.includes('/csa/widget/')) {
      html = html.replace('</body>', `${widgetScript}\n</body>`);
    }

    const websiteDir = path.join(__dirname, '..', 'data', 'websites', userId);
    await fs.mkdir(websiteDir, { recursive: true });
    await storage.writeFile(path.join(websiteDir, 'index.html'), html, 'utf8');
    const meta = { userId, businessName, subdomain, industry: industry || 'general', description: description || '', language: lang, style: style || '', phone: phone || '', email: bizEmail || '', address: address || '', whatsapp: whatsapp || '', status: 'draft', generatedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null };
    await saveJSON(path.join(websiteDir, 'meta.json'), meta);

    const baseUrl = process.env.BASE_URL || 'https://natural-energy-production-df04.up.railway.app';
    const publicUrl = process.env.PUBLIC_SITE_URL || baseUrl;
    res.json({ success: true, html, subdomain, previewUrl: `${baseUrl}/api/website/preview/${userId}`, siteUrl: `${publicUrl}/site/${subdomain}`, meta });
  } catch (error) {
    console.error('❌ Website generate error:', error);
    res.status(500).json({ error: 'Website generation failed', details: error.message });
  }
});

// GET /website/preview/:userId
router.get('/website/preview/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const html = await storage.readFile(path.join(__dirname, '..', 'data', 'websites', req.params.userId, 'index.html'), 'utf8');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch { res.status(404).send('<html><body><h1>No website yet</h1><p>Use Mubyn to generate yours.</p></body></html>'); }
});

// GET /website/meta/:userId
router.get('/website/meta/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const meta = await loadJSON(path.join(__dirname, '..', 'data', 'websites', req.params.userId, 'meta.json'), null);
    res.json(meta ? { exists: true, meta } : { exists: false });
  } catch { res.json({ exists: false }); }
});

// POST /website/publish
router.post('/website/publish', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const websiteDir = path.join(__dirname, '..', 'data', 'websites', userId);
    const meta = await loadJSON(path.join(websiteDir, 'meta.json'), null);
    if (!meta) return res.status(404).json({ error: 'No website found. Generate first.' });

    const publishedDir = path.join(__dirname, '..', 'data', 'websites', '_published');
    await fs.mkdir(publishedDir, { recursive: true });
    const mappingFile = path.join(publishedDir, 'subdomain-map.json');
    const mapping = await loadJSON(mappingFile, {});

    let subdomain = meta.subdomain;
    if (mapping[subdomain] && mapping[subdomain] !== userId) subdomain = `${subdomain}-${Math.random().toString(36).slice(2, 6)}`;
    mapping[subdomain] = userId;
    await saveJSON(mappingFile, mapping);

    meta.subdomain = subdomain;
    meta.status = 'published';
    meta.publishedAt = new Date().toISOString();
    await saveJSON(path.join(websiteDir, 'meta.json'), meta);

    const baseUrl = process.env.BASE_URL || 'https://natural-energy-production-df04.up.railway.app';
    const publicUrl = process.env.PUBLIC_SITE_URL || baseUrl;
    res.json({ success: true, subdomain, siteUrl: `${publicUrl}/site/${subdomain}`, publishedAt: meta.publishedAt });
  } catch (error) { res.status(500).json({ error: 'Publish failed', details: error.message }); }
});

// PUT /website/edit
router.put('/website/edit', async (req, res) => {
  try {
    const { userId, instruction } = req.body;
    if (!userId || !instruction) return res.status(400).json({ error: 'userId and instruction required' });
    const htmlFile = path.join(__dirname, '..', 'data', 'websites', userId, 'index.html');
    let currentHtml;
    try { currentHtml = await storage.readFile(htmlFile, 'utf8'); } catch { return res.status(404).json({ error: 'No website found.' }); }

    const edited = await openaiChat(
      `You are an elite frontend engineer editing a premium, modern website. 

CRITICAL RULES:
1. Return the COMPLETE modified HTML. No markdown fences. Start with <!DOCTYPE html>.
2. Make the requested changes while PRESERVING or IMPROVING the overall design quality.
3. Maintain all existing: glassmorphism effects, animations, hover states, responsive design, Tailwind classes, color scheme (navy #0F1B2D, gold #D4A843).
4. Never downgrade the design. If adding new sections, match the existing premium quality.
5. Keep all JavaScript (scroll animations, mobile menu, intersection observers, counters).
6. Preserve the "Powered by Mubyn" footer credit.
7. If the instruction is in Arabic, ensure RTL layout and Arabic text are maintained.`,
      `Here is the current website HTML:\n\n${currentHtml}\n\n---\n\nREQUESTED CHANGE: ${instruction}\n\nApply this change and return the COMPLETE modified HTML. Maintain all design quality, animations, and responsive behavior.`,
      16000
    );

    let html = edited.trim();
    if (html.startsWith('```')) html = html.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    if (!html.toLowerCase().startsWith('<!doctype')) { const i = html.toLowerCase().indexOf('<!doctype'); if (i > -1) html = html.slice(i); }

    await storage.writeFile(htmlFile, html, 'utf8');
    const metaFile = path.join(__dirname, '..', 'data', 'websites', userId, 'meta.json');
    const meta = await loadJSON(metaFile, {});
    meta.updatedAt = new Date().toISOString();
    meta.lastEdit = instruction;
    await saveJSON(metaFile, meta);

    res.json({ success: true, html });
  } catch (error) { res.status(500).json({ error: 'Edit failed', details: error.message }); }
});

// ==================== WIDGET ====================

// GET /widget.js — Self-contained chat widget JavaScript (served at /api/widget.js)
router.get('/widget.js', async (req, res) => {
  const userId = req.query.id;
  if (!userId) {
    res.set('Content-Type', 'application/javascript');
    return res.send('console.error("Mubyn Widget: Missing id parameter");');
  }

  res.set('Access-Control-Allow-Origin', '*');
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');

  // Load widget config
  let config = {};
  try {
    const settings = await loadJSON(path.join(__dirname, `../data/csa-settings-${userId}.json`), {});
    config = settings.widget || {};
  } catch (e) { /* defaults */ }

  // Load user business name
  let businessName = 'Support';
  try {
    const users = await loadJSON(path.join(__dirname, '../data/users.json'), []);
    const user = users.find(u => u.id === userId);
    if (user && user.business_name) businessName = user.business_name;
  } catch (e) { /* default */ }

  const primaryColor = config.primaryColor || '#D4A843';
  const position = config.position || 'bottom-right';
  const welcomeMessage = config.welcomeMessage || 'Hi! How can I help you today?';
  const botName = config.botName || businessName || 'Support';
  const apiBase = 'https://natural-energy-production-df04.up.railway.app';

  const widgetJS = `(function(){
if(window.__mubynWidgetLoaded)return;window.__mubynWidgetLoaded=true;
var UID="${userId}",API="${apiBase}",CLR="${primaryColor}",POS="${position}";
var WELCOME=${JSON.stringify(welcomeMessage)},BOT=${JSON.stringify(botName)};
var KEY="mubyn_session_"+UID,msgs=[],open=false,loading=false;
var host=document.createElement("div");host.id="mubyn-widget-host";
host.style.cssText="position:fixed;bottom:0;"+(POS==="bottom-left"?"left":"right")+":0;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
document.body.appendChild(host);
try{var s=localStorage.getItem(KEY);if(s)msgs=JSON.parse(s);}catch(e){}
if(!msgs.length)msgs.push({role:"agent",content:WELCOME,ts:Date.now()});
function save(){try{localStorage.setItem(KEY,JSON.stringify(msgs.slice(-50)));}catch(e){}}
function esc(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML;}
function render(){
var ps=POS==="bottom-left"?"left:20px":"right:20px";
var css='<style>'
+'#mw-b{position:fixed;bottom:20px;'+ps+';width:60px;height:60px;border-radius:50%;background:'+CLR+';cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(0,0,0,.3);transition:transform .2s;border:none;z-index:2147483647}'
+'#mw-b:hover{transform:scale(1.08)}'
+'#mw-b svg{width:28px;height:28px;fill:#fff}'
+'#mw-p{position:fixed;bottom:90px;'+ps+';width:380px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);background:#1C1C24;border-radius:16px;box-shadow:0 8px 48px rgba(0,0,0,.5);display:'+(open?'flex':'none')+';flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.08);z-index:2147483647;animation:'+(open?'mwUp .25s ease':'none')+'}'
+'@keyframes mwUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}'
+'#mw-h{padding:16px 20px;background:'+CLR+';display:flex;align-items:center;gap:12px}'
+'#mw-h-a{width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center}'
+'#mw-h-a svg{width:20px;height:20px;fill:rgba(0,0,0,.7)}'
+'#mw-h-n{font-size:15px;font-weight:600;color:rgba(0,0,0,.87);margin:0}'
+'#mw-h-s{font-size:11px;color:rgba(0,0,0,.55);margin:0}'
+'#mw-x{width:32px;height:32px;border-radius:8px;background:rgba(0,0,0,.1);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center}'
+'#mw-x:hover{background:rgba(0,0,0,.2)}#mw-x svg{width:16px;height:16px;fill:rgba(0,0,0,.6)}'
+'#mw-m{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}'
+'.mw-a{align-self:flex-start;max-width:85%;padding:10px 14px;border-radius:16px 16px 16px 4px;background:rgba(255,255,255,.08);color:#e0e0e0;font-size:14px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap}'
+'.mw-c{align-self:flex-end;max-width:85%;padding:10px 14px;border-radius:16px 16px 4px 16px;background:'+CLR+';color:rgba(0,0,0,.87);font-size:14px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap}'
+'.mw-t{align-self:flex-start;padding:12px 18px;background:rgba(255,255,255,.08);border-radius:16px 16px 16px 4px;display:'+(loading?'flex':'none')+';gap:5px}'
+'.mw-d{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.35);animation:mwB 1.2s infinite}'
+'.mw-d:nth-child(2){animation-delay:.15s}.mw-d:nth-child(3){animation-delay:.3s}'
+'@keyframes mwB{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}'
+'#mw-ia{padding:12px;border-top:1px solid rgba(255,255,255,.06);display:flex;gap:8px;background:#1C1C24}'
+'#mw-i{flex:1;border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:10px 16px;font-size:14px;color:#fff;background:rgba(255,255,255,.04);outline:none;font-family:inherit}'
+'#mw-i:focus{border-color:'+CLR+'}#mw-i::placeholder{color:rgba(255,255,255,.3)}'
+'#mw-s{width:40px;height:40px;border-radius:50%;background:'+CLR+';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center}'
+'#mw-s:hover{opacity:.85}#mw-s:disabled{opacity:.4;cursor:default}#mw-s svg{width:18px;height:18px;fill:rgba(0,0,0,.7)}'
+'#mw-pw{text-align:center;padding:6px;font-size:10px;color:rgba(255,255,255,.2)}'
+'#mw-pw a{color:rgba(255,255,255,.3);text-decoration:none}'
+'@media(max-width:480px){#mw-p{width:100%;max-width:100%;height:100%;max-height:100%;bottom:0;left:0;right:0;border-radius:0}#mw-b{bottom:16px;width:56px;height:56px}}'
+'</style>';
var h=css+'<div id="mw-p"><div id="mw-h"><div id="mw-h-a"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg></div><div style="flex:1"><p id="mw-h-n">'+esc(BOT)+'</p><p id="mw-h-s">Online</p></div><button id="mw-x" onclick="window.__mwT()"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button></div>';
h+='<div id="mw-m">';
for(var i=0;i<msgs.length;i++){var m=msgs[i];h+='<div class="'+(m.role==="agent"?"mw-a":"mw-c")+'">'+esc(m.content)+'</div>';}
h+='<div class="mw-t"><div class="mw-d"></div><div class="mw-d"></div><div class="mw-d"></div></div></div>';
h+='<div id="mw-ia"><input id="mw-i" placeholder="Type a message..." autocomplete="off"/><button id="mw-s" '+(loading?'disabled':'')+' onclick="window.__mwS()"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button></div>';
h+='<div id="mw-pw">Powered by <a href="https://mubyn.com" target="_blank">Mubyn</a></div></div>';
h+='<button id="mw-b" onclick="window.__mwT()">'+(open?'<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>')+'</button>';
host.innerHTML=h;
if(open){var ml=host.querySelector("#mw-m");if(ml)ml.scrollTop=ml.scrollHeight;var inp=host.querySelector("#mw-i");if(inp){inp.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();window.__mwS();}});setTimeout(function(){inp.focus();},100);}}
}
window.__mwT=function(){open=!open;render();};
window.__mwS=function(){var inp=host.querySelector("#mw-i");if(!inp)return;var t=inp.value.trim();if(!t||loading)return;
msgs.push({role:"customer",content:t,ts:Date.now()});loading=true;save();render();
fetch(API+"/api/csa/respond",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({customer_message:t,userId:UID,business_context:"Website visitor via Mubyn widget. Page: "+location.href})})
.then(function(r){return r.json();}).then(function(d){msgs.push({role:"agent",content:d.response||d.message||"Sorry, try again.",ts:Date.now()});loading=false;save();render();})
.catch(function(){msgs.push({role:"agent",content:"Sorry, something went wrong.",ts:Date.now()});loading=false;save();render();});};
render();
try{fetch(API+"/api/widget/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:UID,event:"pageview",url:location.href,ts:Date.now()})}).catch(function(){});}catch(e){}
})();`;

  res.send(widgetJS);
});

// Widget CORS pre-flight
router.options('/csa/respond', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

// Widget analytics event
router.post('/widget/event', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.json({ ok: true });
});

// POST /website/widget/config — Save widget configuration
router.post('/website/widget/config', async (req, res) => {
  try {
    const { userId, primaryColor, position, welcomeMessage, botName } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const settingsFile = path.join(__dirname, `../data/csa-settings-${userId}.json`);
    let settings = await loadJSON(settingsFile, {});
    settings.widget = { primaryColor, position, welcomeMessage, botName, updatedAt: new Date().toISOString() };
    await saveJSON(settingsFile, settings);
    res.json({ ok: true, widget: settings.widget });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /website/widget/:userId — Get embed code + config
router.get('/website/widget/:userId', async (req, res) => {
  const { userId } = req.params;
  const baseUrl = 'https://natural-energy-production-df04.up.railway.app';
  const embedCode = `<!-- Mubyn OS Chat Widget -->\n<script src="${baseUrl}/api/widget.js?id=${userId}" async></script>`;
  let config = {};
  try {
    const settings = await loadJSON(path.join(__dirname, `../data/csa-settings-${userId}.json`), {});
    config = settings.widget || {};
  } catch(e) {}
  res.json({ embedCode, config, widgetUrl: `${baseUrl}/api/widget.js?id=${userId}` });
});

// ═══════════════════════════════════════════════════════════════════
// 🛒 SHOPIFY OAUTH
// ═══════════════════════════════════════════════════════════════════

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || '';
const SHOPIFY_REDIRECT_URI = process.env.SHOPIFY_REDIRECT_URI || 'https://natural-energy-production-df04.up.railway.app/api/integrations/shopify/oauth/callback';
const SHOPIFY_SCOPES = 'read_products,read_orders,read_customers,read_analytics';

// In-memory nonce store (shop → { nonce, userId, createdAt })
const _shopifyOAuthStates = new Map();

// Cleanup stale nonces older than 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of _shopifyOAuthStates) {
    if (now - val.createdAt > 10 * 60 * 1000) _shopifyOAuthStates.delete(key);
  }
}, 60 * 1000);

// GET /integrations/shopify/oauth/install — Generate Shopify OAuth install URL
router.get('/integrations/shopify/oauth/install', (req, res) => {
  try {
    const { shop, userId } = req.query;
    if (!shop) return res.status(400).json({ error: 'shop query parameter is required (e.g., mystore.myshopify.com)' });
    if (!SHOPIFY_CLIENT_ID) return res.status(500).json({ error: 'Shopify OAuth not configured (missing SHOPIFY_CLIENT_ID)' });

    // Normalize shop domain
    const normalizedShop = shop.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9\-]*\.myshopify\.com$/.test(normalizedShop)) {
      return res.status(400).json({ error: 'Invalid shop domain. Must be like: mystore.myshopify.com' });
    }

    // Generate a cryptographic nonce for CSRF protection
    const nonce = crypto.randomBytes(16).toString('hex');
    _shopifyOAuthStates.set(nonce, { shop: normalizedShop, userId: userId || '', createdAt: Date.now() });

    const installUrl = `https://${normalizedShop}/admin/oauth/authorize?client_id=${encodeURIComponent(SHOPIFY_CLIENT_ID)}&scope=${encodeURIComponent(SHOPIFY_SCOPES)}&redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URI)}&state=${nonce}`;

    res.json({ installUrl, shop: normalizedShop, state: nonce });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /integrations/shopify/oauth/callback — Handle Shopify OAuth callback
router.get('/integrations/shopify/oauth/callback', async (req, res) => {
  try {
    const { code, shop, state, hmac } = req.query;

    if (!code || !shop || !state) {
      return res.status(400).send('Missing required OAuth parameters (code, shop, state)');
    }

    // Verify state/nonce
    const storedState = _shopifyOAuthStates.get(state);
    if (!storedState) {
      return res.status(403).send('Invalid or expired OAuth state. Please try connecting again.');
    }
    _shopifyOAuthStates.delete(state);

    // Verify HMAC if provided (Shopify signs the callback)
    if (hmac && SHOPIFY_CLIENT_SECRET) {
      const params = { ...req.query };
      delete params.hmac;
      const sortedKeys = Object.keys(params).sort();
      const message = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
      const generatedHmac = crypto.createHmac('sha256', SHOPIFY_CLIENT_SECRET).update(message).digest('hex');
      if (generatedHmac !== hmac) {
        return res.status(403).send('HMAC verification failed. Request may have been tampered with.');
      }
    }

    const normalizedShop = shop.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();

    // Exchange authorization code for permanent access token
    const tokenResponse = await fetch(`https://${normalizedShop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text().catch(() => '');
      return res.status(400).send(`Token exchange failed: ${tokenResponse.status} ${errText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.status(400).send('No access token received from Shopify');
    }

    // Fetch shop info to store metadata
    let shopData = {};
    try {
      const shopRes = await fetch(`https://${normalizedShop}/admin/api/2024-01/shop.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
      });
      if (shopRes.ok) shopData = await shopRes.json();
    } catch (e) { /* non-fatal */ }

    // Encrypt the access token
    const encKey = Buffer.from((process.env.ENCRYPTION_KEY || 'mubyn-default-encryption-key-32b').padEnd(32, '0').slice(0, 32));
    const cipher = crypto.createCipheriv('aes-256-cbc', encKey, Buffer.alloc(16, 0));
    let encrypted = cipher.update(accessToken, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Determine userId — from the stored state or default
    const userId = storedState.userId || 'default';

    // Save integration data
    const integrationFile = path.join(DATA_DIR, `integrations-shopify-${userId}.json`);
    await saveJSON(integrationFile, {
      storeUrl: normalizedShop,
      accessToken_encrypted: encrypted,
      shopName: shopData.shop?.name || normalizedShop,
      shopDomain: shopData.shop?.domain || normalizedShop,
      shopEmail: shopData.shop?.email || '',
      shopPlan: shopData.shop?.plan_display_name || '',
      currency: shopData.shop?.currency || 'USD',
      connectedAt: new Date().toISOString(),
      connectedVia: 'oauth',
      scope: tokenData.scope || SHOPIFY_SCOPES,
    });

    // Redirect back to the frontend settings page with success
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.mubyn.com';
    res.redirect(`${frontendUrl}/settings?shopify=connected&shop=${encodeURIComponent(shopData.shop?.name || normalizedShop)}`);
  } catch (e) {
    console.error('Shopify OAuth callback error:', e);
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.mubyn.com';
    res.redirect(`${frontendUrl}/settings?shopify=error&message=${encodeURIComponent(e.message || 'OAuth failed')}`);
  }
});

// ═══════════════════════════════════════════════════════════════════
// 🛒 SHOPIFY INTEGRATION
// ═══════════════════════════════════════════════════════════════════

const shopifyFetch = async (storeUrl, accessToken, endpoint) => {
  const url = `https://${storeUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/admin/api/2024-01/${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Shopify API ${res.status}: ${errText}`);
  }
  return res.json();
};

// POST /integrations/shopify/connect — Connect a Shopify store
router.post('/integrations/shopify/connect', async (req, res) => {
  try {
    const { userId, storeUrl, accessToken } = req.body;
    if (!userId || !storeUrl || !accessToken) {
      return res.status(400).json({ error: 'userId, storeUrl, and accessToken are required' });
    }

    // Normalize store URL (strip protocol, trailing slashes)
    const normalizedUrl = storeUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    // Test connection by fetching shop info
    let shopData;
    try {
      shopData = await shopifyFetch(normalizedUrl, accessToken, 'shop.json');
    } catch (e) {
      return res.status(400).json({ error: `Could not connect to Shopify: ${e.message}` });
    }

    // Encrypt the access token before storing
    const cipher = require('crypto').createCipheriv('aes-256-cbc',
      Buffer.from((process.env.ENCRYPTION_KEY || 'mubyn-default-encryption-key-32b').padEnd(32, '0').slice(0, 32)),
      Buffer.alloc(16, 0));
    let encrypted = cipher.update(accessToken, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const integrationFile = path.join(DATA_DIR, `integrations-shopify-${userId}.json`);
    await saveJSON(integrationFile, {
      storeUrl: normalizedUrl,
      accessToken_encrypted: encrypted,
      shopName: shopData.shop?.name || normalizedUrl,
      shopDomain: shopData.shop?.domain || normalizedUrl,
      shopEmail: shopData.shop?.email || '',
      shopPlan: shopData.shop?.plan_display_name || '',
      currency: shopData.shop?.currency || 'USD',
      connectedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      shop: {
        name: shopData.shop?.name,
        domain: shopData.shop?.domain,
        email: shopData.shop?.email,
        plan: shopData.shop?.plan_display_name,
        currency: shopData.shop?.currency,
      },
    });
  } catch (e) {
    console.error('Shopify connect error:', e);
    res.status(500).json({ error: e.message || 'Connection failed' });
  }
});

// GET /integrations/shopify/status/:userId — Check connection status
router.get('/integrations/shopify/status/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const integrationFile = path.join(DATA_DIR, `integrations-shopify-${req.params.userId}.json`);
    const data = await loadJSON(integrationFile, null);
    if (!data) {
      return res.json({ connected: false });
    }
    res.json({
      connected: true,
      shopName: data.shopName,
      shopDomain: data.shopDomain,
      shopEmail: data.shopEmail,
      shopPlan: data.shopPlan,
      currency: data.currency,
      storeUrl: data.storeUrl,
      connectedAt: data.connectedAt,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /integrations/shopify/disconnect/:userId — Disconnect store
router.delete('/integrations/shopify/disconnect/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const integrationFile = path.join(DATA_DIR, `integrations-shopify-${req.params.userId}.json`);
    await storage.unlinkFile(integrationFile);
    res.json({ success: true, message: 'Shopify disconnected' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: decrypt access token and get credentials for a user
async function getShopifyCredentials(userId) {
  const integrationFile = path.join(DATA_DIR, `integrations-shopify-${userId}.json`);
  const data = await loadJSON(integrationFile, null);
  if (!data || !data.accessToken_encrypted) return null;

  const decipher = require('crypto').createDecipheriv('aes-256-cbc',
    Buffer.from((process.env.ENCRYPTION_KEY || 'mubyn-default-encryption-key-32b').padEnd(32, '0').slice(0, 32)),
    Buffer.alloc(16, 0));
  let decrypted = decipher.update(data.accessToken_encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return { storeUrl: data.storeUrl, accessToken: decrypted };
}

// GET /integrations/shopify/products/:userId — Fetch products
router.get('/integrations/shopify/products/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const creds = await getShopifyCredentials(req.params.userId);
    if (!creds) return res.status(400).json({ error: 'Shopify not connected' });

    const data = await shopifyFetch(creds.storeUrl, creds.accessToken, 'products.json?limit=50');

    const products = (data.products || []).map(p => ({
      id: p.id,
      title: p.title,
      image: p.image?.src || (p.images?.[0]?.src) || null,
      price: p.variants?.[0]?.price || '0.00',
      compareAtPrice: p.variants?.[0]?.compare_at_price || null,
      inventory: p.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0) || 0,
      status: p.status,
      vendor: p.vendor,
      productType: p.product_type,
      createdAt: p.created_at,
    }));

    res.json({ products, count: products.length });
  } catch (e) {
    console.error('Shopify products error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /integrations/shopify/orders/:userId — Fetch recent orders
router.get('/integrations/shopify/orders/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const creds = await getShopifyCredentials(req.params.userId);
    if (!creds) return res.status(400).json({ error: 'Shopify not connected' });

    const data = await shopifyFetch(creds.storeUrl, creds.accessToken, 'orders.json?status=any&limit=20');

    const orders = (data.orders || []).map(o => ({
      id: o.id,
      orderNumber: o.order_number || o.name,
      total: o.total_price,
      subtotal: o.subtotal_price,
      currency: o.currency,
      financialStatus: o.financial_status,
      fulfillmentStatus: o.fulfillment_status || 'unfulfilled',
      customerName: o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : 'Guest',
      customerEmail: o.customer?.email || '',
      itemCount: o.line_items?.length || 0,
      createdAt: o.created_at,
    }));

    res.json({ orders, count: orders.length });
  } catch (e) {
    console.error('Shopify orders error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /integrations/shopify/analytics/:userId — Aggregate order analytics
router.get('/integrations/shopify/analytics/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const creds = await getShopifyCredentials(req.params.userId);
    if (!creds) return res.status(400).json({ error: 'Shopify not connected' });

    // Fetch all orders (up to 250)
    const data = await shopifyFetch(creds.storeUrl, creds.accessToken, 'orders.json?status=any&limit=250');
    const orders = data.orders || [];

    // Also fetch product count
    const prodCountData = await shopifyFetch(creds.storeUrl, creds.accessToken, 'products/count.json');
    const productCount = prodCountData.count || 0;

    const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || '0'), 0);
    const orderCount = orders.length;
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

    // Top products by frequency
    const productFreq = {};
    orders.forEach(o => {
      (o.line_items || []).forEach(item => {
        const key = item.title || item.name || 'Unknown';
        if (!productFreq[key]) productFreq[key] = { title: key, count: 0, revenue: 0 };
        productFreq[key].count += item.quantity || 1;
        productFreq[key].revenue += parseFloat(item.price || '0') * (item.quantity || 1);
      });
    });
    const topProducts = Object.values(productFreq)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Revenue by month (last 12 months)
    const revenueByMonth = {};
    orders.forEach(o => {
      const month = (o.created_at || '').slice(0, 7); // YYYY-MM
      if (month) {
        if (!revenueByMonth[month]) revenueByMonth[month] = { month, revenue: 0, orders: 0 };
        revenueByMonth[month].revenue += parseFloat(o.total_price || '0');
        revenueByMonth[month].orders += 1;
      }
    });
    const monthlyRevenue = Object.values(revenueByMonth).sort((a, b) => a.month.localeCompare(b.month));

    // Status breakdown
    const statusBreakdown = {};
    orders.forEach(o => {
      const status = o.financial_status || 'unknown';
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
    });

    const currency = orders[0]?.currency || 'USD';

    res.json({
      totalRevenue: totalRevenue.toFixed(2),
      orderCount,
      avgOrderValue: avgOrderValue.toFixed(2),
      productCount,
      currency,
      topProducts,
      monthlyRevenue,
      statusBreakdown,
    });
  } catch (e) {
    console.error('Shopify analytics error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// 📢 META ADS INTEGRATION
// ═══════════════════════════════════════════════════════════════════

// POST /integrations/meta/connect — Store Meta credentials & verify
router.post('/integrations/meta/connect', async (req, res) => {
  try {
    const { userId, accessToken, adAccountId } = req.body;
    if (!userId || !accessToken || !adAccountId) {
      return res.status(400).json({ error: 'userId, accessToken, and adAccountId required' });
    }

    // Verify token by hitting Graph API
    const verifyRes = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${accessToken}`);
    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      return res.status(401).json({ error: err.error?.message || 'Invalid Meta access token' });
    }
    const metaUser = await verifyRes.json();

    // Normalize adAccountId — ensure it starts with 'act_'
    const normalizedAdAccount = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    // Save credentials
    const metaFile = path.join(DATA_DIR, `integrations-meta-${userId}.json`);
    await saveJSON(metaFile, {
      accessToken,
      adAccountId: normalizedAdAccount,
      metaUserId: metaUser.id,
      metaUserName: metaUser.name,
      connectedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      user: { id: metaUser.id, name: metaUser.name },
      adAccountId: normalizedAdAccount,
    });
  } catch (e) {
    console.error('Meta connect error:', e);
    res.status(500).json({ error: 'Failed to connect Meta Ads' });
  }
});

// GET /integrations/meta/status/:userId — Check connection status
router.get('/integrations/meta/status/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const metaFile = path.join(DATA_DIR, `integrations-meta-${req.params.userId}.json`);
    const data = await loadJSON(metaFile, null);
    if (!data) {
      return res.json({ connected: false });
    }

    // Optionally verify token is still valid
    let tokenValid = true;
    try {
      const check = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${data.accessToken}`);
      tokenValid = check.ok;
    } catch { tokenValid = false; }

    res.json({
      connected: true,
      tokenValid,
      metaUserName: data.metaUserName,
      metaUserId: data.metaUserId,
      adAccountId: data.adAccountId,
      connectedAt: data.connectedAt,
    });
  } catch (e) {
    console.error('Meta status error:', e);
    res.status(500).json({ error: 'Failed to check Meta status' });
  }
});

// DELETE /integrations/meta/disconnect/:userId — Remove credentials
router.delete('/integrations/meta/disconnect/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const metaFile = path.join(DATA_DIR, `integrations-meta-${req.params.userId}.json`);
    await storage.unlinkFile(metaFile);
    res.json({ success: true, message: 'Meta Ads disconnected' });
  } catch (e) {
    console.error('Meta disconnect error:', e);
    res.status(500).json({ error: 'Disconnect failed' });
  }
});

// GET /integrations/meta/campaigns/:userId — List ad campaigns
router.get('/integrations/meta/campaigns/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const data = await loadJSON(path.join(DATA_DIR, `integrations-meta-${req.params.userId}.json`), null);
    if (!data) return res.status(404).json({ error: 'Meta Ads not connected' });

    const url = `https://graph.facebook.com/v19.0/${data.adAccountId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget,insights{spend,impressions,clicks,conversions}&access_token=${data.accessToken}`;
    const fbRes = await fetch(url);
    if (!fbRes.ok) {
      const err = await fbRes.json().catch(() => ({}));
      return res.status(fbRes.status).json({ error: err.error?.message || 'Failed to fetch campaigns' });
    }
    const campaigns = await fbRes.json();
    res.json({ campaigns: campaigns.data || [], paging: campaigns.paging });
  } catch (e) {
    console.error('Meta campaigns error:', e);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// POST /integrations/meta/campaign/create — Create a new campaign
router.post('/integrations/meta/campaign/create', async (req, res) => {
  try {
    const { userId, name, objective, dailyBudget, status: campaignStatus } = req.body;
    if (!userId || !name || !objective) {
      return res.status(400).json({ error: 'userId, name, and objective required' });
    }

    const data = await loadJSON(path.join(DATA_DIR, `integrations-meta-${userId}.json`), null);
    if (!data) return res.status(404).json({ error: 'Meta Ads not connected' });

    // Create campaign via Marketing API
    const params = new URLSearchParams({
      name,
      objective: objective.toUpperCase(),
      status: campaignStatus || 'PAUSED',
      special_ad_categories: '[]',
      access_token: data.accessToken,
    });
    if (dailyBudget) {
      params.set('daily_budget', String(Math.round(dailyBudget * 100))); // Meta expects cents
    }

    const fbRes = await fetch(`https://graph.facebook.com/v19.0/${data.adAccountId}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const result = await fbRes.json();
    if (!fbRes.ok) {
      return res.status(fbRes.status).json({ error: result.error?.message || 'Campaign creation failed' });
    }

    res.json({ success: true, campaignId: result.id, name, objective });
  } catch (e) {
    console.error('Meta campaign create error:', e);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// GET /integrations/meta/insights/:userId — Get aggregate ad performance
router.get('/integrations/meta/insights/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const data = await loadJSON(path.join(DATA_DIR, `integrations-meta-${req.params.userId}.json`), null);
    if (!data) return res.status(404).json({ error: 'Meta Ads not connected' });

    const url = `https://graph.facebook.com/v19.0/${data.adAccountId}/insights?fields=spend,impressions,clicks,ctr,conversions,actions,cost_per_action_type&date_preset=last_30d&access_token=${data.accessToken}`;
    const fbRes = await fetch(url);
    if (!fbRes.ok) {
      const err = await fbRes.json().catch(() => ({}));
      return res.status(fbRes.status).json({ error: err.error?.message || 'Failed to fetch insights' });
    }
    const raw = await fbRes.json();
    const insights = raw.data?.[0] || {};

    // Parse conversions from actions array
    let conversions = 0;
    let revenue = 0;
    if (insights.actions) {
      const purchaseAction = insights.actions.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
      conversions = purchaseAction ? parseInt(purchaseAction.value) : 0;
    }

    const spend = parseFloat(insights.spend || '0');
    const impressions = parseInt(insights.impressions || '0');
    const clicks = parseInt(insights.clicks || '0');
    const ctr = parseFloat(insights.ctr || '0');
    const roas = revenue > 0 && spend > 0 ? (revenue / spend).toFixed(2) : 'N/A';

    res.json({
      period: 'last_30d',
      spend,
      impressions,
      clicks,
      ctr: ctr.toFixed(2),
      conversions,
      roas,
    });
  } catch (e) {
    console.error('Meta insights error:', e);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

// 🔍 GOOGLE ADS INTEGRATION
// ═══════════════════════════════════════════════════════════════════

// Helper: get OAuth2 access token from refresh token
async function getGoogleAccessToken(clientId, clientSecret, refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || 'Failed to refresh Google access token');
  }
  const data = await res.json();
  return data.access_token;
}

// POST /integrations/google-ads/connect — Store Google Ads credentials & verify
router.post('/integrations/google-ads/connect', async (req, res) => {
  try {
    const { userId, developerToken, clientId, clientSecret, refreshToken, customerId } = req.body;
    if (!userId || !developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
      return res.status(400).json({ error: 'userId, developerToken, clientId, clientSecret, refreshToken, and customerId required' });
    }

    // Normalize customerId — remove dashes
    const normalizedCustomerId = customerId.replace(/-/g, '');

    // Get OAuth2 access token
    let accessToken;
    try {
      accessToken = await getGoogleAccessToken(clientId, clientSecret, refreshToken);
    } catch (e) {
      return res.status(401).json({ error: e.message || 'Invalid OAuth credentials' });
    }

    // Verify by hitting Google Ads API
    const verifyRes = await fetch(`https://googleads.googleapis.com/v15/customers/${normalizedCustomerId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
      },
    });

    let accountName = 'Google Ads Account';
    if (verifyRes.ok) {
      const account = await verifyRes.json();
      accountName = account.descriptiveName || accountName;
    } else {
      const err = await verifyRes.json().catch(() => ({}));
      // If 403/401, credentials are bad; otherwise might just be permission issue
      if (verifyRes.status === 401 || verifyRes.status === 403) {
        return res.status(verifyRes.status).json({ error: err.error?.message || 'Invalid Google Ads credentials or permissions' });
      }
      // For other errors, still save but note the issue
    }

    // Save credentials
    const gaFile = path.join(DATA_DIR, `integrations-google-ads-${userId}.json`);
    await saveJSON(gaFile, {
      developerToken,
      clientId,
      clientSecret,
      refreshToken,
      customerId: normalizedCustomerId,
      accountName,
      connectedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      accountName,
      customerId: normalizedCustomerId,
    });
  } catch (e) {
    console.error('Google Ads connect error:', e);
    res.status(500).json({ error: 'Failed to connect Google Ads' });
  }
});

// GET /integrations/google-ads/status/:userId — Check connection status
router.get('/integrations/google-ads/status/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const gaFile = path.join(DATA_DIR, `integrations-google-ads-${req.params.userId}.json`);
    const data = await loadJSON(gaFile, null);
    if (!data) {
      return res.json({ connected: false });
    }

    // Optionally verify token is still refreshable
    let tokenValid = true;
    try {
      await getGoogleAccessToken(data.clientId, data.clientSecret, data.refreshToken);
    } catch { tokenValid = false; }

    res.json({
      connected: true,
      tokenValid,
      accountName: data.accountName,
      customerId: data.customerId,
      connectedAt: data.connectedAt,
    });
  } catch (e) {
    console.error('Google Ads status error:', e);
    res.status(500).json({ error: 'Failed to check Google Ads status' });
  }
});

// DELETE /integrations/google-ads/disconnect/:userId — Remove credentials
router.delete('/integrations/google-ads/disconnect/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const gaFile = path.join(DATA_DIR, `integrations-google-ads-${req.params.userId}.json`);
    await storage.unlinkFile(gaFile);
    res.json({ success: true, message: 'Google Ads disconnected' });
  } catch (e) {
    console.error('Google Ads disconnect error:', e);
    res.status(500).json({ error: 'Disconnect failed' });
  }
});

// GET /integrations/google-ads/campaigns/:userId — List ad campaigns
router.get('/integrations/google-ads/campaigns/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const data = await loadJSON(path.join(DATA_DIR, `integrations-google-ads-${req.params.userId}.json`), null);
    if (!data) return res.status(404).json({ error: 'Google Ads not connected' });

    let accessToken;
    try {
      accessToken = await getGoogleAccessToken(data.clientId, data.clientSecret, data.refreshToken);
    } catch (e) {
      return res.status(401).json({ error: 'Token refresh failed — reconnect Google Ads' });
    }

    // Use Google Ads Query Language (GAQL)
    const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.campaign_budget, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 50`;

    const gaRes = await fetch(`https://googleads.googleapis.com/v15/customers/${data.customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': data.developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!gaRes.ok) {
      const err = await gaRes.json().catch(() => ({}));
      return res.status(gaRes.status).json({ error: err.error?.message || 'Failed to fetch campaigns' });
    }

    const raw = await gaRes.json();
    // searchStream returns array of batches
    const results = (raw[0]?.results || raw.results || []);
    const campaigns = results.map(r => ({
      id: r.campaign?.id,
      name: r.campaign?.name,
      status: r.campaign?.status,
      budget: r.campaign?.campaignBudget,
      spend: r.metrics?.costMicros ? (parseInt(r.metrics.costMicros) / 1_000_000).toFixed(2) : '0.00',
      impressions: parseInt(r.metrics?.impressions || '0'),
      clicks: parseInt(r.metrics?.clicks || '0'),
      conversions: parseFloat(r.metrics?.conversions || '0'),
    }));

    res.json({ campaigns });
  } catch (e) {
    console.error('Google Ads campaigns error:', e);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// GET /integrations/google-ads/insights/:userId — Get aggregate performance
router.get('/integrations/google-ads/insights/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const data = await loadJSON(path.join(DATA_DIR, `integrations-google-ads-${req.params.userId}.json`), null);
    if (!data) return res.status(404).json({ error: 'Google Ads not connected' });

    let accessToken;
    try {
      accessToken = await getGoogleAccessToken(data.clientId, data.clientSecret, data.refreshToken);
    } catch (e) {
      return res.status(401).json({ error: 'Token refresh failed — reconnect Google Ads' });
    }

    // Aggregate metrics for last 30 days
    const query = `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_per_conversion FROM customer WHERE segments.date DURING LAST_30_DAYS`;

    const gaRes = await fetch(`https://googleads.googleapis.com/v15/customers/${data.customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': data.developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!gaRes.ok) {
      const err = await gaRes.json().catch(() => ({}));
      return res.status(gaRes.status).json({ error: err.error?.message || 'Failed to fetch insights' });
    }

    const raw = await gaRes.json();
    const results = (raw[0]?.results || raw.results || []);

    // Aggregate across all rows (each row is a day)
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0, totalCostPerConversion = 0;
    let rowCount = 0;

    for (const r of results) {
      totalSpend += parseInt(r.metrics?.costMicros || '0');
      totalImpressions += parseInt(r.metrics?.impressions || '0');
      totalClicks += parseInt(r.metrics?.clicks || '0');
      totalConversions += parseFloat(r.metrics?.conversions || '0');
      if (r.metrics?.costPerConversion) {
        totalCostPerConversion += parseFloat(r.metrics.costPerConversion);
        rowCount++;
      }
    }

    const spend = (totalSpend / 1_000_000);
    const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';
    const avgCostPerConversion = rowCount > 0 ? (totalCostPerConversion / rowCount).toFixed(2) : (totalConversions > 0 ? (spend / totalConversions).toFixed(2) : '0.00');

    res.json({
      period: 'last_30d',
      spend: parseFloat(spend.toFixed(2)),
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr,
      conversions: parseFloat(totalConversions.toFixed(1)),
      costPerConversion: parseFloat(avgCostPerConversion),
    });
  } catch (e) {
    console.error('Google Ads insights error:', e);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});


// ═══════════════════════════════════════════════════════════════════
// 📧 Google OAuth for Email (IMAP/SMTP via XOAUTH2)
// ═══════════════════════════════════════════════════════════════════

const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const GOOGLE_OAUTH_REDIRECT = process.env.GOOGLE_OAUTH_REDIRECT || 'https://natural-energy-production-df04.up.railway.app/api/csa/email/oauth/google/callback';

const GOOGLE_OAUTH_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/userinfo.email',
];

// Helper: exchange code for tokens
async function googleExchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: GOOGLE_OAUTH_REDIRECT,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || 'Token exchange failed');
  }
  return res.json();
}

// Helper: refresh access token
async function googleRefreshToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || 'Token refresh failed');
  }
  return res.json();
}

// Helper: get user email from Google
async function googleGetUserEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to get user info');
  const data = await res.json();
  return data.email;
}

// Helper: generate XOAUTH2 token string for IMAP/SMTP
function buildXOAuth2Token(email, accessToken) {
  return Buffer.from(`user=${email}\x01auth=Bearer ${accessToken}\x01\x01`).toString('base64');
}

// ── GET /csa/email/oauth/google/url — Generate Google OAuth URL ──
router.get('/csa/email/oauth/google/url', (req, res) => {
  try {
    if (!GOOGLE_OAUTH_CLIENT_ID) {
      return res.status(500).json({ error: 'Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID env var.' });
    }
    const state = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64url');
    const params = new URLSearchParams({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: GOOGLE_OAUTH_REDIRECT,
      response_type: 'code',
      scope: GOOGLE_OAUTH_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({ url });
  } catch (e) {
    console.error('Google OAuth URL error:', e);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

// ── GET /csa/email/oauth/google/callback — Handle OAuth callback ──
router.get('/csa/email/oauth/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      console.error('Google OAuth error:', error);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/?oauth_error=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/?oauth_error=missing_code`);
    }

    // Decode state to get userId
    let userId;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
      userId = decoded.userId;
    } catch {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/?oauth_error=invalid_state`);
    }

    // Exchange code for tokens
    const tokens = await googleExchangeCode(code);
    console.log(`✅ Google OAuth tokens received for user ${userId}`);

    // Get the user's email address
    const email = await googleGetUserEmail(tokens.access_token);
    console.log(`✅ Google OAuth email: ${email}`);

    // Store OAuth credentials (encrypted)
    const emailChannelFile = path.join(DATA_DIR, `csa-email-${userId}.json`);
    const channelData = {
      id: crypto.randomUUID(),
      userId,
      email,
      provider: 'google_oauth',
      imap_host: 'imap.gmail.com',
      imap_port: 993,
      smtp_host: 'smtp.gmail.com',
      smtp_port: 587,
      oauth: {
        provider: 'google',
        access_token_encrypted: encryptCredential(tokens.access_token),
        refresh_token_encrypted: encryptCredential(tokens.refresh_token),
        token_expiry: tokens.expires_in ? Date.now() + (tokens.expires_in * 1000) : null,
        scope: tokens.scope,
      },
      is_active: true,
      last_poll_at: null,
      last_message_uid: null,
      connected_at: new Date().toISOString(),
    };
    await saveJSON(emailChannelFile, channelData);

    console.log(`📧 Google OAuth email connected: ${email} for user ${userId}`);
    // Redirect to frontend with success
    res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/?oauth_success=google&oauth_email=${encodeURIComponent(email)}`);
  } catch (e) {
    console.error('Google OAuth callback error:', e);
    res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/?oauth_error=${encodeURIComponent(e.message)}`);
  }
});

// ── GET /csa/email/oauth/status/:userId — Check if OAuth email is connected ──
router.get('/csa/email/oauth/status/:userId', async (req, res) => {
  try {
    if (req.user && req.user.id !== req.params.userId) return res.status(403).json({ error: 'Access denied' });
    const channelFile = path.join(DATA_DIR, `csa-email-${req.params.userId}.json`);
    const channel = await loadJSON(channelFile, null);
    if (!channel || !channel.is_active) return res.json({ connected: false });
    if (channel.oauth && channel.oauth.provider === 'google') {
      return res.json({
        connected: true,
        provider: 'google',
        email: channel.email,
        connected_at: channel.connected_at,
        last_poll_at: channel.last_poll_at,
      });
    }
    // Not OAuth — regular IMAP/SMTP
    return res.json({ connected: false, manual_connected: true, email: channel.email });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// Helper: get a valid access token for Google OAuth (auto-refresh if expired)
async function getGoogleAccessToken(channel) {
  if (!channel.oauth || channel.oauth.provider !== 'google') return null;

  const refreshToken = decryptCredential(channel.oauth.refresh_token_encrypted);
  const tokenExpiry = channel.oauth.token_expiry || 0;

  // If token is still valid (with 5 min buffer), use it
  if (tokenExpiry > Date.now() + 300000) {
    return decryptCredential(channel.oauth.access_token_encrypted);
  }

  // Refresh the token
  console.log(`🔄 Refreshing Google OAuth token for ${channel.email}...`);
  const tokens = await googleRefreshToken(refreshToken);

  // Update stored tokens
  channel.oauth.access_token_encrypted = encryptCredential(tokens.access_token);
  channel.oauth.token_expiry = Date.now() + (tokens.expires_in * 1000);
  if (tokens.refresh_token) {
    channel.oauth.refresh_token_encrypted = encryptCredential(tokens.refresh_token);
  }

  // Save updated channel data
  const channelFile = path.join(DATA_DIR, `csa-email-${channel.userId}.json`);
  await saveJSON(channelFile, channel);

  return tokens.access_token;
}

// ═══════════════════════════════════════════════════════════════════
// 🔐 META ADS OAUTH FLOW
// ═══════════════════════════════════════════════════════════════════

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || 'https://natural-energy-production-df04.up.railway.app/api/integrations/meta/oauth/callback';

// GET /integrations/meta/oauth/url — Returns Meta OAuth authorization URL
router.get('/integrations/meta/oauth/url', (req, res) => {
  try {
    if (!META_APP_ID) {
      return res.status(500).json({ error: 'META_APP_ID not configured' });
    }
    const state = crypto.randomUUID();
    const scopes = 'ads_management,ads_read,business_management,pages_read_engagement';
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&scope=${encodeURIComponent(scopes)}&state=${state}&response_type=code`;
    res.json({ url: authUrl, state });
  } catch (e) {
    console.error('Meta OAuth URL error:', e);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

// GET /integrations/meta/oauth/callback — Handles OAuth callback, stores access token
router.get('/integrations/meta/oauth/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;
    if (oauthError) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/settings?meta_error=${encodeURIComponent(error_description || oauthError)}`);
    }
    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/settings?meta_error=${encodeURIComponent('No authorization code received')}`);
    }

    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${code}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}`;
    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      return res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/settings?meta_error=${encodeURIComponent(err.error?.message || 'Token exchange failed')}`);
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Fetch user info
    const meRes = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${accessToken}`);
    const meData = meRes.ok ? await meRes.json() : { id: 'unknown', name: 'Unknown' };

    // Fetch ad accounts
    const adAccountsRes = await fetch(`https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status,currency,timezone_name&access_token=${accessToken}`);
    let adAccounts = [];
    let primaryAdAccountId = '';
    if (adAccountsRes.ok) {
      const adData = await adAccountsRes.json();
      adAccounts = (adData.data || []).map(a => ({ id: a.id, name: a.name, status: a.account_status, currency: a.currency, timezone: a.timezone_name }));
      if (adAccounts.length > 0) {
        primaryAdAccountId = adAccounts[0].id;
      }
    }

    // Store as a temporary OAuth result (frontend will pick it up)
    const oauthResultFile = path.join(DATA_DIR, `meta-oauth-result-${state || 'latest'}.json`);
    await saveJSON(oauthResultFile, {
      accessToken,
      metaUserId: meData.id,
      metaUserName: meData.name,
      adAccounts,
      primaryAdAccountId,
      completedAt: new Date().toISOString(),
    });

    // Redirect to frontend with success
    const params = new URLSearchParams({
      meta_oauth: 'success',
      meta_state: state || 'latest',
      meta_user: meData.name || '',
      meta_ad_accounts: String(adAccounts.length),
      meta_primary_account: primaryAdAccountId,
    });
    res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/settings?${params.toString()}`);
  } catch (e) {
    console.error('Meta OAuth callback error:', e);
    res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/settings?meta_error=${encodeURIComponent('OAuth callback failed: ' + e.message)}`);
  }
});

// POST /integrations/meta/oauth/complete — Frontend calls this to finalize OAuth connection for a user
router.post('/integrations/meta/oauth/complete', async (req, res) => {
  try {
    const { userId, state, adAccountId } = req.body;
    if (!userId || !state) return res.status(400).json({ error: 'userId and state required' });

    const oauthResultFile = path.join(DATA_DIR, `meta-oauth-result-${state}.json`);
    const oauthResult = await loadJSON(oauthResultFile, null);
    if (!oauthResult) return res.status(404).json({ error: 'OAuth session not found or expired' });

    const selectedAdAccount = adAccountId || oauthResult.primaryAdAccountId;

    // Save to user's meta integration file
    const metaFile = path.join(DATA_DIR, `integrations-meta-${userId}.json`);
    await saveJSON(metaFile, {
      accessToken: oauthResult.accessToken,
      adAccountId: selectedAdAccount,
      metaUserId: oauthResult.metaUserId,
      metaUserName: oauthResult.metaUserName,
      adAccounts: oauthResult.adAccounts,
      connectedAt: new Date().toISOString(),
      connectedVia: 'oauth',
    });

    // Clean up OAuth result file
    await storage.unlinkFile(oauthResultFile);

    res.json({
      success: true,
      user: { id: oauthResult.metaUserId, name: oauthResult.metaUserName },
      adAccountId: selectedAdAccount,
      adAccounts: oauthResult.adAccounts,
    });
  } catch (e) {
    console.error('Meta OAuth complete error:', e);
    res.status(500).json({ error: 'Failed to complete OAuth connection' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// 🔐 GOOGLE ADS OAUTH FLOW
// ═══════════════════════════════════════════════════════════════════

const GOOGLE_ADS_OAUTH_CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID || '';
const GOOGLE_ADS_OAUTH_CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET || '';
const GOOGLE_ADS_REDIRECT_URI = process.env.GOOGLE_ADS_REDIRECT_URI || 'https://natural-energy-production-df04.up.railway.app/api/integrations/google-ads/oauth/callback';

// GET /integrations/google-ads/oauth/url — Returns Google OAuth URL
router.get('/integrations/google-ads/oauth/url', (req, res) => {
  try {
    if (!GOOGLE_ADS_OAUTH_CLIENT_ID) {
      return res.status(500).json({ error: 'GOOGLE_ADS_CLIENT_ID not configured' });
    }
    const state = crypto.randomUUID();
    const scope = 'https://www.googleapis.com/auth/adwords';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(GOOGLE_ADS_OAUTH_CLIENT_ID)}&redirect_uri=${encodeURIComponent(GOOGLE_ADS_REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&response_type=code&access_type=offline&prompt=consent&state=${state}`;
    res.json({ url: authUrl, state });
  } catch (e) {
    console.error('Google Ads OAuth URL error:', e);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

// GET /integrations/google-ads/oauth/callback — Handles OAuth callback
router.get('/integrations/google-ads/oauth/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;
    if (oauthError) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/settings?google_error=${encodeURIComponent(oauthError)}`);
    }
    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/settings?google_error=${encodeURIComponent('No authorization code received')}`);
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_ADS_OAUTH_CLIENT_ID,
        client_secret: GOOGLE_ADS_OAUTH_CLIENT_SECRET,
        redirect_uri: GOOGLE_ADS_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      return res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/settings?google_error=${encodeURIComponent(err.error_description || 'Token exchange failed')}`);
    }
    const tokenData = await tokenRes.json();

    // Store OAuth result for frontend to pick up
    const oauthResultFile = path.join(DATA_DIR, `google-ads-oauth-result-${state || 'latest'}.json`);
    await saveJSON(oauthResultFile, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
      completedAt: new Date().toISOString(),
    });

    const params = new URLSearchParams({
      google_oauth: 'success',
      google_state: state || 'latest',
    });
    res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/settings?${params.toString()}`);
  } catch (e) {
    console.error('Google Ads OAuth callback error:', e);
    res.redirect(`${process.env.FRONTEND_URL || 'https://app.mubyn.com'}/settings?google_error=${encodeURIComponent('OAuth callback failed: ' + e.message)}`);
  }
});

// POST /integrations/google-ads/oauth/complete — Frontend calls this to finalize OAuth connection
router.post('/integrations/google-ads/oauth/complete', async (req, res) => {
  try {
    const { userId, state, customerId, developerToken } = req.body;
    if (!userId || !state) return res.status(400).json({ error: 'userId and state required' });

    const oauthResultFile = path.join(DATA_DIR, `google-ads-oauth-result-${state}.json`);
    const oauthResult = await loadJSON(oauthResultFile, null);
    if (!oauthResult) return res.status(404).json({ error: 'OAuth session not found or expired' });

    // Save to user's Google Ads integration file
    const gaFile = path.join(DATA_DIR, `integrations-google-ads-${userId}.json`);
    const normalizedCustomerId = (customerId || '').replace(/-/g, '');
    await saveJSON(gaFile, {
      clientId: GOOGLE_ADS_OAUTH_CLIENT_ID,
      clientSecret: GOOGLE_ADS_OAUTH_CLIENT_SECRET,
      refreshToken: oauthResult.refreshToken,
      developerToken: developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
      customerId: normalizedCustomerId,
      connectedAt: new Date().toISOString(),
      connectedVia: 'oauth',
    });

    // Clean up OAuth result file
    await storage.unlinkFile(oauthResultFile);

    res.json({
      success: true,
      accountName: 'Google Ads Account',
      customerId: normalizedCustomerId,
    });
  } catch (e) {
    console.error('Google Ads OAuth complete error:', e);
    res.status(500).json({ error: 'Failed to complete OAuth connection' });
  }
});

// Version check endpoint for debugging Railway deployments
router.get('/version', (req, res) => {
  res.json({ version: '2.5.0-multitenant', timestamp: '2026-02-11T21:45:00Z', features: ['shopify', 'meta', 'meta-oauth', 'google-ads', 'google-ads-oauth', 'whatsapp', 'google-oauth-email', 'postgresql', 'jwt-all-routes', 'ownership-enforcement'], storageMode: storage.usePg() ? 'postgresql' : 'json' });
});

module.exports = router;
