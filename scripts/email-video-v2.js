#!/usr/bin/env node
require('dotenv').config();
const { smtpSender } = require('../lib/smtp-sender');
const path = require('path');

async function emailVideo() {
  console.log('📧 Emailing fixed Caesar video...\n');
  
  // Initialize SMTP
  await smtpSender.init();
  
  const videoPath = path.join(__dirname, '../output/caesar-resurrection/out/caesar-resurrection.mp4');
  
  const result = await smtpSender.sendEmail({
    to: 'kareem@cmonkeytribe.com',
    subject: '🏛️ Caesar\'s Resurrection - FIXED VERSION!',
    body: `The fixed video with actual images (not black screen) is attached!

19 seconds, 1920x1080, 32.9 MB

Six cinematic scenes:
1. Fallen Caesar on marble floor
2. Eyes opening with blue supernatural glow  
3. Rising with mystical power
4. Supernatural transformation
5. Standing triumphant
6. Immortal Caesar with golden divine light

Veni. Vidi. Vici.

- Solon

(Video attached as caesar-resurrection.mp4)`,
    fromEmail: process.env.CAESAR_EMAIL,
    fromName: "Caesar's Legions"
  });
  
  if (result.success) {
    console.log('✅ Email sent!');
    console.log('   Message ID:', result.messageId);
  } else {
    console.error('❌ Failed:', result.error);
    process.exit(1);
  }
}

emailVideo().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
