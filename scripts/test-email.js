#!/usr/bin/env node
const nodemailer = require('nodemailer');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function test() {
  console.log('🧪 Testing Caesar email...\n');
  console.log('From:', process.env.CAESAR_EMAIL);
  console.log('SMTP:', process.env.SMTP_HOST, '\n');
  
  try {
    const info = await transporter.sendMail({
      from: `"Solon - Caesar's Legions" <${process.env.CAESAR_EMAIL}>`,
      to: 'kareem@cmonkeytribe.com', // Send to Kareem
      subject: '🏛️ Caesar Email System - TEST SUCCESSFUL',
      text: `Kareem,

Caesar's autonomous email system is LIVE and working!

✅ Zoho SMTP configured
✅ Caesar@cmonkeytribe.com sending
✅ Ready for outreach

Next: Find 10 prospects with emails, send autonomous outreach.

- Solon
Executing autonomously 🏛️`
    });
    
    console.log('✅ TEST EMAIL SENT!');
    console.log('   Message ID:', info.messageId);
    console.log('\nCheck your inbox: kareem@cmonkeytribe.com\n');
    
  } catch (error) {
    console.error('❌ FAILED:', error.message);
  }
}

test();
