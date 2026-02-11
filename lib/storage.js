// Storage Proxy for Mubyn OS
// Transparently intercepts loadJSON/saveJSON calls and routes to PostgreSQL
// when DATABASE_URL is set. Falls back to JSON files otherwise.
//
// USAGE: Replace the loadJSON/saveJSON functions in mubyn-routes.js with these.
// No other changes needed in route handlers!

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const pgDb = require('./pg-db');

let _initialized = false;
let _pgReady = false;

const DATA_DIR = path.join(__dirname, '..', 'data');

// ─── Initialize ────────────────────────────────────────────────────

async function init() {
  if (_initialized) return _pgReady ? 'postgresql' : 'json';
  _initialized = true;
  
  try {
    _pgReady = await pgDb.ensureInit();
  } catch (err) {
    console.error('Storage init error:', err.message);
    _pgReady = false;
  }
  
  const mode = _pgReady ? 'postgresql' : 'json';
  console.log(`📦 Mubyn storage: ${mode}`);
  return mode;
}

function usePg() {
  return _pgReady && pgDb.isConnected();
}

// ─── Path → Key Conversion ─────────────────────────────────────────
// Convert a filesystem path to a stable PostgreSQL key
// e.g., /path/to/data/users.json → users.json
//       /path/to/data/leads-abc123.json → leads-abc123.json
//       /path/to/data/websites/userId/meta.json → websites/userId/meta.json

function pathToKey(filePath) {
  // Normalize to forward slashes
  const normalized = filePath.replace(/\\/g, '/');
  
  // Extract relative path from data directory
  const dataIdx = normalized.lastIndexOf('/data/');
  if (dataIdx !== -1) {
    return normalized.slice(dataIdx + 6); // after '/data/'
  }
  
  // Fallback: use the filename
  return path.basename(filePath);
}

// ─── Smart loadJSON ─────────────────────────────────────────────────
// Tries PostgreSQL first, falls back to filesystem

async function loadJSON(filePath, def = []) {
  // Try PostgreSQL first
  if (usePg()) {
    const key = pathToKey(filePath);
    const pgResult = await pgDb.loadDoc(key, undefined);
    if (pgResult !== undefined && pgResult !== null) {
      return pgResult;
    }
    // Not in PG yet — try filesystem and migrate
    try {
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
      // Migrate to PG in background
      pgDb.saveDoc(key, data).catch(() => {});
      return data;
    } catch {
      return def;
    }
  }
  
  // Filesystem only
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return def;
  }
}

// ─── Smart saveJSON ─────────────────────────────────────────────────
// Saves to PostgreSQL (primary) and filesystem (backup/compat)

async function saveJSON(filePath, data) {
  // Always save to filesystem (for compatibility and serving static files)
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  
  // Also save to PostgreSQL if available
  if (usePg()) {
    const key = pathToKey(filePath);
    await pgDb.saveDoc(key, data).catch(err => {
      console.error(`PG save failed for ${key}:`, err.message);
    });
  }
}

// ─── File operations that also go to PG ─────────────────────────────

// For fs.readFile on HTML (websites)
async function readFile(filePath, encoding) {
  if (usePg() && filePath.includes('websites') && filePath.endsWith('.html')) {
    // Extract userId from path like .../websites/userId/index.html
    const parts = filePath.replace(/\\/g, '/').split('/');
    const webIdx = parts.indexOf('websites');
    if (webIdx !== -1 && parts[webIdx + 1]) {
      const userId = parts[webIdx + 1];
      const html = await pgDb.loadWebsiteHtml(userId);
      if (html) return html;
    }
  }
  
  // Fallback to filesystem
  return await fs.readFile(filePath, encoding);
}

// For fs.writeFile on HTML (websites)
async function writeFile(filePath, data, encoding) {
  // Always write to filesystem
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data, encoding);
  
  // Also save website HTML to PG
  if (usePg() && filePath.includes('websites') && filePath.endsWith('.html')) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    const webIdx = parts.indexOf('websites');
    if (webIdx !== -1 && parts[webIdx + 1]) {
      const userId = parts[webIdx + 1];
      await pgDb.saveWebsiteHtml(userId, data).catch(() => {});
    }
  }
}

// For fs.appendFile (send logs)
async function appendFile(filePath, data) {
  // Always append to filesystem
  try {
    await fs.appendFile(filePath, data);
  } catch {}
  
  // Also save to PG
  if (usePg()) {
    try {
      const key = pathToKey(filePath);
      const entry = JSON.parse(data.trim());
      await pgDb.appendLog(key, entry);
    } catch {}
  }
}

// For fs.unlink (delete integration files)
async function unlinkFile(filePath) {
  // Delete from filesystem
  try {
    await fs.unlink(filePath);
  } catch {}
  
  // Delete from PG
  if (usePg()) {
    const key = pathToKey(filePath);
    await pgDb.deleteDoc(key).catch(() => {});
  }
}

// For fs.sendFile equivalent (logos)
async function saveLogoFile(filePath, buffer) {
  // Save to filesystem
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  
  // Also save to PG
  if (usePg()) {
    const key = pathToKey(filePath);
    const ext = path.extname(filePath).slice(1);
    const contentType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
    await pgDb.saveBinary(key, buffer, contentType).catch(() => {});
  }
}

module.exports = {
  init,
  usePg,
  loadJSON,
  saveJSON,
  readFile,
  writeFile,
  appendFile,
  unlinkFile,
  saveLogoFile,
  DATA_DIR,
};
