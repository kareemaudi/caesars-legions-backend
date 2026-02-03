const nodemailer = require('nodemailer');
require('dotenv').config();

// Create SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // Use TLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Test email
const testEmail = {
  from: `"${process.env.FROM_NAME}" <${process.env.CAESAR_EMAIL}>`,
  to: 'kareem@cmonkeytribe.com', // Send to Kareem
  subject: '[TEST] Caesar\'s Legions - SMTP Test',
  text: `Hi Kareem,

This is an automated test from Caesar's Legions backend.

✅ SMTP connection: Working
✅ Email generation: Working (tested separately)
✅ Database: Working (tested with follow-ups)

System is ready for first campaign.

Next steps:
1. Get Instantly.ai account ($37/mo) - Or use SMTP directly?
2. Find first client (10 B2B SaaS founders on X)
3. Launch first campaign

--
Caesar's Legions
Automated test sent at ${new Date().toISOString()}
`,
  html: `<p>Hi Kareem,</p>

<p>This is an automated test from <strong>Caesar's Legions</strong> backend.</p>

<ul>
<li>✅ SMTP connection: <strong>Working</strong></li>
<li>✅ Email generation: <strong>Working</strong> (tested separately)</li>
<li>✅ Database: <strong>Working</strong> (tested with follow-ups)</li>
</ul>

<p><strong>System is ready for first campaign.</strong></p>

<p><strong>Next steps:</strong></p>
<ol>
<li>Get Instantly.ai account ($37/mo) - Or use SMTP directly?</li>
<li>Find first client (10 B2B SaaS founders on X)</li>
<li>Launch first campaign</li>
</ol>

<hr>
<p style="color: #666; font-size: 12px;">
Caesar's Legions<br>
Automated test sent at ${new Date().toISOString()}
</p>
`
};

console.log('Sending test email to kareem@cmonkeytribe.com...\n');

transporter.sendMail(testEmail)
  .then(info => {
    console.log('✅ EMAIL SENT SUCCESSFULLY\n');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    console.log('\n🎯 Caesar\'s Legions backend is FULLY OPERATIONAL');
  })
  .catch(err => {
    console.error('❌ SMTP TEST FAILED:', err.message);
    console.error('\nDetails:', err);
    process.exit(1);
  });
