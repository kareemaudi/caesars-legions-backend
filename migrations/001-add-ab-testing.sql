-- A/B Testing Migration for Caesar's Legions
-- Run this after initial schema setup

-- Add A/B testing support to emails_sent table
ALTER TABLE emails_sent ADD COLUMN test_id INTEGER REFERENCES ab_tests(id);
ALTER TABLE emails_sent ADD COLUMN variant TEXT; -- 'A' or 'B' if part of a test

-- A/B Testing Tables
CREATE TABLE IF NOT EXISTS ab_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  test_name TEXT NOT NULL,
  test_type TEXT NOT NULL, -- 'subject', 'body', 'full', 'send_time', 'cta'
  variant_a TEXT NOT NULL, -- JSON config for variant A
  variant_b TEXT NOT NULL, -- JSON config for variant B
  split_ratio INTEGER DEFAULT 50, -- % of leads assigned to variant A
  status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed'
  created_at INTEGER NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS ab_test_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  variant TEXT NOT NULL, -- 'A' or 'B'
  assigned_at INTEGER NOT NULL,
  FOREIGN KEY (test_id) REFERENCES ab_tests(id),
  FOREIGN KEY (lead_id) REFERENCES leads(id),
  UNIQUE(test_id, lead_id) -- Each lead can only be assigned once per test
);

CREATE TABLE IF NOT EXISTS ab_test_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  variant TEXT NOT NULL,
  event TEXT NOT NULL, -- 'sent', 'opened', 'clicked', 'replied'
  event_data TEXT, -- JSON with additional event data
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (test_id) REFERENCES ab_tests(id),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ab_test_assignments_test ON ab_test_assignments(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_assignments_lead ON ab_test_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_test ON ab_test_events(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_variant ON ab_test_events(test_id, variant);
CREATE INDEX IF NOT EXISTS idx_emails_sent_test ON emails_sent(test_id);
