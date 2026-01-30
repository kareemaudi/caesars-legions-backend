// Unsubscribe System
// Legally required for cold email (CAN-SPAM, GDPR)

const express = require('express');
const db = require('./db');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const UNSUBSCRIBE_FILE = path.join(__dirname, '..', 'data', 'unsubscribed.json');

// Initialize unsubscribe list
if (!fs.existsSync(UNSUBSCRIBE_FILE)) {
  fs.writeFileSync(UNSUBSCRIBE_FILE, JSON.stringify({ emails: [] }, null, 2));
}

/**
 * Load unsubscribe list
 */
function loadUnsubscribeList() {
  return JSON.parse(fs.readFileSync(UNSUBSCRIBE_FILE, 'utf8'));
}

/**
 * Save unsubscribe list
 */
function saveUnsubscribeList(data) {
  fs.writeFileSync(UNSUBSCRIBE_FILE, JSON.stringify(data, null, 2));
}

/**
 * Unsubscribe page (GET)
 * URL format: /unsubscribe?email=john@example.com&token=hash
 */
router.get('/', (req, res) => {
  const { email, token } = req.query;
  
  if (!email) {
    return res.status(400).send('Missing email parameter');
  }
  
  // Verify token (simple hash for now)
  const expectedToken = generateUnsubscribeToken(email);
  if (token !== expectedToken) {
    return res.status(403).send('Invalid unsubscribe link');
  }
  
  // Show unsubscribe confirmation page
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Unsubscribe - Caesar's Legions</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #0a0a0a;
          color: #e0e0e0;
          padding: 60px 20px;
          text-align: center;
        }
        .container {
          max-width: 500px;
          margin: 0 auto;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 40px;
        }
        h1 {
          color: #fff;
          margin-bottom: 20px;
          font-size: 24px;
        }
        p {
          color: #888;
          line-height: 1.6;
          margin-bottom: 30px;
        }
        .email {
          background: #0a0a0a;
          padding: 12px;
          border-radius: 6px;
          margin: 20px 0;
          font-family: monospace;
          color: #4ade80;
        }
        button {
          background: #dc2626;
          color: white;
          border: none;
          padding: 14px 32px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }
        button:hover {
          background: #b91c1c;
        }
        .success {
          display: none;
          color: #4ade80;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🏛️ Unsubscribe</h1>
        <p>We're sorry to see you go. Click below to unsubscribe:</p>
        <div class="email">${email}</div>
        <p>You will no longer receive cold emails from our clients.</p>
        <button onclick="unsubscribe()">Unsubscribe</button>
        <div class="success" id="success">
          ✓ You've been unsubscribed. You won't receive any more emails from us.
        </div>
      </div>
      
      <script>
        async function unsubscribe() {
          const response = await fetch('/unsubscribe/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: '${email}', token: '${token}' })
          });
          
          if (response.ok) {
            document.querySelector('button').style.display = 'none';
            document.getElementById('success').style.display = 'block';
          } else {
            alert('Error: Could not unsubscribe. Please contact support.');
          }
        }
      </script>
    </body>
    </html>
  `);
});

/**
 * Confirm unsubscribe (POST)
 */
router.post('/confirm', express.json(), (req, res) => {
  const { email, token } = req.body;
  
  if (!email || !token) {
    return res.status(400).json({ error: 'Missing email or token' });
  }
  
  // Verify token
  const expectedToken = generateUnsubscribeToken(email);
  if (token !== expectedToken) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  
  // Add to unsubscribe list
  const list = loadUnsubscribeList();
  
  if (!list.emails.includes(email)) {
    list.emails.push(email);
    saveUnsubscribeList(list);
    console.log(`✓ Unsubscribed: ${email}`);
  }
  
  // Update lead status in database
  // Find all leads with this email and mark as unsubscribed
  const dbData = require('./db');
  // Note: This is a simplified approach - real implementation would need proper db update
  
  res.json({ success: true });
});

/**
 * Check if email is unsubscribed
 */
function isUnsubscribed(email) {
  const list = loadUnsubscribeList();
  return list.emails.includes(email.toLowerCase());
}

/**
 * Generate unsubscribe token (simple hash)
 */
function generateUnsubscribeToken(email) {
  const crypto = require('crypto');
  const secret = process.env.UNSUBSCRIBE_SECRET || 'caesar-legions-secret-key';
  return crypto.createHash('sha256').update(email + secret).digest('hex').substring(0, 16);
}

/**
 * Generate unsubscribe link for email
 */
function generateUnsubscribeLink(email, baseUrl) {
  const token = generateUnsubscribeToken(email);
  return `${baseUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

/**
 * Add unsubscribe link to email body
 */
function addUnsubscribeLink(emailBody, recipientEmail, baseUrl) {
  const link = generateUnsubscribeLink(recipientEmail, baseUrl);
  
  return emailBody + `\n\n---\n\nTo unsubscribe: ${link}`;
}

module.exports = {
  router,
  isUnsubscribed,
  generateUnsubscribeLink,
  addUnsubscribeLink
};
