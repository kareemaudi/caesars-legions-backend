#!/usr/bin/env node
/**
 * Monitor Remotion rendering and email video when complete
 */

require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const VIDEO_PATH = path.join(__dirname, '../output/caesar-resurrection/out/caesar-resurrection.mp4');
const RECIPIENT = 'kareem@cmonkeytribe.com';

// SMTP setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function emailVideo() {
  console.log('\n📧 Emailing Caesar\'s Resurrection video...\n');
  
  if (!fs.existsSync(VIDEO_PATH)) {
    console.error('❌ Video file not found:', VIDEO_PATH);
    return;
  }
  
  const stats = fs.statSync(VIDEO_PATH);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log(`📁 Video file: ${fileSizeMB} MB`);
  console.log(`📧 Sending to: ${RECIPIENT}\n`);
  
  try {
    const info = await transporter.sendMail({
      from: `"Caesar's Legions" <${process.env.CAESAR_EMAIL}>`,
      to: RECIPIENT,
      subject: "🏛️ Caesar's Resurrection Video - Ready!",
      text: `Caesar's Resurrection video has finished rendering!

Video Details:
- Duration: 19 seconds
- Resolution: 1920x1080 (Full HD)
- Size: ${fileSizeMB} MB
- 6 cinematic scenes with transitions
- Blue supernatural energy → Golden divine light
- Title overlay: "CAESAR'S LEGIONS - Rising from Death"

The video is attached to this email.

Veni. Vidi. Vici.

- Solon (AI Chief of Staff)`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px;">
          <h1 style="color: #3b82f6; text-shadow: 0 0 10px rgba(59,130,246,0.5);">
            🏛️ Caesar's Resurrection
          </h1>
          
          <p style="font-size: 18px; color: #333;">
            Your video has finished rendering!
          </p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1f2937; margin-top: 0;">Video Details:</h3>
            <ul style="color: #4b5563; line-height: 1.8;">
              <li><strong>Duration:</strong> 19 seconds</li>
              <li><strong>Resolution:</strong> 1920x1080 (Full HD)</li>
              <li><strong>Size:</strong> ${fileSizeMB} MB</li>
              <li><strong>Scenes:</strong> 6 cinematic frames with transitions</li>
              <li><strong>Effects:</strong> Blue supernatural energy → Golden divine light</li>
              <li><strong>Title:</strong> "CAESAR'S LEGIONS - Rising from Death"</li>
            </ul>
          </div>
          
          <p style="color: #6b7280;">
            The video is attached to this email.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-style: italic; text-align: center;">
            Veni. Vidi. Vici.
          </p>
          
          <p style="color: #9ca3af; font-size: 14px; text-align: center;">
            - Solon (AI Chief of Staff)
          </p>
        </div>
      `,
      attachments: [
        {
          filename: 'caesar-resurrection.mp4',
          path: VIDEO_PATH
        }
      ]
    });
    
    console.log('✅ Email sent successfully!');
    console.log(`   Message ID: ${info.messageId}\n`);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    return { success: false, error: error.message };
  }
}

// Wait for video file to exist, then email
async function waitAndEmail() {
  console.log('⏳ Waiting for video rendering to complete...\n');
  
  const checkInterval = setInterval(() => {
    if (fs.existsSync(VIDEO_PATH)) {
      clearInterval(checkInterval);
      
      // Wait extra 5 seconds to ensure file is fully written
      setTimeout(() => {
        emailVideo().then(result => {
          if (result.success) {
            console.log('🎉 All done!\n');
            process.exit(0);
          } else {
            console.error('❌ Email failed\n');
            process.exit(1);
          }
        });
      }, 5000);
    } else {
      process.stdout.write('.');
    }
  }, 5000); // Check every 5 seconds
}

waitAndEmail();
