#!/usr/bin/env node

const express = require('express');
const db = require('../lib/db');
const webhookHandler = require('../lib/webhook-handler');
const unsubscribeHandler = require('../lib/unsubscribe');
const stripeIntegration = require('../lib/stripe-integration');
const signupHandler = require('../lib/signup-handler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve static files (signup page)
app.use(express.static('public'));

// Webhook routes
app.use('/webhooks', webhookHandler);

// Unsubscribe routes
app.use('/unsubscribe', unsubscribeHandler.router);

// Stripe webhook endpoint (before express.json middleware for raw body)
app.post('/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    console.log(`[Stripe Webhook] ${event.type}`);
    
    switch (event.type) {
      case 'checkout.session.completed':
        // Use new signup handler for payment success
        await signupHandler.handlePaymentSuccess(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await stripeIntegration.handlePaymentFailed(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        // Handle subscription cancellation
        const subscription = event.data.object;
        console.log(`Subscription cancelled: ${subscription.id}`);
        break;
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// Signup API - Handles new client signups
app.post('/api/signup', async (req, res) => {
  try {
    const result = await signupHandler.handleSignup(req.body);
    
    res.json(result);
  } catch (error) {
    console.error('❌ Signup error:', error.message);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Serve dashboard for a client
app.get('/dashboard/:clientId', (req, res) => {
  const clientId = parseInt(req.params.clientId);
  
  // Get client
  const client = db.getClient(clientId);
  if (!client) {
    return res.status(404).send('Client not found');
  }
  
  // Get stats
  const stats = db.getEmailStats(clientId);
  
  // Get recent emails
  const recentEmails = db.getRecentEmails(clientId, 20);
  
  // Get replies
  const replies = db.getReplies(clientId, 10);
  
  const openRate = stats.total_sent > 0 
    ? ((stats.opened / stats.total_sent) * 100).toFixed(1)
    : 0;
  
  const replyRate = stats.total_sent > 0
    ? ((stats.replied / stats.total_sent) * 100).toFixed(1)
    : 0;
  
  // Render HTML dashboard
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${client.company} - Caesar's Legions Dashboard</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #0a0a0a;
          color: #e0e0e0;
          padding: 40px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { 
          font-size: 32px; 
          margin-bottom: 8px;
          color: #fff;
        }
        .subtitle { 
          color: #888; 
          margin-bottom: 40px;
          font-size: 14px;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }
        .stat-card {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 24px;
        }
        .stat-value {
          font-size: 36px;
          font-weight: bold;
          color: #fff;
          margin-bottom: 8px;
        }
        .stat-label {
          color: #888;
          font-size: 14px;
        }
        .section {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 20px;
        }
        h2 {
          font-size: 20px;
          margin-bottom: 20px;
          color: #fff;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          text-align: left;
          padding: 12px;
          border-bottom: 1px solid #333;
        }
        th {
          color: #888;
          font-weight: 500;
          font-size: 12px;
          text-transform: uppercase;
        }
        td {
          color: #e0e0e0;
          font-size: 14px;
        }
        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }
        .badge-success { background: #1a3d1a; color: #4ade80; }
        .badge-neutral { background: #1a1a1a; color: #888; }
        .reply-box {
          background: #0a0a0a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
        }
        .reply-meta {
          color: #888;
          font-size: 12px;
          margin-bottom: 8px;
        }
        .reply-body {
          color: #e0e0e0;
          line-height: 1.5;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🏛️ Caesar's Legions</h1>
        <div class="subtitle">${client.company} Campaign Dashboard</div>
        
        <div class="stats">
          <div class="stat-card">
            <div class="stat-value">${stats.total_sent}</div>
            <div class="stat-label">Emails Sent</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${openRate}%</div>
            <div class="stat-label">Open Rate</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${replyRate}%</div>
            <div class="stat-label">Reply Rate</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.replied}</div>
            <div class="stat-label">Replies</div>
          </div>
        </div>
        
        ${replies.length > 0 ? `
        <div class="section">
          <h2>📬 Recent Replies</h2>
          ${replies.map(r => `
            <div class="reply-box">
              <div class="reply-meta">
                <strong>${r.first_name} ${r.last_name}</strong> from ${r.company}
                · ${new Date(r.received_at * 1000).toLocaleDateString()}
              </div>
              <div class="reply-body">${r.body.substring(0, 200)}...</div>
            </div>
          `).join('')}
        </div>
        ` : ''}
        
        <div class="section">
          <h2>📧 Recent Emails</h2>
          <table>
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Subject</th>
                <th>Sent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${recentEmails.map(e => `
                <tr>
                  <td>
                    <div><strong>${e.first_name} ${e.last_name}</strong></div>
                    <div style="color: #666; font-size: 12px;">${e.company}</div>
                  </td>
                  <td>${e.subject}</td>
                  <td>${new Date(e.sent_at * 1000).toLocaleDateString()}</td>
                  <td>
                    ${e.replied ? '<span class="badge badge-success">Replied</span>' : 
                      e.opened ? '<span class="badge badge-neutral">Opened</span>' :
                      '<span class="badge badge-neutral">Sent</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </body>
    </html>
  `);
});

// List all clients
app.get('/', (req, res) => {
  const clients = db.getAllClients().sort((a, b) => b.created_at - a.created_at);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Caesar's Legions - Clients</title>
      <style>
        body { 
          font-family: sans-serif; 
          padding: 40px; 
          background: #0a0a0a; 
          color: #e0e0e0;
        }
        h1 { color: #fff; margin-bottom: 20px; }
        a { 
          color: #4ade80; 
          text-decoration: none;
          display: block;
          padding: 16px;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          margin-bottom: 12px;
        }
        a:hover { background: #252525; }
      </style>
    </head>
    <body>
      <h1>🏛️ Caesar's Legions - Clients</h1>
      ${clients.map(c => `
        <a href="/dashboard/${c.id}">
          <strong>${c.company}</strong> (${c.name})
        </a>
      `).join('')}
      ${clients.length === 0 ? '<p>No clients yet. Run: node scripts/onboard-client.js</p>' : ''}
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`\n🏛️  Caesar's Legions Dashboard running on http://localhost:${PORT}\n`);
});
