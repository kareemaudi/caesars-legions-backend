// ============================================================================
// STRIPE INTEGRATION - Caesar's Legions
// ============================================================================
// Purpose: Stripe Checkout sessions + webhook handling for payments
// Requires: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env
// ============================================================================

const fs = require('fs');
const path = require('path');

// Stripe will be lazy-loaded when keys are available
let stripe = null;

function getStripe() {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    stripe = require('stripe')(key);
  }
  return stripe;
}

// ============================================================================
// PRICING CONFIGURATION
// ============================================================================

const PRICING = {
  earlyBird: {
    name: 'Early Bird (Founding Member)',
    priceId: process.env.STRIPE_PRICE_ID_EARLY_BIRD, // Set in Stripe dashboard
    amount: 25000, // $250.00 in cents
    currency: 'usd',
    interval: 'month',
    features: [
      '100 personalized cold emails per week',
      'GPT-4 powered email generation',
      'Automated 3-day & 7-day follow-ups',
      'Apollo.io lead sourcing included',
      'Real-time dashboard & analytics',
      'Reply tracking & sentiment analysis',
      'Dedicated onboarding (30 min call)'
    ]
  },
  standard: {
    name: 'Standard',
    priceId: process.env.STRIPE_PRICE_ID_STANDARD,
    amount: 49700, // $497.00 in cents
    currency: 'usd',
    interval: 'month',
    features: ['Same as early bird + priority support']
  }
};

// ============================================================================
// CREATE CHECKOUT SESSION
// ============================================================================

async function createCheckoutSession(customerData) {
  const stripe = getStripe();
  
  const { name, email, company, website, pain_point, target_audience } = customerData;
  
  // Store customer metadata for onboarding after payment
  const metadata = {
    name,
    company,
    website,
    pain_point: pain_point?.substring(0, 500) || '', // Stripe metadata limit
    target_audience: target_audience?.substring(0, 500) || ''
  };

  // Check if customer already exists
  const existingCustomers = await stripe.customers.list({
    email: email,
    limit: 1
  });

  let customerId;
  if (existingCustomers.data.length > 0) {
    customerId = existingCustomers.data[0].id;
    // Update metadata
    await stripe.customers.update(customerId, {
      name,
      metadata
    });
  } else {
    // Create new customer
    const customer = await stripe.customers.create({
      email,
      name,
      metadata
    });
    customerId = customer.id;
  }

  // Build session config
  const sessionConfig = {
    customer: customerId,
    payment_method_types: ['card'],
    mode: 'subscription',
    success_url: `${process.env.BASE_URL || 'http://localhost:3001'}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL || 'http://localhost:3001'}/payment-cancel.html`,
    metadata,
    subscription_data: {
      metadata
    },
    allow_promotion_codes: true,
    billing_address_collection: 'required'
  };

  // Use price ID if configured, otherwise use price_data
  if (PRICING.earlyBird.priceId) {
    sessionConfig.line_items = [{
      price: PRICING.earlyBird.priceId,
      quantity: 1
    }];
  } else {
    // Create ad-hoc price (for testing without pre-created price)
    sessionConfig.line_items = [{
      price_data: {
        currency: PRICING.earlyBird.currency,
        product_data: {
          name: PRICING.earlyBird.name,
          description: "AI-powered cold email automation for B2B SaaS founders",
          metadata
        },
        unit_amount: PRICING.earlyBird.amount,
        recurring: {
          interval: PRICING.earlyBird.interval
        }
      },
      quantity: 1
    }];
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);

  // Log the signup attempt
  logSignup({
    timestamp: new Date().toISOString(),
    type: 'checkout_created',
    email,
    name,
    company,
    session_id: session.id,
    status: 'pending'
  });

  return {
    success: true,
    checkoutUrl: session.url,
    sessionId: session.id
  };
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

async function handleWebhook(req, res) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;

  try {
    if (webhookSecret) {
      // Verify webhook signature
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, webhookSecret);
    } else {
      // Development mode - trust the payload
      event = req.body;
      console.warn('[STRIPE] ⚠️ Webhook signature not verified (no secret configured)');
    }
  } catch (err) {
    console.error('[STRIPE] Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;
      
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(event.data.object);
        break;
      
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      
      default:
        console.log(`[STRIPE] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[STRIPE] Error handling webhook:', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleCheckoutComplete(session) {
  console.log('[STRIPE] ✅ Checkout completed:', session.id);
  
  const metadata = session.metadata || {};
  const customerEmail = session.customer_email || session.customer_details?.email;
  
  // Log successful payment
  logSignup({
    timestamp: new Date().toISOString(),
    type: 'payment_complete',
    session_id: session.id,
    customer_id: session.customer,
    email: customerEmail,
    name: metadata.name,
    company: metadata.company,
    amount: session.amount_total,
    status: 'paid'
  });

  // Trigger onboarding
  const { startOnboarding } = require('./onboarding');
  await startOnboarding({
    customerId: session.customer,
    email: customerEmail,
    name: metadata.name,
    company: metadata.company,
    website: metadata.website,
    painPoint: metadata.pain_point,
    targetAudience: metadata.target_audience,
    subscriptionId: session.subscription,
    sessionId: session.id
  });
}

async function handleSubscriptionCreated(subscription) {
  console.log('[STRIPE] 📋 Subscription created:', subscription.id);
  
  logSignup({
    timestamp: new Date().toISOString(),
    type: 'subscription_created',
    subscription_id: subscription.id,
    customer_id: subscription.customer,
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
  });
}

async function handleSubscriptionUpdated(subscription) {
  console.log('[STRIPE] 🔄 Subscription updated:', subscription.id);
  
  logSignup({
    timestamp: new Date().toISOString(),
    type: 'subscription_updated',
    subscription_id: subscription.id,
    customer_id: subscription.customer,
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end
  });
}

async function handleSubscriptionCancelled(subscription) {
  console.log('[STRIPE] ❌ Subscription cancelled:', subscription.id);
  
  logSignup({
    timestamp: new Date().toISOString(),
    type: 'subscription_cancelled',
    subscription_id: subscription.id,
    customer_id: subscription.customer,
    cancelled_at: new Date().toISOString()
  });

  // Could trigger win-back email here
}

async function handleInvoicePaid(invoice) {
  console.log('[STRIPE] 💰 Invoice paid:', invoice.id);
  
  logSignup({
    timestamp: new Date().toISOString(),
    type: 'invoice_paid',
    invoice_id: invoice.id,
    customer_id: invoice.customer,
    subscription_id: invoice.subscription,
    amount: invoice.amount_paid,
    billing_period: `${new Date(invoice.period_start * 1000).toISOString()} - ${new Date(invoice.period_end * 1000).toISOString()}`
  });
}

async function handlePaymentFailed(invoice) {
  console.log('[STRIPE] ⚠️ Payment failed:', invoice.id);
  
  logSignup({
    timestamp: new Date().toISOString(),
    type: 'payment_failed',
    invoice_id: invoice.id,
    customer_id: invoice.customer,
    subscription_id: invoice.subscription,
    amount: invoice.amount_due,
    attempt_count: invoice.attempt_count
  });

  // Could trigger dunning email here
}

// ============================================================================
// LOGGING
// ============================================================================

function logSignup(data) {
  const logDir = path.join(__dirname, '..', 'data', 'signups');
  const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.jsonl`);
  
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(logFile, JSON.stringify(data) + '\n');
    console.log('[STRIPE] Logged:', data.type);
  } catch (err) {
    console.error('[STRIPE] Failed to log:', err);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

async function getSubscription(subscriptionId) {
  const stripe = getStripe();
  return await stripe.subscriptions.retrieve(subscriptionId);
}

async function getCustomer(customerId) {
  const stripe = getStripe();
  return await stripe.customers.retrieve(customerId);
}

async function cancelSubscription(subscriptionId, immediately = false) {
  const stripe = getStripe();
  
  if (immediately) {
    return await stripe.subscriptions.cancel(subscriptionId);
  } else {
    return await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });
  }
}

