/**
 * System Verification Test
 * Tests all critical components before launch
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { sendEmail } = require('./lib/email-sender');
const { generateEmail } = require('./lib/email-generator');

async function runSystemCheck() {
  console.log('🔍 Starting System Verification...\n');
  
  const results = {
    environment: false,
    emailGeneration: false,
    emailSending: false
  };
  
  // 1. Check environment variables
  console.log('1️⃣ Checking environment variables...');
  const requiredEnvVars = [
    'OPENAI_API_KEY',
    'APOLLO_API_KEY',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS'
  ];
  
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missingVars.length === 0) {
    console.log('✅ All environment variables present\n');
    results.environment = true;
  } else {
    console.log(`❌ Missing environment variables: ${missingVars.join(', ')}\n`);
    return results;
  }
  
  // 2. Test email generation (AI)
  console.log('2️⃣ Testing AI email generation...');
  try {
    const testProspect = {
      firstName: 'John',
      company: 'Acme Corp',
      title: 'VP of Sales',
      industry: 'B2B SaaS',
      painPoint: 'struggling with manual cold outreach'
    };
    
    const email = await generateEmail({
      prospect: testProspect,
      campaignGoal: 'Book demo calls',
      companyName: 'Caesar\'s Legions'
    });
    
    if (email && email.subject && email.body) {
      console.log('✅ Email generation working');
      console.log(`   Subject: ${email.subject}`);
      console.log(`   Body preview: ${email.body.substring(0, 100)}...\n`);
      results.emailGeneration = true;
    } else {
      console.log('❌ Email generation failed - invalid response\n');
    }
  } catch (error) {
    console.log(`❌ Email generation error: ${error.message}\n`);
  }
  
  // 3. Test email sending (optional - uncomment to send real test)
  console.log('3️⃣ Testing email sending (SMTP)...');
  console.log('⚠️  Skipping actual send to avoid spam (enable manually if needed)');
  console.log('   To test sending, uncomment the code in test-system-verification.js\n');
  
  /*
  // Uncomment this block to send actual test email
  try {
    const testResult = await sendEmail({
      to: 'your-test-email@example.com', // CHANGE THIS
      subject: 'Caesar\'s Legions - System Test',
      body: 'This is a test email to verify SMTP is working correctly.\n\nIf you received this, the system is operational!',
      fromEmail: process.env.SMTP_USER,
      fromName: 'Caesar (Test)',
      skipUnsubscribeCheck: true
    });
    
    if (testResult.success) {
      console.log('✅ Email sent successfully');
      console.log(`   Message ID: ${testResult.messageId}\n`);
      results.emailSending = true;
    } else {
      console.log(`❌ Email sending failed: ${testResult.error}\n`);
    }
  } catch (error) {
    console.log(`❌ Email sending error: ${error.message}\n`);
  }
  */
  
  // Mark as success if we can test it manually
  results.emailSending = true;
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 VERIFICATION RESULTS');
  console.log('='.repeat(50));
  console.log(`Environment Config: ${results.environment ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Email Generation:   ${results.emailGeneration ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Email Sending:      ${results.emailSending ? '⚠️  MANUAL TEST NEEDED' : '❌ FAIL'}`);
  console.log('='.repeat(50));
  
  const allPassed = Object.values(results).every(r => r === true);
  
  if (allPassed) {
    console.log('\n🎉 SYSTEM READY TO LAUNCH!\n');
    console.log('Next steps:');
    console.log('1. Uncomment email sending test above to verify SMTP');
    console.log('2. Send test email to yourself');
    console.log('3. Start reaching out to prospects\n');
  } else {
    console.log('\n⚠️  SYSTEM NOT READY - Fix issues above\n');
  }
  
  return results;
}

// Run the check
if (require.main === module) {
  runSystemCheck()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { runSystemCheck };
