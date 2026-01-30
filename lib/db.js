const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'legions.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database
let db = {
  clients: [],
  campaigns: [],
  leads: [],
  emails_sent: [],
  replies: []
};

if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Simple query helpers
const query = {
  insertClient: (data) => {
    const id = db.clients.length + 1;
    const client = {
      id,
      ...data,
      status: 'active',
      monthly_quota: 100,
      created_at: Math.floor(Date.now() / 1000)
    };
    db.clients.push(client);
    save();
    return { lastInsertRowid: id };
  },
  
  getClient: (id) => {
    return db.clients.find(c => c.id === parseInt(id));
  },
  
  getAllClients: () => {
    return db.clients;
  },
  
  insertCampaign: (data) => {
    const id = db.campaigns.length + 1;
    const campaign = {
      id,
      ...data,
      status: data.status || 'active',
      created_at: Math.floor(Date.now() / 1000)
    };
    db.campaigns.push(campaign);
    save();
    return { lastInsertRowid: id };
  },
  
  getCampaign: (id) => {
    return db.campaigns.find(c => c.id === parseInt(id));
  },
  
  getActiveCampaign: (clientId) => {
    return db.campaigns.filter(c => c.client_id === parseInt(clientId) && c.status === 'active')
      .sort((a, b) => b.created_at - a.created_at)[0];
  },
  
  insertLead: (data) => {
    // Check for duplicates
    const existing = db.leads.find(l => 
      l.campaign_id === data.campaign_id && l.email === data.email
    );
    if (existing) return { lastInsertRowid: existing.id };
    
    const id = db.leads.length + 1;
    const lead = {
      id,
      ...data,
      status: 'new',
      created_at: Math.floor(Date.now() / 1000)
    };
    db.leads.push(lead);
    save();
    return { lastInsertRowid: id };
  },
  
  getNewLeads: (campaignId, limit) => {
    return db.leads
      .filter(l => l.campaign_id === parseInt(campaignId) && l.status === 'new')
      .slice(0, limit);
  },
  
  updateLeadStatus: (id, status) => {
    const lead = db.leads.find(l => l.id === parseInt(id));
    if (lead) {
      lead.status = status;
      save();
    }
  },
  
  insertEmailSent: (data) => {
    const id = db.emails_sent.length + 1;
    const email = {
      id,
      ...data,
      sent_at: Math.floor(Date.now() / 1000),
      opened: false,
      clicked: false,
      replied: false,
      bounced: false
    };
    db.emails_sent.push(email);
    save();
    return { lastInsertRowid: id };
  },
  
  getEmailStats: (clientId) => {
    const emails = db.emails_sent.filter(e => e.client_id === parseInt(clientId));
    return {
      total_sent: emails.length,
      opened: emails.filter(e => e.opened).length,
      replied: emails.filter(e => e.replied).length,
      clicked: emails.filter(e => e.clicked).length
    };
  },
  
  getRecentEmails: (clientId, limit = 20) => {
    const emails = db.emails_sent
      .filter(e => e.client_id === parseInt(clientId))
      .sort((a, b) => b.sent_at - a.sent_at)
      .slice(0, limit);
    
    return emails.map(e => {
      const lead = db.leads.find(l => l.id === e.lead_id);
      return {
        ...e,
        lead_email: lead?.email,
        first_name: lead?.first_name,
        last_name: lead?.last_name,
        company: lead?.company
      };
    });
  },
  
  getReplies: (clientId, limit = 10) => {
    return db.replies
      .filter(r => {
        const email = db.emails_sent.find(e => e.id === r.email_sent_id);
        return email && email.client_id === parseInt(clientId);
      })
      .sort((a, b) => b.received_at - a.received_at)
      .slice(0, limit)
      .map(r => {
        const lead = db.leads.find(l => l.id === r.lead_id);
        return {
          ...r,
          first_name: lead?.first_name,
          last_name: lead?.last_name,
          company: lead?.company
        };
      });
  },
  
  // Stripe integration helpers
  updateClientStripeId: (clientId, stripeCustomerId) => {
    const client = db.clients.find(c => c.id === parseInt(clientId));
    if (client) {
      client.stripe_customer_id = stripeCustomerId;
      save();
    }
  },
  
  updateClientSubscriptionId: (clientId, subscriptionId) => {
    const client = db.clients.find(c => c.id === parseInt(clientId));
    if (client) {
      client.stripe_subscription_id = subscriptionId;
      save();
    }
  },
  
  updateClientStatus: (clientId, status) => {
    const client = db.clients.find(c => c.id === parseInt(clientId));
    if (client) {
      client.status = status;
      save();
    }
  }
};

console.log('✓ Database initialized (JSON file storage)');

module.exports = query;
