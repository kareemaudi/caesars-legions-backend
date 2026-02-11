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

// LEAD GENERATION — Uses GPT-4o to find REAL businesses
router.post('/leads/generate', async (req, res) => {
  try {
    const { industry, country, city, count, userId } = req.body;
    if (!industry || !city) return res.status(400).json({ error: 'Industry and city are required' });
    const numLeads = Math.min(Math.max(parseInt(count) || 10, 1), 50);
    const location = city + (country ? `, ${country}` : '');

    const systemPrompt = `You are a business research assistant. Your job is to provide information about REAL businesses that exist in specific locations. You must return accurate, verifiable business information.

IMPORTANT RULES:
- Return businesses that are REAL and currently operating
- Include actual business names that can be verified on Google Maps
- For email, provide the most likely pattern (e.g., info@domain.com, contact@domain.com) based on their website
- For phone numbers, use the correct country code and local format
- Include their actual Google Maps rating if well-known, or estimate 3.5-4.5 for smaller businesses
- For the contact person, provide the owner/manager name if publicly known, otherwise use a realistic name with the title "Manager" or "Owner"
- Website URLs should be real domains when possible

Return ONLY a valid JSON array with NO markdown formatting, NO code blocks, NO explanation. Just the raw JSON array.

Each object must have exactly these fields:
{
  "businessName": "string",
  "contactName": "string",
  "contactTitle": "string",
  "email": "string",
  "phone": "string",
  "website": "string",
  "address": "string",
  "googleRating": number,
  "industry": "string",
  "description": "string"
}`;

    const userMessage = `Find ${numLeads} real ${industry} businesses in ${location}. These should be actual businesses that someone could verify by searching on Google Maps or Google Search. Include a mix of well-known and smaller local businesses. Make sure phone numbers have the correct country code for ${country || city}.`;

    const rawResponse = await openaiChat(systemPrompt, userMessage, numLeads * 300);

    // Parse the response
    let businesses = [];
    try {
      // Try direct parse
      businesses = JSON.parse(rawResponse);
    } catch {
      // Try to extract JSON array from response
      const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        businesses = JSON.parse(jsonMatch[0]);
      }
    }

    if (!Array.isArray(businesses) || businesses.length === 0) {
      return res.status(500).json({ error: 'Failed to parse lead results from AI' });
    }

    // Normalize and enrich leads
    const leads = businesses.map(b => ({
      id: crypto.randomUUID(),
      businessName: b.businessName || b.business_name || b.name || 'Unknown',
      contactName: b.contactName || b.contact_name || b.owner || 'N/A',
      contactTitle: b.contactTitle || b.contact_title || b.title || 'Manager',
      email: b.email || 'N/A',
      phone: b.phone || 'N/A',
      website: b.website || 'N/A',
      address: b.address || b.location || location,
      googleRating: parseFloat(b.googleRating || b.google_rating || b.rating) || 4.0,
      industry: b.industry || industry,
      description: b.description || '',
      location: location,
      country: country || '',
      city: city || '',
      status: 'new',
      source: 'ai-generated',
      notes: '',
      emailDraft: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    // Store leads
    const uid = userId || 'anonymous';
    const leadsFile = path.join(DATA_DIR, `leads-${uid}.json`);
    const existingLeads = await loadJSON(leadsFile, []);
    const allLeads = [...leads, ...existingLeads];
    await saveJSON(leadsFile, allLeads);

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

// UPDATE LEAD STATUS
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

// GENERATE EMAIL DRAFT for a lead
router.post('/leads/:userId/:leadId/email-draft', async (req, res) => {
  try {
    const { userId, leadId } = req.params;
    const { businessContext, objective } = req.body;
    const leadsFile = path.join(DATA_DIR, `leads-${userId}.json`);
    const leads = await loadJSON(leadsFile, []);
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const systemPrompt = `You are an expert cold email copywriter for B2B sales. Write personalized, high-converting cold emails.

Rules:
- Keep it under 150 words
- Personalize based on the recipient's business and industry
- Lead with value, not a pitch
- Include a clear but low-pressure CTA
- Sound human, not robotic
- No generic "I hope this email finds you well" openings

Return a JSON object with exactly: { "subject": "string", "body": "string", "followUp1": "string", "followUp2": "string" }
- subject: email subject line
- body: the main email body (use \\n for line breaks)
- followUp1: a short follow-up email (3-4 sentences) to send 3 days later
- followUp2: a final follow-up (2-3 sentences) to send 7 days later

Return ONLY the JSON object, no markdown.`;

    const userMessage = `Write a cold outreach email to:
- Business: ${lead.businessName}
- Contact: ${lead.contactName} (${lead.contactTitle})
- Industry: ${lead.industry}
- Location: ${lead.address}
- Website: ${lead.website}

${businessContext ? `My business context: ${businessContext}` : ''}
${objective ? `Campaign objective: ${objective}` : 'I want to offer my services and book a meeting.'}`;

    const rawResponse = await openaiChat(systemPrompt, userMessage, 1024);
    let emailData;
    try {
      emailData = JSON.parse(rawResponse);
    } catch {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) emailData = JSON.parse(jsonMatch[0]);
      else throw new Error('Could not parse email draft');
    }

    // Update lead with email draft
    const idx = leads.findIndex(l => l.id === leadId);
    leads[idx].emailDraft = emailData;
    leads[idx].updatedAt = new Date().toISOString();
    await saveJSON(leadsFile, leads);

    res.json({ success: true, email: emailData });
  } catch (e) {
    console.error('Email draft error:', e);
    res.status(500).json({ error: 'Email draft generation failed', details: e.message });
  }
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
