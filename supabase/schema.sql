-- ============================================================================
-- CAESAR'S LEGIONS - SUPABASE SCHEMA
-- ============================================================================
-- Run this in the Supabase SQL Editor to set up all tables
-- URL: https://supabase.com/dashboard/project/cmbgocxrakofthtdtiyk/sql
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ACCESS REQUESTS
-- Stores form submissions from the God-mode website
-- ============================================================================

CREATE TABLE IF NOT EXISTS access_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT NOT NULL,
  company TEXT,
  icp TEXT,
  referrer TEXT,
  page_time INTEGER,
  ip TEXT,
  user_agent TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'qualified', 'contacted', 'converted', 'rejected')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(email);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_access_requests_created ON access_requests(created_at DESC);

-- Enable Row Level Security
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous inserts (for form submissions)
CREATE POLICY "Allow anonymous inserts" ON access_requests
  FOR INSERT
  WITH CHECK (true);

-- Policy: Allow reading own submissions (by email match)
CREATE POLICY "Allow reading by service role" ON access_requests
  FOR SELECT
  USING (auth.role() = 'service_role');

-- ============================================================================
-- METRICS
-- Real-time metrics for dashboard and website counters
-- ============================================================================

CREATE TABLE IF NOT EXISTS metrics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  emails_sent INTEGER DEFAULT 0,
  signals_processed INTEGER DEFAULT 0,
  active_campaigns INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,
  reply_rate DECIMAL(5,2) DEFAULT 0,
  mrr DECIMAL(10,2) DEFAULT 0,
  clients INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Allow public read" ON metrics
  FOR SELECT
  USING (true);

-- ============================================================================
-- ANALYTICS EVENTS
-- Track page views, conversions, etc.
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event TEXT NOT NULL,
  data JSONB,
  page TEXT,
  referrer TEXT,
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Index for fast event lookups
CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at DESC);

-- Enable RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts
CREATE POLICY "Allow anonymous event tracking" ON analytics_events
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- CAMPAIGNS
-- Campaign data for the system
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  icp JSONB,
  email_sequence JSONB,
  metrics JSONB DEFAULT '{"emails_sent": 0, "opens": 0, "clicks": 0, "replies": 0}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- INITIAL DATA
-- Seed metrics with baseline values
-- ============================================================================

INSERT INTO metrics (emails_sent, signals_processed, active_campaigns, open_rate, reply_rate, mrr, clients)
VALUES (12847, 284521, 3, 42.5, 8.2, 0, 0)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
DROP TRIGGER IF EXISTS access_requests_updated ON access_requests;
CREATE TRIGGER access_requests_updated
  BEFORE UPDATE ON access_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS campaigns_updated ON campaigns;
CREATE TRIGGER campaigns_updated
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- DONE
-- ============================================================================
-- Tables created:
-- - access_requests (form submissions)
-- - metrics (live counters)
-- - analytics_events (tracking)
-- - campaigns (campaign data)
-- ============================================================================
