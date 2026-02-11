// PostgreSQL Database Layer for Mubyn OS
// Uses DATABASE_URL env var (auto-set by Railway PostgreSQL addon)
// Falls back gracefully — if no DATABASE_URL, isConnected() returns false

const { Pool } = require('pg');

let pool = null;
let _connected = false;
let _initPromise = null;

const SCHEMA = `
-- Generic JSONB document store keyed by filepath
-- This maps exactly to the JSON file storage pattern
CREATE TABLE IF NOT EXISTS json_docs (
  file_key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_json_docs_updated ON json_docs(updated_at);

-- Binary file store (logos, etc.)
CREATE TABLE IF NOT EXISTS binary_files (
  file_key TEXT PRIMARY KEY,
  data BYTEA NOT NULL,
  content_type TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Website HTML (separate for large text)
CREATE TABLE IF NOT EXISTS website_html (
  user_id TEXT PRIMARY KEY,
  html TEXT NOT NULL,
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

// ─── Core Operations ───────────────────────────────────────────────

// Load a JSON document by key (maps to file path)
async function loadDoc(fileKey, defaultVal = null) {
  if (!isConnected()) return null; // signal to use filesystem
  try {
    const result = await pool.query(
      'SELECT data FROM json_docs WHERE file_key = $1',
      [fileKey]
    );
    if (result.rows.length === 0) return defaultVal;
    return result.rows[0].data;
  } catch (err) {
    console.error(`PG loadDoc(${fileKey}) error:`, err.message);
    return null; // signal to use filesystem
  }
}

// Save a JSON document by key
async function saveDoc(fileKey, data) {
  if (!isConnected()) return false;
  try {
    await pool.query(
      `INSERT INTO json_docs (file_key, data, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (file_key) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
      [fileKey, JSON.stringify(data)]
    );
    return true;
  } catch (err) {
    console.error(`PG saveDoc(${fileKey}) error:`, err.message);
    return false;
  }
}

// Delete a JSON document
async function deleteDoc(fileKey) {
  if (!isConnected()) return false;
  try {
    await pool.query('DELETE FROM json_docs WHERE file_key = $1', [fileKey]);
    return true;
  } catch (err) {
    console.error(`PG deleteDoc(${fileKey}) error:`, err.message);
    return false;
  }
}

// Save website HTML (separate table for large text)
async function saveWebsiteHtml(userId, html) {
  if (!isConnected()) return false;
  try {
    await pool.query(
      `INSERT INTO website_html (user_id, html, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET html = $2, updated_at = NOW()`,
      [userId, html]
    );
    return true;
  } catch (err) {
    console.error(`PG saveWebsiteHtml error:`, err.message);
    return false;
  }
}

async function loadWebsiteHtml(userId) {
  if (!isConnected()) return null;
  try {
    const result = await pool.query('SELECT html FROM website_html WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) return null;
    return result.rows[0].html;
  } catch (err) {
    return null;
  }
}

// Save binary file
async function saveBinary(fileKey, buffer, contentType) {
  if (!isConnected()) return false;
  try {
    await pool.query(
      `INSERT INTO binary_files (file_key, data, content_type, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (file_key) DO UPDATE SET data = $2, content_type = $3, updated_at = NOW()`,
      [fileKey, buffer, contentType]
    );
    return true;
  } catch (err) {
    console.error(`PG saveBinary error:`, err.message);
    return false;
  }
}

async function loadBinary(fileKey) {
  if (!isConnected()) return null;
  try {
    const result = await pool.query('SELECT data, content_type FROM binary_files WHERE file_key = $1', [fileKey]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } catch (err) {
    return null;
  }
}

// Append to JSONL log (stored as array in json_docs)
async function appendLog(fileKey, entry) {
  if (!isConnected()) return false;
  try {
    // Use jsonb append - create if not exists
    await pool.query(
      `INSERT INTO json_docs (file_key, data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (file_key) DO UPDATE
       SET data = CASE
         WHEN json_docs.data IS NULL OR jsonb_typeof(json_docs.data) != 'array'
         THEN $2::jsonb
         ELSE json_docs.data || $2::jsonb
       END,
       updated_at = NOW()`,
      [fileKey, JSON.stringify([entry])]
    );
    return true;
  } catch (err) {
    console.error(`PG appendLog error:`, err.message);
    return false;
  }
}

module.exports = {
  ensureInit,
  isConnected,
  loadDoc,
  saveDoc,
  deleteDoc,
  saveWebsiteHtml,
  loadWebsiteHtml,
  saveBinary,
  loadBinary,
  appendLog,
};
