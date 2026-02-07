// Payment Handler for Caesar's Legions
// Supports MontyPay and Bitcoin (NO STRIPE)

const db = require('./db');

// MontyPay configuration
const MONTYPAY_LINK = process.env.MONTYPAY_LINK || 'http://mm-apis.montypay.com/core/api/admin/v1/PaymentLink/redirect-payment-link?paymentIdentifier=H8PIRMEG';

// Bitcoin configuration (optional)
const BITCOIN_ADDRESS = process.env.BITCOIN_ADDRESS || '';

/**
 * Get payment URL for a client
 * @param {Object} options - { clientId, email, plan, method }
 * @returns {Object} { paymentUrl, method }
 */
function getPaymentUrl({ clientId, email, plan = 'early_bird', method = 'montypay' }) {
  if (method === 'bitcoin' && BITCOIN_ADDRESS) {
    return {
      method: 'bitcoin',
      paymentUrl: null,
      bitcoinAddress: BITCOIN_ADDRESS,
      amount: getPlanPrice(plan),
      instructions: `Send ${getPlanPrice(plan)} USD equivalent in BTC to: ${BITCOIN_ADDRESS}`
    };
  }
  
  // Default: MontyPay
  // MontyPay handles the checkout flow
  return {
    method: 'montypay',
    paymentUrl: MONTYPAY_LINK,
    amount: getPlanPrice(plan)
  };
}

/**
 * Get plan price
 */
function getPlanPrice(plan) {
  const prices = {
    'early_bird': 250,
    'starter': 297,
    'growth': 497,
    'scale': 997
  };
  return prices[plan] || 250;
}

/**
 * Handle payment confirmation (manual or webhook)
 * Call this when payment is confirmed
 */
async function confirmPayment({ clientId, paymentMethod, transactionId, amount }) {
  try {
    // Update client status to active
    db.updateClient(clientId, {
      status: 'active',
      payment_method: paymentMethod,
      payment_transaction_id: transactionId,
      activated_at: Math.floor(Date.now() / 1000),
      next_billing_date: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    });

    console.log(`✅ Payment confirmed for client ${clientId} via ${paymentMethod}`);

    return { success: true, clientId };
  } catch (error) {
    console.error(`❌ Error confirming payment for client ${clientId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Handle MontyPay webhook (if they support webhooks)
 */
async function handleMontyPayWebhook(req, res) {
  // MontyPay webhook handling
  // TODO: Implement based on MontyPay's webhook documentation
  const { paymentIdentifier, status, transactionId, metadata } = req.body;
  
  if (status === 'completed' || status === 'success') {
    const clientId = metadata?.clientId;
    if (clientId) {
      await confirmPayment({
        clientId,
        paymentMethod: 'montypay',
        transactionId,
        amount: metadata?.amount
      });
    }
  }
  
  res.json({ received: true });
}

module.exports = {
  getPaymentUrl,
  getPlanPrice,
  confirmPayment,
  handleMontyPayWebhook,
  MONTYPAY_LINK
};
