#!/usr/bin/env node

/**
 * Test Instantly.ai webhook handler
 * Simulates webhook events and verifies database updates
 */

const Database = require('better-sqlite3');
const { processWebhook, backfillEvents, getWebhookStats } = require('./lib/webhook-handler');

// Wrapper to make better-sqlite3 async-compatible with webhook handler
class AsyncDBWrapper {
  constructor(db) {
    this.db = db;
  }

  async get(sql, params = []) {
    return this.db.prepare(sql).get(...params);
  }

  async all(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }

  async run(sql, params = []) {
    return this.db.prepare(sql).run(...params);
  }

  async exec(sql) {
    return this.db.exec(sql);
  }

  async close() {
    return this.db.close();
  }
}

async function setupTestDB() {
  const db = new Database(':memory:');
  const wrapper = new AsyncDBWrapper(db);

  // Create test schema
  await wrapper.exec(`
    CREATE TABLE campaigns (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      name TEXT NOT NULL,
      emails_sent INTEGER DEFAULT 0,
      emails_opened INTEGER DEFAULT 0,
      emails_clicked INTEGER DEFAULT 0,
      emails_replied INTEGER DEFAULT 0,
      open_rate REAL DEFAULT 0,
      click_rate REAL DEFAULT 0,
      reply_rate REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE campaign_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT,
      message_id TEXT,
      subject TEXT,
      body TEXT,
      status TEXT DEFAULT 'sent',
      sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
      opened_at TEXT,
      clicked_at TEXT,
      replied_at TEXT,
      bounced_at TEXT,
      out_of_office_at TEXT,
      unsubscribed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
  `);

  // Insert test campaign
  await wrapper.run(`
    INSERT INTO campaigns (id, client_id, name)
    VALUES ('test-campaign-1', 'client-1', 'Test Campaign')
  `);

  // Insert test emails
  const testEmails = [
    {
      campaign_id: 'test-campaign-1',
      recipient_email: 'john@example.com',
      recipient_name: 'John Doe',
      message_id: 'msg-001',
      subject: 'Test Email 1',
      body: 'Body 1'
    },
    {
      campaign_id: 'test-campaign-1',
      recipient_email: 'jane@example.com',
      recipient_name: 'Jane Smith',
      message_id: 'msg-002',
      subject: 'Test Email 2',
      body: 'Body 2'
    }
  ];

  for (const email of testEmails) {
    await wrapper.run(`
      INSERT INTO campaign_emails (campaign_id, recipient_email, recipient_name, message_id, subject, body)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [email.campaign_id, email.recipient_email, email.recipient_name, email.message_id, email.subject, email.body]);
  }

  return wrapper;
}

async function runTests() {
  console.log('🧪 Testing Instantly.ai Webhook Handler\n');

  const db = await setupTestDB();

  // Test 1: Email opened event
  console.log('Test 1: Email Opened Event');
  const openEvent = {
    type: 'email.opened',
    timestamp: Date.now(),
    data: {
      message_id: 'msg-001',
      email_address: 'john@example.com',
      campaign_id: 'test-campaign-1',
      opened_at: new Date().toISOString()
    }
  };

  const result1 = await processWebhook(openEvent, db);
  console.log('Result:', result1);
  
  const email1 = await db.get('SELECT * FROM campaign_emails WHERE message_id = ?', ['msg-001']);
  console.log('Email status:', email1.status, '| Opened at:', email1.opened_at);
  console.assert(email1.status === 'opened', '✗ Email should be marked as opened');
  console.log('✓ Email opened event processed\n');

  // Test 2: Email clicked event
  console.log('Test 2: Email Clicked Event');
  const clickEvent = {
    type: 'email.clicked',
    timestamp: Date.now(),
    data: {
      message_id: 'msg-001',
      email_address: 'john@example.com',
      campaign_id: 'test-campaign-1',
      clicked_url: 'https://example.com/landing'
    }
  };

  const result2 = await processWebhook(clickEvent, db);
  console.log('Result:', result2);
  
  const email2 = await db.get('SELECT * FROM campaign_emails WHERE message_id = ?', ['msg-001']);
  console.log('Email status:', email2.status, '| Clicked at:', email2.clicked_at);
  console.assert(email2.status === 'clicked', '✗ Email should be marked as clicked');
  console.log('✓ Email clicked event processed\n');

  // Test 3: Email replied event (high priority)
  console.log('Test 3: Email Replied Event (should generate alert)');
  const replyEvent = {
    type: 'email.replied',
    timestamp: Date.now(),
    data: {
      message_id: 'msg-002',
      email_address: 'jane@example.com',
      campaign_id: 'test-campaign-1',
      reply_body: 'Interested! Let\'s chat.'
    }
  };

  const result3 = await processWebhook(replyEvent, db);
  console.log('Result:', result3);
  console.log('Alerts:', result3.alerts);
  
  const email3 = await db.get('SELECT * FROM campaign_emails WHERE message_id = ?', ['msg-002']);
  console.log('Email status:', email3.status, '| Replied at:', email3.replied_at);
  console.assert(email3.status === 'replied', '✗ Email should be marked as replied');
  console.assert(result3.alerts && result3.alerts.length > 0, '✗ Should generate alert for reply');
  console.log('✓ Email replied event processed with alert\n');

  // Test 4: Campaign stats updated
  console.log('Test 4: Campaign Stats');
  const campaign = await db.get('SELECT * FROM campaigns WHERE id = ?', ['test-campaign-1']);
  console.log('Campaign stats:');
  console.log('  Sent:', campaign.emails_sent);
  console.log('  Opened:', campaign.emails_opened);
  console.log('  Clicked:', campaign.emails_clicked);
  console.log('  Replied:', campaign.emails_replied);
  console.log('  Open rate:', campaign.open_rate + '%');
  console.log('  Reply rate:', campaign.reply_rate + '%');
  
  console.assert(campaign.emails_sent === 2, '✗ Should have 2 emails sent');
  console.assert(campaign.emails_opened === 1, '✗ Should have 1 email opened');
  console.assert(campaign.emails_replied === 1, '✗ Should have 1 email replied');
  console.log('✓ Campaign stats updated correctly\n');

  // Test 5: Backfill events
  console.log('Test 5: Batch Backfill Events');
  const backfillEvents_data = [
    {
      type: 'email.bounced',
      timestamp: Date.now(),
      data: { message_id: 'msg-001', email_address: 'john@example.com', campaign_id: 'test-campaign-1' }
    },
    {
      type: 'email.unsubscribed',
      timestamp: Date.now(),
      data: { message_id: 'msg-002', email_address: 'jane@example.com', campaign_id: 'test-campaign-1' }
    }
  ];

  const backfillResult = await backfillEvents(db, backfillEvents_data);
  console.log('Backfill result:', backfillResult);
  console.assert(backfillResult.processed === 2, '✗ Should process 2 events');
  console.log('✓ Batch backfill completed\n');

  // Test 6: Webhook stats
  console.log('Test 6: Webhook Stats');
  const stats = await getWebhookStats(db);
  console.log('Stats:', stats);
  console.log('✓ Webhook stats retrieved\n');

  await db.close();

  console.log('✅ All tests passed!');
}

runTests().catch(console.error);
