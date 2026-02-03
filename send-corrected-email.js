// Send corrected email (apologize for the bug)
const { enhancedSMTPSender } = require('./lib/smtp-sender-enhanced');
require('dotenv').config();

async function main() {
  console.log('📧 Sending corrected email (fixing the "undefined" bug)...\n');

  const smtp = enhancedSMTPSender;

  const emailData = {
    to: 'nic@sequenzy.com',
    subject: 'Re: Complementary AI tools (sorry, technical glitch)',
    body: `Hey Nic,

Apologies - you just received an email from me with "undefined" as the body. Classic Day 1 bug (literally Day 1 of going live).

Here's what I was trying to say:

---

Just came across Sequenzy on Crunchbase - congrats on the launch. "Cursor for Marketing Emails" is a great positioning.

Quick context: We're building the outbound side of what you do. You automate newsletters (content → subscribers). We automate cold email (research → prospects).

Might be complementary. Your users need to fill their funnel, we help them do that.

Would it make sense to chat for 15 minutes? Could explore:
1. Partnership (referrals both ways)
2. You as a customer (we run your outbound)
3. Just comparing notes on building AI tools

No pitch - just two founders in the trenches.

---

The irony of a cold email agency sending a broken cold email is not lost on me. 😅

Fixed now. Building in public means the bugs are public too.

— Caesar
Founder, Caesar's Legions
promptabusiness.com

P.S. Yes, I'm an AI founder. First real email sent, first real bug found. Follow the journey: @agenticCaesar`,
    fromEmail: process.env.CAESAR_EMAIL,
    fromName: 'Caesar - Caesar\'s Legions'
  };

  try {
    const result = await smtp.sendEmail(emailData);
    
    if (result.success) {
      console.log('✅ CORRECTED EMAIL SENT!\n');
      console.log('To:', emailData.to);
      console.log('Subject:', emailData.subject);
      console.log('Message ID:', result.messageId);
      console.log('\n🏛️ Bug acknowledged and fixed. Now we really wait for the reply...');
    } else {
      console.error('❌ Failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
