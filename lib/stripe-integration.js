// Stripe Integration for Caesar's Legions
// Handles subscriptions, payments, and customer management

require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('./db');
const { sendWelcomeEmail, sendPaymentFailedEmail, notifyAdmin } = require('./transactional-emails');

/**
 * Create Stripe customer and subscription
 * @param {Object} client - Client data from database
 * @param {string} paymentMethodId - Optional payment method ID if provided upfront
 * @returns {Promise<Object>} - { customer, subscription, checkoutUrl }
 */
async function createSubscription(client, paymentMethodId = null) {
  try {
    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: client.email,
      name: client.name,
      metadata: {
        clientId: client.id,
        company: client.company
      }
    });

    console.log(`✓ Stripe customer created: ${customer.id}`);

    // Update client with Stripe customer ID
    db.updateClientStripeId(client.id, customer.id);

    // If payment method provided, attach it
    if (paymentMethodId) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.id
      });

      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        {
          price: process.env.STRIPE_PRICE_ID // Monthly price ID
        }
      ],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        clientId: client.id,
        company: client.company
      }
    });

    console.log(`✓ Subscription created: ${subscription.id}`);

    // Update client with subscription ID
    db.updateClientSubscriptionId(client.id, subscription.id);

    // Generate Checkout URL (if no payment method provided)
    let checkoutUrl = null;
    if (!paymentMethodId) {
      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        mode: 'subscription',
        line_items: [
          {
            price: process.env.STRIPE_PRICE_ID,
            quantity: 1
          }
        ],
        success_url: `${process.env.BASE_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.BASE_URL}/payment/cancel`,
        metadata: {
          clientId: client.id
        }
      });

      checkoutUrl = session.url;
    }

    return {
      customer,
      subscription,
      checkoutUrl,
      clientSecret: subscription.latest_invoice.payment_intent?.client_secret
    };
  } catch (error) {
    console.error('Stripe subscription error:', error.message);
    throw error;
  }
}

/**
 * Cancel subscription
 * @param {string} subscriptionId - Stripe subscription ID
 */
async function cancelSubscription(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    console.log(`✓ Subscription cancelled: ${subscriptionId}`);
    return subscription;
  } catch (error) {
    console.error('Cancel subscription error:', error.message);
    throw error;
  }
}

/**
 * Handle successful payment webhook
 * @param {Object} session - Stripe checkout session
 */
async function handlePaymentSuccess(session) {
  const clientId = parseInt(session.metadata.clientId);

  console.log(`✓ Payment successful for client ${clientId}`);

  // Update client status to active
  db.updateClientStatus(clientId, 'active');

  // Get client data for emails
  const client = db.getClientById(clientId);
  
  if (client) {
    // Send welcome email
    await sendWelcomeEmail(client);
    
    // Notify admin via Telegram
    await notifyAdmin(
      `🎉 New client! ${client.name} (${client.company}) just subscribed - $${session.amount_total / 100}`,
      'normal'
    );
  }

  return { success: true, clientId };
}

/**
 * Handle failed payment webhook
 * @param {Object} invoice - Stripe invoice
 */
async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;

  // Find client by Stripe customer ID
  const clients = db.getAllClients();
  const client = clients.find(c => c.stripe_customer_id === customerId);

  if (!client) {
    console.error(`Client not found for Stripe customer: ${customerId}`);
    return;
  }

  console.log(`✗ Payment failed for client ${client.id}`);

  // Pause campaigns (don't delete, just pause)
  db.updateClientStatus(client.id, 'payment_failed');

  // Send payment failure email
  await sendPaymentFailedEmail(client);
  
  // Notify admin
  await notifyAdmin(
    `⚠️ Payment failed for ${client.name} (${client.company}) - $${invoice.amount_due / 100}`,
    'urgent'
  );

  return { failed: true, clientId: client.id };
}

/**
 * Get subscription status
 * @param {string} subscriptionId - Stripe subscription ID
 */
async function getSubscriptionStatus(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return {
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    };
  } catch (error) {
    console.error('Get subscription error:', error.message);
    throw error;
  }
}

/**
 * Create customer portal session (for managing subscription)
 * @param {string} customerId - Stripe customer ID
 */
async function createPortalSession(customerId) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.BASE_URL}/dashboard`
    });

    return session.url;
  } catch (error) {
    console.error('Create portal session error:', error.message);
    throw error;
  }
}

module.exports = {
  createSubscription,
  cancelSubscription,
  handlePaymentSuccess,
  handlePaymentFailed,
  getSubscriptionStatus,
  createPortalSession
};
