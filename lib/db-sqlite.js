// SQLite Database Layer for Caesar's Legions
// Migrated from JSON file storage for production use

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'legions.sqlite');
const SCHEMA_FILE = path.join(__dirname, '..', 'schema.sql');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL'); // Better performance

// Run schema if tables don't exist
const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='clients'").get();
if (!tableCheck) {
  console.log('Initializing database schema...');
  const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
  db.exec(schema);
  console.log('✓ Database schema initialized');
}

// Prepared statements for better performance
const statements = {
  insertClient: db.prepare(`
    INSERT INTO clients (email, name, company, target_audience, value_prop, website, status, monthly_quota)
    VALUES (@email, @name, @company, @target_audience, @value_prop, @website, @status, @monthly_quota)
  `),
  
  getClient: db.prepare('SELECT * FROM clients WHERE id = ?'),
  getClientByEmail: db.prepare('SELECT * FROM clients WHERE LOWER(email) = LOWER(?)'),
  getAllClients: db.prepare('SELECT * FROM clients'),
  
  updateClient: db.prepare(`
    UPDATE clients SET 
      name = COALESCE(@name, name),
      company = COALESCE(@company, company),
      status = COALESCE(@status, status),
      stripe_customer_id = COALESCE(@stripe_customer_id, stripe_customer_id),
      stripe_subscription_id = COALESCE(@stripe_subscription_id, stripe_subscription_id),
      activated_at = COALESCE(@activated_at, activated_at),
      next_billing_date = COALESCE(@next_billing_date, next_billing_date)
    WHERE id = @id
  `),
  
  insertCampaign: db.prepare(`
    INSERT INTO campaigns (client_id, name, status, target_criteria, email_template)
    VALUES (@client_id, @name, @status, @target_criteria, @email_template)
  `),
  
  getCampaign: db.prepare('SELECT * FROM campaigns WHERE id = ?'),
  getActiveCampaign: db.prepare(`
    SELECT * FROM campaigns 
    WHERE client_id = ? AND status = 'active' 
    ORDER BY created_at DESC LIMIT 1
  `),
  
  insertLead: db.prepare(`
    INSERT OR IGNORE INTO leads (campaign_id, email, first_name, last_name, company, title, linkedin_url, source, status)
    VALUES (@campaign_id, @email, @first_name, @last_name, @company, @title, @linkedin_url, @source, @status)
  `),
  
  getNewLeads: db.prepare(`
    SELECT * FROM leads WHERE campaign_id = ? AND status = 'new' LIMIT ?
  `),
  
  updateLeadStatus: db.prepare('UPDATE leads SET status = ? WHERE id = ?'),
  
  insertEmailSent: db.prepare(`
    INSERT INTO emails_sent (lead_id, campaign_id, client_id, subject, body, personalization_data, sent_at)
    VALUES (@lead_id, @campaign_id, @client_id, @subject, @body, @personalization_data, @sent_at)
  `),
  
  getEmailStats: db.prepare(`
    SELECT 
      COUNT(*) as total_sent,
      SUM(opened) as opened,
      SUM(replied) as replied,
      SUM(clicked) as clicked
    FROM emails_sent WHERE client_id = ?
  `),
  
  getRecentEmails: db.prepare(`
    SELECT e.*, l.email as lead_email, l.first_name, l.last_name, l.company
    FROM emails_sent e
    LEFT JOIN leads l ON e.lead_id = l.id
    WHERE e.client_id = ?
    ORDER BY e.sent_at DESC
    LIMIT ?
  `),
  
  getReplies: db.prepare(`
    SELECT r.*, l.first_name, l.last_name, l.company
    FROM replies r
    JOIN emails_sent e ON r.email_sent_id = e.id
    JOIN leads l ON r.lead_id = l.id
    WHERE e.client_id = ?
    ORDER BY r.received_at DESC
    LIMIT ?
  `)
};

