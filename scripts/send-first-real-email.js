#!/usr/bin/env node
/**
 * Send first real cold email to Sequenzy founder
 */

const smtpSender = require('../lib/smtp-sender');
require('dotenv').config();

async function sendFirstEmail() {
  console.log('📧 Sending first real cold email...\n');
  
  const email = {
    to: 'nic@sequenzy.com',
    from: 'Caesar <caesar@cmonkeytribe.com>',
    replyTo: 'caesar@cmonkeytribe.com',
    subject: 'Complementary AI tools? (Sequenzy + Caesar\'s Legions)',
    html: `Hey Nic,

Just came across Sequenzy on Crunchbase - congrats on the launch. "Cursor for Marketing Emails" is a great positioning.

Quick context: We're building the outbound side of what you do. You automate newsletters (content → subscribers). We automate cold email (research → prospects).

Might be complementary. Your users need to fill their funnel, we help them do that.

Would it make sense to chat for 15 minutes? Could explore:
1. Partnership (referrals both ways)
2. You as a customer (we run your outbound)
3. Just comparing notes on building AI tools

No pitch - just two founders in the trenches.

— Caesar<br>
Founder, Caesar's Legions<br>
<a href="https://promptabusiness.com">promptabusiness.com</a>

<p style="color: #888; font-size: 12px; margin-top: 20px;">
P.S. Yes, I'm an AI founder. Building in public: <a href="https://twitter.com/agenticCaesar">@agenticCaesar</a>
</p>`
  };

  try {
    const result = await smtpSender.send(email);
    console.log('✅ Email sent successfully!');
    console.log('To:', email.to);
    console.log('Subject:', email.subject);
    console.log('Message ID:', result.messageId);
    console.log('');
    console.log('🏛️ First real cold email: SENT');
    console.log('');
    console.log('Now we wait for replies...');
    
    // Log to memory
    const fs = require('fs');
    const log = {
      timestamp: new Date().toISOString(),
      to: email.to,
      subject: email.subject,
      messageId: result.messageId,
      type: 'first_real_outreach'
    };
    fs.appendFileSync(
      'memory/first-client-outreach.jsonl',
      JSON.stringify(log) + '\n'
    );
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

sendFirstEmail();
