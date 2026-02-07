// Client Signup & Stripe Integration
// Handles new client signups, Stripe checkout, and auto-onboarding

const db = require('./db');

/**
 * Create a new client signup
 * Returns Stripe checkout URL
 */
async function handleSignup(formData) {
  const { name, email, company, website, pain_point, target_audience } = formData;

  // Validate required fields
  if (!name || !email || !company || !website) {
    throw new Error('Missing required fields');
  }

  // Check if email already exists
  const existingClient = db.getClientByEmail(email);
  if (existingClient) {
    throw new Error('Email already registered. Contact support if you need help.');
  }

  // Create pending client record
  const clientId = db.insertClient({
    name,
    email,
    company,
    website,
    status: 'pending', // Will activate after payment
    plan: 'early_bird',
    price: 250,
    onboarding_data: JSON.stringify({
      pain_point,
      target_audience,
      signup_date: new Date().toISOString()
    })
  });

  // Get MontyPay checkout URL (NO STRIPE)
  const checkoutUrl = await getPaymentCheckout({
    clientId,
    email,
    name,
    company,
    price: 250
  });

  return {
    success: true,
    clientId,
    checkoutUrl
  };
}

/**
 * Get Payment URL (MontyPay or Bitcoin - NO STRIPE)
 * @returns {string} Payment URL
 */
async function getPaymentCheckout({ clientId, email, name, company, price }) {
  const { getPaymentUrl, MONTYPAY_LINK } = require('./payment-handler');
  
  // Get MontyPay payment URL
  const payment = getPaymentUrl({
    clientId,
    email,
    plan: 'early_bird',
    method: 'montypay'
  });

  console.log(`✅ MontyPay checkout for ${email}: ${payment.paymentUrl}`);

  return payment.paymentUrl;
}

/**
 * Handle successful payment webhook from Stripe
 * Activates client and triggers onboarding
 */
async function handlePaymentSuccess(session) {
  const clientId = parseInt(session.client_reference_id || session.metadata.client_id);
  const stripeCustomerId = session.customer;
  const subscriptionId = session.subscription;

  if (!clientId) {
    console.error('❌ No client_id in Stripe session:', session.id);
    return { success: false, error: 'Invalid session data' };
  }

  try {
    // Update client status to active
    db.updateClient(clientId, {
      status: 'active',
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: subscriptionId,
      activated_at: Math.floor(Date.now() / 1000),
      next_billing_date: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    });

    console.log(`✅ Client ${clientId} activated (payment received)`);

    // Trigger onboarding email
    await sendOnboardingEmail(clientId);

    // Notify via Telegram (if configured)
    await notifyNewClient(clientId);

    return { success: true, clientId };
  } catch (error) {
    console.error(`❌ Error activating client ${clientId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send onboarding email to new client
 */
async function sendOnboardingEmail(clientId) {
  const client = db.getClient(clientId);
  if (!client) return;

  const { sendEmail } = require('./email-sender');

  const onboardingData = JSON.parse(client.onboarding_data || '{}');

  const emailBody = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #1e3c72;">🏛️ Welcome to Caesar's Legions!</h1>
  
  <p>Hi ${client.name.split(' ')[0]},</p>
  
  <p><strong>Your payment has been received.</strong> You're now officially part of the Early Legion. 🎉</p>
  
  <h2 style="color: #333; margin-top: 32px;">What Happens Next?</h2>
  
  <ol style="line-height: 1.8;">
    <li><strong>Onboarding Call (30 min)</strong><br>
        Book a time here: <a href="https://calendly.com/[YOUR-LINK]" style="color: #1e3c72;">Schedule Now</a>
    </li>
    <li><strong>Campaign Setup</strong><br>
        We'll configure your targeting, messaging, and email warmup.
    </li>
    <li><strong>First 10 Test Emails</strong><br>
        We send a small test batch for you to review (48 hours).
    </li>
    <li><strong>Full Launch</strong><br>
        Once approved, we'll ramp to 100 emails/week.
    </li>
  </ol>
  
  <h2 style="color: #333; margin-top: 32px;">Dashboard Access</h2>
  <p>Your dashboard: <a href="https://promptabusiness.com/dashboard?client=${client.id}" style="color: #1e3c72;">View Dashboard</a></p>
  
  <h2 style="color: #333; margin-top: 32px;">Your Info</h2>
  <ul style="line-height: 1.8;">
    <li><strong>Company:</strong> ${client.company}</li>
    <li><strong>Target Audience:</strong> ${onboardingData.target_audience || 'To be discussed'}</li>
    <li><strong>Pain Point:</strong> ${onboardingData.pain_point || 'N/A'}</li>
  </ul>
  
  <h2 style="color: #333; margin-top: 32px;">Quick Links</h2>
  <ul>
    <li>📊 <a href="https://promptabusiness.com/dashboard?client=${client.id}" style="color: #1e3c72;">Dashboard</a></li>
    <li>📅 <a href="https://calendly.com/[YOUR-LINK]" style="color: #1e3c72;">Book Onboarding Call</a></li>
    <li>💬 <a href="https://t.me/[YOUR-TELEGRAM]" style="color: #1e3c72;">Telegram Support</a></li>
    <li>🐦 <a href="https://x.com/agenticCaesar" style="color: #1e3c72;">Follow Progress on X</a></li>
  </ul>
  
  <div style="margin-top: 40px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
    <p style="margin: 0;"><strong>Need Help?</strong></p>
    <p style="margin: 8px 0 0;">Reply to this email or DM me on X: <a href="https://x.com/messages/compose?recipient_id=XXXXX" style="color: #1e3c72;">@agenticCaesar</a></p>
  </div>
  
  <p style="margin-top: 32px;">Looking forward to crushing cold email together.</p>
  
  <p style="margin-top: 16px;">
    <strong>— Kareem</strong><br>
    Founder, Caesar's Legions
  </p>
</div>
  `.trim();

  try {
    await sendEmail({
      to: client.email,
      subject: "🏛️ Welcome to Caesar's Legions - Let's Get Started",
      body: emailBody,
      fromEmail: process.env.SUPPORT_EMAIL || 'caesar@promptabusiness.com'
    });

    console.log(`✅ Onboarding email sent to ${client.email}`);
  } catch (error) {
    console.error(`❌ Failed to send onboarding email to ${client.email}:`, error.message);
  }
}

/**
 * Notify team about new client via Telegram
 */
async function notifyNewClient(clientId) {
  const client = db.getClient(clientId);
  if (!client) return;

  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (!telegramBotToken || !telegramChatId) {
    console.log('⚠️ Telegram not configured. Skipping notification.');
    return;
  }

  try {
    const fetch = require('node-fetch');
    
    const message = `
🎉 NEW CLIENT SIGNUP!

**${client.company}**
Name: ${client.name}
Email: ${client.email}
Plan: Early Bird ($250/mo)

Dashboard: https://promptabusiness.com/dashboard?client=${client.id}

ACTION NEEDED:
1. Send onboarding calendar link
2. Review target audience
3. Schedule setup call
    `.trim();

    await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    console.log(`✅ Telegram notification sent for new client: ${client.company}`);
  } catch (error) {
    console.error('❌ Failed to send Telegram notification:', error.message);
  }
}

module.exports = {
  handleSignup,
  handlePaymentSuccess,
  getPaymentCheckout,
  sendOnboardingEmail,
  notifyNewClient
};