// Query interface (matches existing JSON db API)
const query = {
  insertClient: (data) => {
    const result = statements.insertClient.run({
      email: data.email,
      name: data.name,
      company: data.company || null,
      target_audience: data.target_audience || null,
      value_prop: data.value_prop || null,
      website: data.website || null,
      status: data.status || 'active',
      monthly_quota: data.monthly_quota || 100
    });
    return result.lastInsertRowid;
  },
  
  getClient: (id) => statements.getClient.get(parseInt(id)),
  getClientByEmail: (email) => statements.getClientByEmail.get(email),
  getAllClients: () => statements.getAllClients.all(),
  
  updateClient: (id, updates) => {
    statements.updateClient.run({ id: parseInt(id), ...updates });
    return query.getClient(id);
  },
  
  insertCampaign: (data) => {
    const result = statements.insertCampaign.run({
      client_id: data.client_id,
      name: data.name,
      status: data.status || 'active',
      target_criteria: data.target_criteria || null,
      email_template: data.email_template || null
    });
    return { lastInsertRowid: result.lastInsertRowid };
  },
  
  getCampaign: (id) => statements.getCampaign.get(parseInt(id)),
  getActiveCampaign: (clientId) => statements.getActiveCampaign.get(parseInt(clientId)),
  
  insertLead: (data) => {
    const result = statements.insertLead.run({
      campaign_id: data.campaign_id,
      email: data.email,
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      company: data.company || null,
      title: data.title || null,
      linkedin_url: data.linkedin_url || null,
      source: data.source || 'manual',
      status: 'new'
    });
    return { lastInsertRowid: result.lastInsertRowid };
  },
  
  getNewLeads: (campaignId, limit) => statements.getNewLeads.all(parseInt(campaignId), limit),
  updateLeadStatus: (id, status) => statements.updateLeadStatus.run(status, parseInt(id)),
  
  insertEmailSent: (data) => {
    const result = statements.insertEmailSent.run({
      lead_id: data.lead_id,
      campaign_id: data.campaign_id,
      client_id: data.client_id,
      subject: data.subject,
      body: data.body,
      personalization_data: data.personalization_data || '{}',
      sent_at: data.sent_at || Math.floor(Date.now() / 1000)
    });
    return { lastInsertRowid: result.lastInsertRowid };
  },
  
  getEmailStats: (clientId) => {
    const stats = statements.getEmailStats.get(parseInt(clientId));
    return {
      total_sent: stats?.total_sent || 0,
      opened: stats?.opened || 0,
      replied: stats?.replied || 0,
      clicked: stats?.clicked || 0
    };
  },
  
  getRecentEmails: (clientId, limit = 20) => statements.getRecentEmails.all(parseInt(clientId), limit),
  getReplies: (clientId, limit = 10) => statements.getReplies.all(parseInt(clientId), limit),
  
  // Stripe helpers
  updateClientStripeId: (clientId, stripeCustomerId) => {
    query.updateClient(clientId, { stripe_customer_id: stripeCustomerId });
  },
  
  updateClientSubscriptionId: (clientId, subscriptionId) => {
    query.updateClient(clientId, { stripe_subscription_id: subscriptionId });
  },
  
  updateClientStatus: (clientId, status) => {
    query.updateClient(clientId, { status });
  },
  
  // Migration helper
  migrateFromJson: (jsonPath) => {
    if (!fs.existsSync(jsonPath)) {
      console.log('No JSON database to migrate');
      return;
    }
    
    const jsonDb = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const migrate = db.transaction(() => {
      // Migrate clients
      for (const client of jsonDb.clients || []) {
        try {
          statements.insertClient.run({
            email: client.email,
            name: client.name,
            company: client.company,
            target_audience: client.target_audience,
            value_prop: client.value_prop,
            website: client.website,
            status: client.status || 'active',
            monthly_quota: client.monthly_quota || 100
          });
        } catch (e) {
          console.log(`Skipping duplicate client: ${client.email}`);
        }
      }
      
      // Migrate campaigns
      for (const campaign of jsonDb.campaigns || []) {
        statements.insertCampaign.run({
          client_id: campaign.client_id,
          name: campaign.name,
          status: campaign.status,
          target_criteria: campaign.target_criteria,
          email_template: campaign.email_template
        });
      }
      
      console.log(`✓ Migrated ${jsonDb.clients?.length || 0} clients, ${jsonDb.campaigns?.length || 0} campaigns`);
    });
    
    migrate();
  }
};

console.log('✓ Database initialized (SQLite)');

module.exports = query;
