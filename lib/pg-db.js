// PostgreSQL Database Layer for Mubyn OS
// Uses DATABASE_URL env var (auto-set by Railway PostgreSQL addon)
// Falls back gracefully — if no DATABASE_URL, isConnected() returns false

const { Pool } = require('pg');

let pool = null;
let _connected = false;
let _initPromise = null;

const SCHEMA = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  business_name TEXT,
  industry TEXT,
  country TEXT,
  website TEXT,
  description TEXT,
  logo_url TEXT,
  primary_need TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User settings (business info + extra fields)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  business_name TEXT,
  industry TEXT,
  description TEXT,
  website TEXT,
  country TEXT,
  logo TEXT,
  logo_file TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SMTP settings
CREATE TABLE IF NOT EXISTS smtp_settings (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  password_encrypted TEXT,
  host TEXT,
  port INTEGER DEFAULT 587,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);

-- CFO Data
CREATE TABLE IF NOT EXISTS cfo_data (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CFO Transactions
CREATE TABLE IF NOT EXISTS cfo_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cfo_transactions_user_id ON cfo_transactions(user_id);

-- Content Calendar
CREATE TABLE IF NOT EXISTS content_posts (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations (Caesar chat)
CREATE TABLE IF NOT EXISTS conversations (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CSA Settings
CREATE TABLE IF NOT EXISTS csa_settings (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge Base
CREATE TABLE IF NOT EXISTS csa_knowledge (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CSA Conversations
CREATE TABLE IF NOT EXISTS csa_conversations (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CSA Email Channel
CREATE TABLE IF NOT EXISTS csa_email_channel (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CSA Email Conversations
CREATE TABLE IF NOT EXISTS csa_email_conversations (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CSA Email Processed IDs
CREATE TABLE IF NOT EXISTS csa_email_processed (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CSA Telegram Channel
CREATE TABLE IF NOT EXISTS csa_telegram_channel (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CSA Telegram Conversations
CREATE TABLE IF NOT EXISTS csa_telegram_conversations (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CSA WhatsApp Channel
CREATE TABLE IF NOT EXISTS csa_whatsapp_channel (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CSA WhatsApp Conversations
CREATE TABLE IF NOT EXISTS csa_whatsapp_conversations (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Integrations (Shopify, Meta, Google Ads)
CREATE TABLE IF NOT EXISTS integrations (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, provider)
);

-- Websites
CREATE TABLE IF NOT EXISTS websites (
  user_id TEXT PRIMARY KEY,
  html TEXT,
  meta JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Website subdomain mapping
CREATE TABLE IF NOT EXISTS subdomain_map (
  subdomain TEXT PRIMARY KEY,
  user_id TEXT NOT NULL
);

-- Logos (store as base64 or reference)
CREATE TABLE IF NOT EXISTS logos (
  user_id TEXT PRIMARY KEY,
  filename TEXT,
  data BYTEA,
  content_type TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Password resets
CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Send logs
CREATE TABLE IF NOT EXISTS send_logs (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_send_logs_user_id ON send_logs(user_id);

-- Generic KV store for misc JSON files
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

async function initialize() {
  if (!process.env.DATABASE_URL) {
    console.log('⚠️ DATABASE_URL not set — using JSON file storage');
    return false;
  }

  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Test connection
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();

    // Run schema
    await pool.query(SCHEMA);

    _connected = true;
    console.log('✅ PostgreSQL connected and schema initialized');
    return true;
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    console.log('⚠️ Falling back to JSON file storage');
    pool = null;
    _connected = false;
    return false;
  }
}

function isConnected() {
  return _connected && pool !== null;
}

// Ensure init runs once
function ensureInit() {
  if (!_initPromise) {
    _initPromise = initialize();
  }
  return _initPromise;
}

// Raw query
async function query(sql, params = []) {
  if (!isConnected()) throw new Error('PostgreSQL not connected');
  const result = await pool.query(sql, params);
  return result;
}

// ─── JSONB Document Helpers ────────────────────────────────────────
// These map 1:1 with the JSON file patterns in mubyn-routes.js
// Each "file" becomes a row in a table, keyed by user_id

// Generic: load a JSONB document (like loadJSON)
async function loadDoc(table, userId, defaultVal = null) {
  try {
    const result = await pool.query(
      `SELECT data FROM ${table} WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) return defaultVal;
    return result.rows[0].data;
  } catch (err) {
    console.error(`PG loadDoc(${table}, ${userId}) error:`, err.message);
    return defaultVal;
  }
}

// Generic: save a JSONB document (like saveJSON)
async function saveDoc(table, userId, data) {
  try {
    await pool.query(
      `INSERT INTO ${table} (user_id, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [userId, JSON.stringify(data)]
    );
    return true;
  } catch (err) {
    console.error(`PG saveDoc(${table}, ${userId}) error:`, err.message);
    return false;
  }
}

// ─── Users ─────────────────────────────────────────────────────────

async function loadUsers() {
  const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  return result.rows.map(r => ({
    id: r.id,
    email: r.email,
    password: r.password,
    name: r.name,
    business_name: r.business_name,
    industry: r.industry,
    country: r.country,
    website: r.website,
    description: r.description,
    logo_url: r.logo_url,
    primary_need: r.primary_need,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

async function saveUsers(users) {
  // Upsert all users
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, email, password, name, business_name, industry, country, website, description, logo_url, primary_need, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email, password = EXCLUDED.password, name = EXCLUDED.name,
           business_name = EXCLUDED.business_name, industry = EXCLUDED.industry,
           country = EXCLUDED.country, website = EXCLUDED.website,
           description = EXCLUDED.description, logo_url = EXCLUDED.logo_url,
           primary_need = EXCLUDED.primary_need, updated_at = NOW()`,
        [u.id, u.email, u.password, u.name, u.business_name || '', u.industry || '',
         u.country || '', u.website || '', u.description || '', u.logo_url || '',
         u.primary_need || '', u.created_at || new Date().toISOString()]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function findUserByEmail(email) {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function upsertUser(user) {
  await pool.query(
    `INSERT INTO users (id, email, password, name, business_name, industry, country, website, description, logo_url, primary_need, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email, password = EXCLUDED.password, name = EXCLUDED.name,
       business_name = EXCLUDED.business_name, industry = EXCLUDED.industry,
       country = EXCLUDED.country, website = EXCLUDED.website,
       description = EXCLUDED.description, logo_url = EXCLUDED.logo_url,
       primary_need = EXCLUDED.primary_need, updated_at = NOW()`,
    [user.id, user.email, user.password, user.name || '', user.business_name || '',
     user.industry || '', user.country || '', user.website || '',
     user.description || '', user.logo_url || '', user.primary_need || '',
     user.created_at || new Date().toISOString()]
  );
}

// ─── User Settings (business info) ────────────────────────────────

async function loadUserSettings(userId) {
  return await loadDoc('user_settings', userId, {});
}

async function saveUserSettings(userId, data) {
  return await saveDoc('user_settings', userId, data);
}

// ─── SMTP Settings ─────────────────────────────────────────────────

async function loadSmtpSettings(userId) {
  const result = await pool.query('SELECT * FROM smtp_settings WHERE user_id = $1', [userId]);
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return { email: r.email, password_encrypted: r.password_encrypted, host: r.host, port: r.port, updatedAt: r.updated_at };
}

async function saveSmtpSettings(userId, data) {
  await pool.query(
    `INSERT INTO smtp_settings (user_id, email, password_encrypted, host, port, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       email = $2, password_encrypted = $3, host = $4, port = $5, updated_at = NOW()`,
    [userId, data.email, data.password_encrypted, data.host, data.port || 587]
  );
}

// ─── Leads (array per user, stored as JSONB) ──────────────────────

async function loadLeads(userId) {
  return await loadDoc('leads', userId, []);
}

async function saveLeads(userId, leads) {
  return await saveDoc('leads', userId, leads);
}

// ─── Campaigns ────────────────────────────────────────────────────

async function loadCampaigns(userId) {
  return await loadDoc('campaigns', userId, []);
}

async function saveCampaigns(userId, data) {
  return await saveDoc('campaigns', userId, data);
}

// ─── CFO Data ─────────────────────────────────────────────────────

async function loadCfoData(userId) {
  return await loadDoc('cfo_data', userId, null);
}

async function saveCfoData(userId, data) {
  return await saveDoc('cfo_data', userId, data);
}

// ─── CFO Transactions ─────────────────────────────────────────────

async function loadCfoTransactions(userId) {
  return await loadDoc('cfo_transactions', userId, []);
}

async function saveCfoTransactions(userId, data) {
  return await saveDoc('cfo_transactions', userId, data);
}

// ─── Content Calendar ─────────────────────────────────────────────

async function loadContent(userId) {
  return await loadDoc('content_posts', userId, []);
}

async function saveContent(userId, data) {
  return await saveDoc('content_posts', userId, data);
}

// ─── Conversations ────────────────────────────────────────────────

async function loadConversations(userId) {
  return await loadDoc('conversations', userId, []);
}

async function saveConversations(userId, data) {
  return await saveDoc('conversations', userId, data);
}

// ─── CSA Settings ─────────────────────────────────────────────────

async function loadCsaSettings(userId) {
  return await loadDoc('csa_settings', userId, {});
}

async function saveCsaSettings(userId, data) {
  return await saveDoc('csa_settings', userId, data);
}

// ─── CSA Knowledge Base ───────────────────────────────────────────

async function loadCsaKnowledge(userId) {
  return await loadDoc('csa_knowledge', userId, []);
}

async function saveCsaKnowledge(userId, data) {
  return await saveDoc('csa_knowledge', userId, data);
}

// ─── CSA Conversations ────────────────────────────────────────────

async function loadCsaConversations(userId) {
  return await loadDoc('csa_conversations', userId, []);
}

async function saveCsaConversations(userId, data) {
  return await saveDoc('csa_conversations', userId, data);
}

// ─── CSA Email Channel ────────────────────────────────────────────

async function loadCsaEmailChannel(userId) {
  return await loadDoc('csa_email_channel', userId, null);
}

async function saveCsaEmailChannel(userId, data) {
  return await saveDoc('csa_email_channel', userId, data);
}

// ─── CSA Email Conversations ──────────────────────────────────────

async function loadCsaEmailConversations(userId) {
  return await loadDoc('csa_email_conversations', userId, []);
}

async function saveCsaEmailConversations(userId, data) {
  return await saveDoc('csa_email_conversations', userId, data);
}

// ─── CSA Email Processed IDs ──────────────────────────────────────

async function loadCsaEmailProcessed(userId) {
  return await loadDoc('csa_email_processed', userId, []);
}

async function saveCsaEmailProcessed(userId, data) {
  return await saveDoc('csa_email_processed', userId, data);
}

// ─── CSA Telegram ─────────────────────────────────────────────────

async function loadCsaTelegramChannel(userId) {
  return await loadDoc('csa_telegram_channel', userId, null);
}

async function saveCsaTelegramChannel(userId, data) {
  return await saveDoc('csa_telegram_channel', userId, data);
}

async function loadCsaTelegramConversations(userId) {
  return await loadDoc('csa_telegram_conversations', userId, []);
}

async function saveCsaTelegramConversations(userId, data) {
  return await saveDoc('csa_telegram_conversations', userId, data);
}

// ─── CSA WhatsApp ─────────────────────────────────────────────────

async function loadCsaWhatsAppChannel(userId) {
  return await loadDoc('csa_whatsapp_channel', userId, null);
}

async function saveCsaWhatsAppChannel(userId, data) {
  return await saveDoc('csa_whatsapp_channel', userId, data);
}

async function loadCsaWhatsAppConversations(userId) {
  return await loadDoc('csa_whatsapp_conversations', userId, []);
}

async function saveCsaWhatsAppConversations(userId, data) {
  return await saveDoc('csa_whatsapp_conversations', userId, data);
}

// ─── Integrations ─────────────────────────────────────────────────

async function loadIntegration(userId, provider) {
  const result = await pool.query(
    'SELECT data FROM integrations WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].data;
}

async function saveIntegration(userId, provider, data) {
  await pool.query(
    `INSERT INTO integrations (user_id, provider, data, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, provider) DO UPDATE SET data = $3, updated_at = NOW()`,
    [userId, provider, JSON.stringify(data)]
  );
}

async function deleteIntegration(userId, provider) {
  await pool.query('DELETE FROM integrations WHERE user_id = $1 AND provider = $2', [userId, provider]);
}

// ─── Websites ─────────────────────────────────────────────────────

async function loadWebsiteHtml(userId) {
  const result = await pool.query('SELECT html FROM websites WHERE user_id = $1', [userId]);
  if (result.rows.length === 0) return null;
  return result.rows[0].html;
}

async function saveWebsite(userId, html, meta) {
  await pool.query(
    `INSERT INTO websites (user_id, html, meta, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE SET html = $2, meta = $3, updated_at = NOW()`,
    [userId, html, JSON.stringify(meta)]
  );
}

async function loadWebsiteMeta(userId) {
  const result = await pool.query('SELECT meta FROM websites WHERE user_id = $1', [userId]);
  if (result.rows.length === 0) return null;
  return result.rows[0].meta;
}

async function loadSubdomainMap() {
  const result = await pool.query('SELECT subdomain, user_id FROM subdomain_map');
  const map = {};
  for (const r of result.rows) map[r.subdomain] = r.user_id;
  return map;
}

async function saveSubdomainMapping(subdomain, userId) {
  await pool.query(
    `INSERT INTO subdomain_map (subdomain, user_id) VALUES ($1, $2)
     ON CONFLICT (subdomain) DO UPDATE SET user_id = $2`,
    [subdomain, userId]
  );
}

async function getSubdomainUserId(subdomain) {
  const result = await pool.query('SELECT user_id FROM subdomain_map WHERE subdomain = $1', [subdomain]);
  if (result.rows.length === 0) return null;
  return result.rows[0].user_id;
}

// ─── Logos ─────────────────────────────────────────────────────────

async function saveLogo(userId, filename, buffer, contentType) {
  await pool.query(
    `INSERT INTO logos (user_id, filename, data, content_type, updated_at) VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET filename = $2, data = $3, content_type = $4, updated_at = NOW()`,
    [userId, filename, buffer, contentType]
  );
}

async function loadLogo(userId) {
  const result = await pool.query('SELECT filename, data, content_type FROM logos WHERE user_id = $1', [userId]);
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

// ─── Password Resets ──────────────────────────────────────────────

async function loadPasswordResets() {
  const result = await pool.query('SELECT token, data FROM password_resets');
  const resets = {};
  for (const r of result.rows) resets[r.token] = r.data;
  return resets;
}

async function savePasswordReset(token, data) {
  await pool.query(
    `INSERT INTO password_resets (token, data, created_at) VALUES ($1, $2, NOW())
     ON CONFLICT (token) DO UPDATE SET data = $2`,
    [token, JSON.stringify(data)]
  );
}

async function deletePasswordReset(token) {
  await pool.query('DELETE FROM password_resets WHERE token = $1', [token]);
}

// ─── Send Log ─────────────────────────────────────────────────────

async function appendSendLog(userId, entry) {
  await pool.query(
    'INSERT INTO send_logs (user_id, data, created_at) VALUES ($1, $2, NOW())',
    [userId, JSON.stringify(entry)]
  );
}

// ─── KV Store (for misc data like password-resets, meta-oauth-result, etc.) ──

async function kvGet(key, defaultVal = null) {
  const result = await pool.query('SELECT data FROM kv_store WHERE key = $1', [key]);
  if (result.rows.length === 0) return defaultVal;
  return result.rows[0].data;
}

async function kvSet(key, data) {
  await pool.query(
    `INSERT INTO kv_store (key, data, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = NOW()`,
    [key, JSON.stringify(data)]
  );
}

async function kvDelete(key) {
  await pool.query('DELETE FROM kv_store WHERE key = $1', [key]);
}

module.exports = {
  ensureInit,
  isConnected,
  query,
  
  // Documents
  loadDoc,
  saveDoc,
  
  // Users
  loadUsers,
  saveUsers,
  findUserByEmail,
  findUserById,
  upsertUser,
  
  // User Settings
  loadUserSettings,
  saveUserSettings,
  
  // SMTP
  loadSmtpSettings,
  saveSmtpSettings,
  
  // Leads
  loadLeads,
  saveLeads,
  
  // Campaigns
  loadCampaigns,
  saveCampaigns,
  
  // CFO
  loadCfoData,
  saveCfoData,
  loadCfoTransactions,
  saveCfoTransactions,
  
  // Content
  loadContent,
  saveContent,
  
  // Conversations
  loadConversations,
  saveConversations,
  
  // CSA
  loadCsaSettings,
  saveCsaSettings,
  loadCsaKnowledge,
  saveCsaKnowledge,
  loadCsaConversations,
  saveCsaConversations,
  
  // CSA Email
  loadCsaEmailChannel,
  saveCsaEmailChannel,
  loadCsaEmailConversations,
  saveCsaEmailConversations,
  loadCsaEmailProcessed,
  saveCsaEmailProcessed,
  
  // CSA Telegram
  loadCsaTelegramChannel,
  saveCsaTelegramChannel,
  loadCsaTelegramConversations,
  saveCsaTelegramConversations,
  
  // CSA WhatsApp
  loadCsaWhatsAppChannel,
  saveCsaWhatsAppChannel,
  loadCsaWhatsAppConversations,
  saveCsaWhatsAppConversations,
  
  // Integrations
  loadIntegration,
  saveIntegration,
  deleteIntegration,
  
  // Websites
  loadWebsiteHtml,
  saveWebsite,
  loadWebsiteMeta,
  loadSubdomainMap,
  saveSubdomainMapping,
  getSubdomainUserId,
  
  // Logos
  saveLogo,
  loadLogo,
  
  // Password Resets
  loadPasswordResets,
  savePasswordReset,
  deletePasswordReset,
  
  // Send Log
  appendSendLog,
  
  // KV
  kvGet,
  kvSet,
  kvDelete,
};