// ============================================================================
// ROUTE SETUP
// ============================================================================

function setupStripeRoutes(app) {
  // Raw body parser for webhook (Stripe requires raw body for signature verification)
  app.use('/api/stripe/webhook', (req, res, next) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      req.rawBody = data;
      try {
        req.body = JSON.parse(data);
      } catch (e) {
        req.body = {};
      }
      next();
    });
  });

  // Signup endpoint (creates checkout session)
  app.post('/api/signup', async (req, res) => {
    try {
      // Validate required fields
      const { name, email, company, website, pain_point, target_audience } = req.body;
      
      if (!name || !email || !company) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, email, company'
        });
      }

      // Check if Stripe is configured
      if (!process.env.STRIPE_SECRET_KEY) {
        // Development fallback - log signup without payment
        console.log('[STRIPE] No API key - logging signup for manual follow-up');
        logSignup({
          timestamp: new Date().toISOString(),
          type: 'signup_no_stripe',
          email,
          name,
          company,
          website,
          pain_point,
          target_audience,
          status: 'pending_stripe_setup'
        });
        
        return res.json({
          success: true,
          message: 'Signup recorded. Payment processing being configured.',
          checkoutUrl: null,
          waitlist: true
        });
      }

      const result = await createCheckoutSession(req.body);
      res.json(result);
    } catch (err) {
      console.error('[STRIPE] Signup error:', err);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  // Webhook endpoint
  app.post('/api/stripe/webhook', handleWebhook);

  // Get subscription status (for dashboard)
  app.get('/api/subscription/:customerId', async (req, res) => {
    try {
      const stripe = getStripe();
      const subscriptions = await stripe.subscriptions.list({
        customer: req.params.customerId,
        status: 'all',
        limit: 1
      });

      if (subscriptions.data.length === 0) {
        return res.json({ active: false });
      }

      const sub = subscriptions.data[0];
      res.json({
        active: sub.status === 'active',
        status: sub.status,
        currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: sub.cancel_at_period_end
      });
    } catch (err) {
      console.error('[STRIPE] Error fetching subscription:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Health check
  app.get('/api/stripe/health', (req, res) => {
    res.json({
      configured: !!process.env.STRIPE_SECRET_KEY,
      webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
      pricing: PRICING
    });
  });

  console.log('[STRIPE] Routes configured');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  setupStripeRoutes,
  createCheckoutSession,
  handleWebhook,
  getSubscription,
  getCustomer,
  cancelSubscription,
  PRICING
};
