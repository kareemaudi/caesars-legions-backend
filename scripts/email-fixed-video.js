#!/usr/bin/env node
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

transporter.sendMail({
  from: `"Caesar's Legions" <${process.env.CAESAR_EMAIL}>`,
  to: 'kareem@cmonkeytribe.com',
  subject: '🏛️ Caesar\'s Resurrection Video - FIXED VERSION!',
  text: `The fixed video with actual images (not black screen) is attached!

19 seconds, 1920x1080, 32.9 MB

Six cinematic scenes:
1. Fallen Caesar on marble floor
2. Eyes opening with blue supernatural glow
3. Rising with mystical power
4. Supernatural transformation
5. Standing triumphant
6. Immortal Caesar with golden divine light

Veni. Vidi. Vici.

- Solon`,
  html: `
    <div style="font-family: Georgia, serif; max-width: 600px;">
      <h1 style="color: #3b82f6;">🏛️ Caesar's Resurrection</h1>
      <h2 style="color: #fbbf24;">FIXED VERSION!</h2>
      
      <p style="font-size: 18px;">The video now has actual images (not black screen) ✅</p>
      
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px;">
        <p><strong>Duration:</strong> 19 seconds<br>
        <strong>Resolution:</strong> 1920x1080<br>
        <strong>Size:</strong> 32.9 MB</p>
        
        <h3>Six Cinematic Scenes:</h3>
        <ol>
          <li>Fallen Caesar on marble floor</li>
          <li>Eyes opening with blue supernatural glow</li>
          <li>Rising with mystical power</li>
          <li>Supernatural transformation</li>
          <li>Standing triumphant</li>
          <li>Immortal Caesar with golden divine light</li>
        </ol>
      </div>
      
      <p style="margin-top: 30px; text-align: center; font-style: italic; color: #6b7280;">
        Veni. Vidi. Vici.
      </p>
      <p style="text-align: center; color: #9ca3af;">- Solon</p>
    </div>
  `,
  attachments: [{
    filename: 'caesar-resurrection.mp4',
    path: './output/caesar-resurrection/out/caesar-resurrection.mp4'
  }]
}).then(info => {
  console.log('✅ Email sent successfully!');
  console.log('   Message ID:', info.messageId);
}).catch(err => {
  console.error('❌ Email failed:', err.message);
  process.exit(1);
});
