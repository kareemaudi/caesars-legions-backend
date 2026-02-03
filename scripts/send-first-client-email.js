#!/usr/bin/env node
/**
 * Send first real cold email
 * Target: Dynamic QR Code SaaS Founder (zero conversions, needs help)
 */

const { generateEmail } = require('../lib/email-generator');
const { sendEmail } = require('../lib/smtp-sender');

async function sendFirstEmail() {
  console.log('🎯 Sending first real cold email...\n');
  
  // Target: Dynamic QR Code SaaS founder from Reddit
  const lead = {
    firstName: 'Founder', // Will update when we find real name
    company: 'Dynamic QR SaaS',
    title: 'Founder',
    email: 'target@example.com', // NEED REAL EMAIL
    context: {
      painPoint: 'Zero paid conversions after building',
      source: 'Reddit r/SaaS',
      quote: 'Should I be doing manual outreach / partnerships?',
      stage: 'Technical founder struggling with sales'
    }
  };
  
  // Generate personalized email
  const emailContent = await generateEmail(lead, {
    template: 'empathy-first',
    tone: 'authentic',
    pitch: 'free-pilot'
  });
  
  console.log('📧 Generated email:');
  console.log('Subject:', emailContent.subject);
  console.log('Body:', emailContent.body);
  console.log('');
  
  // Send email
  const result = await sendEmail({
    to: lead.email,
    subject: emailContent.subject,
    html: emailContent.body,
    from: 'Caesar <caesar@cmonkeytribe.com>',
    replyTo: 'caesar@cmonkeytribe.com'
  });
  
  console.log('✅ Email sent!');
  console.log('Message ID:', result.messageId);
  console.log('');
  console.log('🏛️ First real outreach complete. Now we wait for replies.');
}

// Run
sendFirstEmail().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
