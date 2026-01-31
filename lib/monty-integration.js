/**
 * MontyPay Integration for Caesar's Legions
 * MENA payment gateway
 */

const axios = require('axios');
require('dotenv').config();

const MONTY_API_URL = 'https://api.montypay.com'; // Update if different
const MONTY_MERCHANT_ID = process.env.MONTY_MERCHANT_ID;
const MONTY_API_KEY = process.env.MONTY_API_KEY;
const MONTY_SECRET_KEY = process.env.MONTY_SECRET_KEY;

/**
 * Create payment link for Caesar's Legions service
 */
async function createPaymentLink(tier, clientEmail, clientName) {
  const products = {
    1: { name: "Caesar's Legions - Starter", price: 297, emails: 100 },
    2: { name: "Caesar's Legions - Professional", price: 997, emails: 500 },
    3: { name: "Caesar's Legions - Enterprise", price: 2997, emails: 1000 }
  };

  const product = products[tier];
  if (!product) {
    throw new Error('Invalid tier. Must be 1, 2, or 3');
  }

  try {
    // Create payment session with MontyPay API
    const response = await axios.post(`${MONTY_API_URL}/v1/checkout/sessions`, {
      merchant_id: MONTY_MERCHANT_ID,
      amount: product.price * 100, // Convert to cents
      currency: 'USD',
      product_name: product.name,
      product_description: `${product.emails} personalized cold emails per week`,
      billing_cycle: 'monthly',
      customer_email: clientEmail,
      customer_name: clientName,
      success_url: 'https://promptabusiness.com/success',
      cancel_url: 'https://promptabusiness.com/pricing',
      webhook_url: 'https://promptabusiness.com/api/webhooks/monty',
      metadata: {
        tier,
        service: 'caesars-legions',
        emails_per_week: product.emails
      }
    }, {
      headers: {
        'Authorization': `Bearer ${MONTY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return {
      success: true,
      payment_url: response.data.payment_url,
      session_id: response.data.session_id
    };

  } catch (error) {
    console.error('MontyPay Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(payload, signature) {
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', MONTY_SECRET_KEY)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return signature === expectedSignature;
}

/**
 * Handle webhook from MontyPay
 */
async function handleWebhook(payload, signature) {
  // Verify signature
  if (!verifyWebhookSignature(payload, signature)) {
    return {
      success: false,
      error: 'Invalid signature'
    };
  }

  const { event, data } = payload;

  switch (event) {
    case 'payment.succeeded':
      // New subscription - onboard client
      console.log('✅ Payment succeeded:', data.customer_email);
      
      // TODO: Auto-onboard client to Caesar's Legions
      // - Create client record in database
      // - Send welcome email
      // - Notify via Telegram
      
      return {
        success: true,
        action: 'client_onboarded',
        client: data.customer_email
      };

    case 'payment.failed':
      console.log('❌ Payment failed:', data.customer_email);
      return {
        success: true,
        action: 'payment_failed_logged'
      };

    case 'subscription.cancelled':
      console.log('🔴 Subscription cancelled:', data.customer_email);
      // TODO: Pause campaign, send offboarding email
      return {
        success: true,
        action: 'subscription_cancelled'
      };

    default:
      console.log('Unknown event:', event);
      return {
        success: true,
        action: 'ignored'
      };
  }
}

/**
 * Get merchant dashboard URL
 */
function getMerchantDashboardUrl() {
  return 'https://merchant.montypay.com';
}

module.exports = {
  createPaymentLink,
  handleWebhook,
  verifyWebhookSignature,
  getMerchantDashboardUrl
};
