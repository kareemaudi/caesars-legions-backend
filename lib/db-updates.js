// Database Update Methods
// Extends db.js with update operations for webhooks

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'legions.json');

function loadDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/**
 * Update email as opened
 */
function updateEmailOpened(emailId, openedAt) {
  const db = loadDB();
  const email = db.emails_sent.find(e => e.id === emailId);
  
  if (email) {
    email.opened = true;
    email.opened_at = openedAt;
    saveDB(db);
    console.log(`✓ Email ${emailId} marked as opened`);
    return true;
  }
  
  return false;
}

/**
 * Update email as clicked
 */
function updateEmailClicked(emailId, link, clickedAt) {
  const db = loadDB();
  const email = db.emails_sent.find(e => e.id === emailId);
  
  if (email) {
    email.clicked = true;
    email.clicked_at = clickedAt;
    email.clicked_link = link;
    saveDB(db);
    console.log(`✓ Email ${emailId} marked as clicked`);
    return true;
  }
  
  return false;
}

/**
 * Update email as replied
 */
function updateEmailReplied(emailId, repliedAt) {
  const db = loadDB();
  const email = db.emails_sent.find(e => e.id === emailId);
  
  if (email) {
    email.replied = true;
    email.replied_at = repliedAt;
    saveDB(db);
    console.log(`✓ Email ${emailId} marked as replied`);
    return true;
  }
  
  return false;
}

/**
 * Update email as bounced
 */
function updateEmailBounced(emailId, bounceType, bouncedAt) {
  const db = loadDB();
  const email = db.emails_sent.find(e => e.id === emailId);
  
  if (email) {
    email.bounced = true;
    email.bounced_at = bouncedAt;
    email.bounce_type = bounceType;
    saveDB(db);
    console.log(`✓ Email ${emailId} marked as bounced (${bounceType})`);
    return true;
  }
  
  return false;
}

/**
 * Insert reply record
 */
function insertReply(data) {
  const db = loadDB();
  
  const id = db.replies.length + 1;
  const reply = {
    id,
    email_sent_id: data.email_sent_id,
    lead_id: data.lead_id,
    subject: data.subject || null,
    body: data.body,
    received_at: data.received_at || Math.floor(Date.now() / 1000),
    sentiment: data.sentiment || 'neutral'
  };
  
  db.replies.push(reply);
  saveDB(db);
  
  console.log(`✓ Reply recorded from lead ${data.lead_id}`);
  
  return { lastInsertRowid: id };
}

/**
 * Get email by lead email and campaign
 */
function findEmailByLeadAndCampaign(leadEmail, campaignId) {
  const db = loadDB();
  
  // Find lead first
  const lead = db.leads.find(l => l.email === leadEmail && l.campaign_id === campaignId);
  if (!lead) return null;
  
  // Find most recent email sent to this lead
  const emails = db.emails_sent
    .filter(e => e.lead_id === lead.id && e.campaign_id === campaignId)
    .sort((a, b) => b.sent_at - a.sent_at);
  
  return emails[0] || null;
}

/**
 * Update client status
 */
function updateClientStatus(clientId, status) {
  const db = loadDB();
  const client = db.clients.find(c => c.id === clientId);
  
  if (client) {
    client.status = status;
    client.updated_at = Math.floor(Date.now() / 1000);
    saveDB(db);
    console.log(`✓ Client ${clientId} status updated to ${status}`);
    return true;
  }
  
  return false;
}

/**
 * Update campaign status
 */
function updateCampaignStatus(campaignId, status) {
  const db = loadDB();
  const campaign = db.campaigns.find(c => c.id === campaignId);
  
  if (campaign) {
    campaign.status = status;
    campaign.updated_at = Math.floor(Date.now() / 1000);
    saveDB(db);
    console.log(`✓ Campaign ${campaignId} status updated to ${status}`);
    return true;
  }
  
  return false;
}

/**
 * Get email stats for a campaign
 */
function getCampaignStats(campaignId) {
  const db = loadDB();
  const emails = db.emails_sent.filter(e => e.campaign_id === campaignId);
  
  return {
    total: emails.length,
    opened: emails.filter(e => e.opened).length,
    clicked: emails.filter(e => e.clicked).length,
    replied: emails.filter(e => e.replied).length,
    bounced: emails.filter(e => e.bounced).length,
    open_rate: emails.length > 0 ? (emails.filter(e => e.opened).length / emails.length * 100).toFixed(1) : 0,
    reply_rate: emails.length > 0 ? (emails.filter(e => e.replied).length / emails.length * 100).toFixed(1) : 0
  };
}

module.exports = {
  updateEmailOpened,
  updateEmailClicked,
  updateEmailReplied,
  updateEmailBounced,
  insertReply,
  findEmailByLeadAndCampaign,
  updateClientStatus,
  updateCampaignStatus,
  getCampaignStats
};
