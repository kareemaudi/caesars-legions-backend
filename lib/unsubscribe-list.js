// Global Unsubscribe List (CAN-SPAM Compliance)
// Emails added here are NEVER contacted again across ALL campaigns and clients
// This is separate from per-campaign unsubscribes

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const UNSUBSCRIBE_FILE = path.join(DATA_DIR, 'global-unsubscribe.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load or initialize unsubscribe list
let unsubscribeList = {
  emails: [], // Array of unsubscribed emails with metadata
  lastUpdated: null
};

if (fs.existsSync(UNSUBSCRIBE_FILE)) {
  try {
    unsubscribeList = JSON.parse(fs.readFileSync(UNSUBSCRIBE_FILE, 'utf8'));
  } catch (error) {
    console.error('[Unsubscribe] Error loading list, creating new:', error.message);
  }
}

/**
 * Save the unsubscribe list to disk
 */
function save() {
  unsubscribeList.lastUpdated = new Date().toISOString();
  fs.writeFileSync(UNSUBSCRIBE_FILE, JSON.stringify(unsubscribeList, null, 2));
}

/**
 * Add an email to the global unsubscribe list
 * @param {string} email - Email address to unsubscribe
 * @param {Object} metadata - Optional metadata (source, reason, campaign_id, etc.)
 * @returns {boolean} - True if added, false if already exists
 */
function addToUnsubscribeList(email, metadata = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  
  // Check if already unsubscribed
  if (isUnsubscribed(normalizedEmail)) {
    console.log(`[Unsubscribe] Already in list: ${normalizedEmail}`);
    return false;
  }
  
  // Add to list
  unsubscribeList.emails.push({
    email: normalizedEmail,
    unsubscribed_at: new Date().toISOString(),
    source: metadata.source || 'webhook',
    reason: metadata.reason || 'user_request',
    campaign_id: metadata.campaign_id || null,
    client_id: metadata.client_id || null,
    ip_address: metadata.ip_address || null,
    user_agent: metadata.user_agent || null
  });
  
  save();
  
  console.log(`[Unsubscribe] Added to global list: ${normalizedEmail} (${metadata.source || 'webhook'})`);
  return true;
}

/**
 * Check if an email is on the global unsubscribe list
 * @param {string} email - Email to check
 * @returns {boolean} - True if unsubscribed
 */
function isUnsubscribed(email) {
  const normalizedEmail = email.toLowerCase().trim();
  return unsubscribeList.emails.some(record => record.email === normalizedEmail);
}

/**
 * Get the unsubscribe record for an email (if exists)
 * @param {string} email - Email to look up
 * @returns {Object|null} - Unsubscribe record or null
 */
function getUnsubscribeRecord(email) {
  const normalizedEmail = email.toLowerCase().trim();
  return unsubscribeList.emails.find(record => record.email === normalizedEmail) || null;
}

/**
 * Remove an email from the unsubscribe list
 * (Use with caution - only if user explicitly re-subscribes)
 * @param {string} email - Email to remove
 * @returns {boolean} - True if removed, false if not found
 */
function removeFromUnsubscribeList(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const initialLength = unsubscribeList.emails.length;
  
  unsubscribeList.emails = unsubscribeList.emails.filter(
    record => record.email !== normalizedEmail
  );
  
  if (unsubscribeList.emails.length < initialLength) {
    save();
    console.log(`[Unsubscribe] Removed from global list: ${normalizedEmail}`);
    return true;
  }
  
  return false;
}

/**
 * Filter a list of leads to exclude unsubscribed emails
 * @param {Array} leads - Array of lead objects (must have 'email' field)
 * @returns {Object} - { allowed, blocked }
 */
function filterUnsubscribed(leads) {
  const allowed = [];
  const blocked = [];
  
  leads.forEach(lead => {
    if (isUnsubscribed(lead.email)) {
      blocked.push({
        ...lead,
        block_reason: 'global_unsubscribe'
      });
    } else {
      allowed.push(lead);
    }
  });
  
  if (blocked.length > 0) {
    console.log(`[Unsubscribe] Filtered out ${blocked.length} globally unsubscribed leads`);
  }
  
  return { allowed, blocked };
}

/**
 * Get statistics about the unsubscribe list
 * @returns {Object} - Stats (total, by source, by date range, etc.)
 */
function getStats() {
  const total = unsubscribeList.emails.length;
  
  // Group by source
  const bySource = {};
  unsubscribeList.emails.forEach(record => {
    const source = record.source || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;
  });
  
  // Recent unsubscribes (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentCount = unsubscribeList.emails.filter(record => 
    new Date(record.unsubscribed_at) > sevenDaysAgo
  ).length;
  
  // Recent unsubscribes (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const last30DaysCount = unsubscribeList.emails.filter(record => 
    new Date(record.unsubscribed_at) > thirtyDaysAgo
  ).length;
  
  return {
    total,
    bySource,
    recentUnsubscribes: {
      last7Days: recentCount,
      last30Days: last30DaysCount
    },
    oldestUnsubscribe: unsubscribeList.emails.length > 0 
      ? unsubscribeList.emails[0].unsubscribed_at 
      : null,
    newestUnsubscribe: unsubscribeList.emails.length > 0 
      ? unsubscribeList.emails[unsubscribeList.emails.length - 1].unsubscribed_at 
      : null,
    lastUpdated: unsubscribeList.lastUpdated
  };
}

/**
 * Export unsubscribe list for compliance audits
 * @returns {Array} - All unsubscribe records
 */
function exportList() {
  return unsubscribeList.emails;
}

/**
 * Bulk import unsubscribes (e.g., from previous system)
 * @param {Array} emails - Array of email strings or objects with email + metadata
 * @returns {Object} - { added, skipped, errors }
 */
function bulkImport(emails, metadata = {}) {
  const results = {
    added: 0,
    skipped: 0,
    errors: []
  };
  
  emails.forEach(item => {
    try {
      const email = typeof item === 'string' ? item : item.email;
      const itemMetadata = typeof item === 'object' 
        ? { ...metadata, ...item } 
        : metadata;
      
      if (addToUnsubscribeList(email, itemMetadata)) {
        results.added++;
      } else {
        results.skipped++;
      }
    } catch (error) {
      results.errors.push({
        item,
        error: error.message
      });
    }
  });
  
  console.log(`[Unsubscribe] Bulk import: ${results.added} added, ${results.skipped} skipped, ${results.errors.length} errors`);
  
  return results;
}

module.exports = {
  addToUnsubscribeList,
  isUnsubscribed,
  getUnsubscribeRecord,
  removeFromUnsubscribeList,
  filterUnsubscribed,
  getStats,
  exportList,
  bulkImport
};
