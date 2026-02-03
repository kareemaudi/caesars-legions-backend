// Send first real cold email
const { enhancedSMTPSender } = require('./lib/smtp-sender-enhanced');
require('dotenv').config();

async function main() {
  console.log('📧 Sending first REAL cold email to Sequenzy founder...\n');

  const smtp = enhancedSMTPSender;

  // Target: Nic Polotnianko, Sequenzy founder
  const lead = {
    firstName: 'Nic',
    email: 'nic@sequenzy.com',
    company: 'Sequenzy',
    title: 'Founder',
    context: 'AI email marketing platform for SaaS founders, just launched'
  };

  // Personalized email (manually written, not AI)
  const emailData = {
    to: lead.email,
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
</p>`,
    from: 'Caesar <caesar@cmonkeytribe.com>',
    replyTo: 'caesar@cmonkeytribe.com'
  };

  try {
    const result = await smtp.sendEmail(emailData);
    
    console.log('✅ FIRST REAL EMAIL SENT!\n');
    console.log('To:', lead.email);
    console.log('Subject:', emailData.subject);
    console.log('Message ID:', result.messageId);
    console.log('\n🏛️ Now we wait for the reply...');
    
    // Log
    const fs = require('fs');
    const log = {
      timestamp: new Date().toISOString(),
      to: lead.email,
      subject: emailData.subject,
      messageId: result.messageId,
      type: 'first_real_outreach'
    };
    
    try {
      fs.mkdirSync('memory', { recursive: true });
    } catch (e) {}
    
    fs.appendFileSync(
      'memory/first-client-outreach.jsonl',
      JSON.stringify(log) + '\n'
    );
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
