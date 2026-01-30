-- Caesar's Legions Database Schema

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  target_audience TEXT, -- Who they want to reach
  value_prop TEXT, -- Their unique value proposition
  website TEXT,
  status TEXT DEFAULT 'active', -- active, paused, churned
  monthly_quota INTEGER DEFAULT 100, -- emails per week * 4
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, active, paused, completed
  target_criteria TEXT, -- JSON: industry, company_size, location, etc
  email_template TEXT, -- Base template with variables
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  title TEXT,
  linkedin_url TEXT,
  source TEXT, -- apollo, manual, csv
  status TEXT DEFAULT 'new', -- new, contacted, replied, bounced, unsubscribed
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  UNIQUE(campaign_id, email)
);

CREATE TABLE IF NOT EXISTS emails_sent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  campaign_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  personalization_data TEXT, -- JSON with research used
  sent_at INTEGER DEFAULT (strftime('%s', 'now')),
  opened BOOLEAN DEFAULT 0,
  clicked BOOLEAN DEFAULT 0,
  replied BOOLEAN DEFAULT 0,
  bounced BOOLEAN DEFAULT 0,
  FOREIGN KEY (lead_id) REFERENCES leads(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_sent_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  received_at INTEGER DEFAULT (strftime('%s', 'now')),
  sentiment TEXT, -- positive, neutral, negative (GPT analysis)
  FOREIGN KEY (email_sent_id) REFERENCES emails_sent(id),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_emails_client ON emails_sent(client_id);
CREATE INDEX IF NOT EXISTS idx_emails_sent_at ON emails_sent(sent_at);
