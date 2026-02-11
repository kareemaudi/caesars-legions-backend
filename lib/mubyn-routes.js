// Mubyn OS API Routes — mounted in dashboard-server.js
const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mubyn-demo-secret-2026';
const APOLLO_API_KEY = process.env.APOLLO_API_KEY || 'vndGs9TB42TIG7zcdO6zVQ';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATA_DIR = path.join(__dirname, '..', 'data');

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

// CHAT
router.post('/chat', async (req, res) => {
  try {
    const { message, userId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const systemPrompt = `You are Caesar (قيصر), an AI CEO running the client's business via Mubyn OS. You help with leads, content, customer service, and financials. Be professional, personable, bilingual (Arabic/English). Keep responses concise and actionable. Use markdown formatting.`;
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

// LEADS
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

router.get('/leads/:userId', async (req, res) => {
  try { res.json({ leads: await loadJSON(path.join(DATA_DIR, `leads-${req.params.userId}.json`), []) }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
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

// CSA
router.post('/csa/respond', async (req, res) => {
  try {
    const { customer_message, business_context, userId } = req.body;
    if (!customer_message) return res.status(400).json({ error: 'Message required' });
    const reply = await openaiChat(`You are a professional customer support agent. ${business_context || 'Help the customer.'} Be empathetic and solution-oriented.`, customer_message, 512);
    if (userId) { const f = path.join(DATA_DIR, `csa-${userId}.json`); const c = await loadJSON(f, []); c.push({ id: crypto.randomUUID(), customer_message, ai_response: reply, business_context: business_context || '', timestamp: new Date().toISOString() }); await saveJSON(f, c); }
    res.json({ response: reply });
  } catch (e) { console.error('CSA error:', e); res.status(500).json({ error: 'CSA failed', details: e.message }); }
});

router.get('/csa/conversations/:userId', async (req, res) => {
  try { res.json({ conversations: await loadJSON(path.join(DATA_DIR, `csa-${req.params.userId}.json`), []) }); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
