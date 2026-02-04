/**
 * Client Onboarding System
 * 
 * Handles the full client signup flow:
 * 1. Create Stripe checkout session
 * 2. Handle payment success webhook
 * 3. Create client record in system
 * 4. Send welcome email with onboarding info
 * 5. Set up client workspace (campaigns, settings)
 * 
 * @module client-onboarding
 */

const crypto = require('crypto');

// Pricing tiers
const PRICING_TIERS = {
  starter: {
    id: 'starter',
    name: 'Starter Legion',
    price: 297,
    currency: 'usd',
    emailsPerMonth: 5000,
    features: [
      '5,000 emails/month',
      '3 warmup domains',
      'Basic analytics',
      'Email support',
      '1 campaign active'
    ],
    stripePrice: null // Set from env: STRIPE_PRICE_STARTER
  },
  growth: {
    id: 'growth',
    name: 'Growth Legion',
    price: 597,
    currency: 'usd',
    emailsPerMonth: 15000,
    features: [
      '15,000 emails/month',
      '10 warmup domains',
      'Advanced analytics',
      'Priority support',
      '5 campaigns active',
      'A/B testing'
    ],
    stripePrice: null // Set from env: STRIPE_PRICE_GROWTH
  },
  conquest: {
    id: 'conquest',
    name: 'Conquest Legion',
    price: 1497,
    currency: 'usd',
    emailsPerMonth: 50000,
    features: [
      '50,000 emails/month',
      'Unlimited warmup domains',
      'Full analytics suite',
      'Dedicated support',
      'Unlimited campaigns',
      'A/B testing',
      'Custom integrations',
      'API access'
    ],
    stripePrice: null // Set from env: STRIPE_PRICE_CONQUEST
  }
};

/**
 * Client Onboarding Manager
 */
class ClientOnboardingManager {
  constructor(options = {}) {
    this.stripe = options.stripe || null;
    this.supabase = options.supabase || null;
    this.emailSender = options.emailSender || null;
    this.metricsTracker = options.metricsTracker || null;
    
    // Webhook secret for Stripe signature verification
    this.webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
    
    // Success/cancel URLs
    this.successUrl = options.successUrl || process.env.CHECKOUT_SUCCESS_URL || 'https://caesarslegions.com/welcome';
    this.cancelUrl = options.cancelUrl || process.env.CHECKOUT_CANCEL_URL || 'https://caesarslegions.com/pricing';
    
    // In-memory store for dev/testing
    this.clients = new Map();
    this.pendingCheckouts = new Map();
  }

  /**
   * Get available pricing tiers
   */
  getPricingTiers() {
    return Object.values(PRICING_TIERS);
  }

  /**
   * Get specific tier details
   */
  getTier(tierId) {
    return PRICING_TIERS[tierId] || null;
  }

  /**
   * Create a Stripe checkout session for client signup
   * 
   * @param {Object} params - Checkout parameters
   * @param {string} params.email - Customer email
   * @param {string} params.name - Customer name
   * @param {string} params.company - Company name
   * @param {string} params.tier - Pricing tier (starter|growth|conquest)
   * @returns {Object} Checkout session with URL
   */
  async createCheckoutSession(params) {
    const { email, name, company, tier = 'starter' } = params;

    if (!email) {
      throw new Error('Email is required');
    }

    const tierConfig = PRICING_TIERS[tier];
    if (!tierConfig) {
      throw new Error(`Invalid tier: ${tier}. Valid: starter, growth, conquest`);
    }

    // Generate checkout ID for tracking
    const checkoutId = `chk_${crypto.randomBytes(16).toString('hex')}`;

    // Store pending checkout for correlation
    this.pendingCheckouts.set(checkoutId, {
      email,
      name,
      company,
      tier,
      createdAt: new Date().toISOString(),
      status: 'pending'
    });

    // If Stripe is configured, create real session
    if (this.stripe) {
      try {
        const session = await this.stripe.checkout.sessions.create({
          mode: 'subscription',
          payment_method_types: ['card'],
          customer_email: email,
          line_items: [{
            price: tierConfig.stripePrice || process.env[`STRIPE_PRICE_${tier.toUpperCase()}`],
            quantity: 1
          }],
          metadata: {
            checkoutId,
            clientName: name,
            company,
            tier
          },
          success_url: `${this.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: this.cancelUrl,
          subscription_data: {
            metadata: {
              checkoutId,
              company,
              tier
            }
          }
        });

        // Update pending checkout with Stripe session
        this.pendingCheckouts.set(checkoutId, {
          ...this.pendingCheckouts.get(checkoutId),
          stripeSessionId: session.id,
          url: session.url
        });

        this._trackEvent('checkout_created', { tier, email });

        return {
          success: true,
          checkoutId,
          sessionId: session.id,
          url: session.url,
          tier: tierConfig
        };
      } catch (error) {
        this._trackEvent('checkout_error', { tier, error: error.message });
        throw new Error(`Failed to create checkout: ${error.message}`);
      }
    }

    // Mock response for testing (no Stripe configured)
    const mockUrl = `https://checkout.stripe.com/test/${checkoutId}`;
    
    return {
      success: true,
      checkoutId,
      sessionId: `mock_session_${checkoutId}`,
      url: mockUrl,
      tier: tierConfig,
      _mock: true
    };
  }

  /**
   * Handle Stripe webhook for checkout completion
   * 
   * @param {string} payload - Raw webhook body
   * @param {string} signature - Stripe signature header
   * @returns {Object} Processing result
   */
  async handleStripeWebhook(payload, signature) {
    let event;

    // Verify webhook signature if Stripe configured
    if (this.stripe && this.webhookSecret) {
      try {
        event = this.stripe.webhooks.constructEvent(
          payload,
          signature,
          this.webhookSecret
        );
      } catch (err) {
        this._trackEvent('webhook_signature_failed', { error: err.message });
        throw new Error(`Webhook signature verification failed: ${err.message}`);
      }
    } else {
      // Parse raw payload for testing
      event = typeof payload === 'string' ? JSON.parse(payload) : payload;
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        return await this._handleCheckoutCompleted(event.data.object);
      
      case 'customer.subscription.created':
        return await this._handleSubscriptionCreated(event.data.object);
      
      case 'customer.subscription.updated':
        return await this._handleSubscriptionUpdated(event.data.object);
      
      case 'customer.subscription.deleted':
        return await this._handleSubscriptionCanceled(event.data.object);
      
      case 'invoice.payment_succeeded':
        return await this._handlePaymentSucceeded(event.data.object);
      
      case 'invoice.payment_failed':
        return await this._handlePaymentFailed(event.data.object);
      
      default:
        return { handled: false, eventType: event.type };
    }
  }

  /**
   * Handle successful checkout - main onboarding trigger
   */
  async _handleCheckoutCompleted(session) {
    const { customer_email, metadata, subscription, customer } = session;
    const { checkoutId, clientName, company, tier } = metadata || {};

    this._trackEvent('checkout_completed', { tier, email: customer_email });

    // Create client record
    const client = await this.createClient({
      email: customer_email,
      name: clientName,
      company,
      tier,
      stripeCustomerId: customer,
      stripeSubscriptionId: subscription,
      source: 'stripe_checkout',
      checkoutId
    });

    // Send welcome email
    await this.sendWelcomeEmail(client);

    // Update pending checkout status
    if (checkoutId && this.pendingCheckouts.has(checkoutId)) {
      this.pendingCheckouts.set(checkoutId, {
        ...this.pendingCheckouts.get(checkoutId),
        status: 'completed',
        clientId: client.id,
        completedAt: new Date().toISOString()
      });
    }

    return {
      handled: true,
      eventType: 'checkout.session.completed',
      client
    };
  }

  /**
   * Create a new client record
   */
  async createClient(params) {
    const {
      email,
      name,
      company,
      tier = 'starter',
      stripeCustomerId,
      stripeSubscriptionId,
      source = 'manual',
      checkoutId
    } = params;

    const clientId = `cli_${crypto.randomBytes(12).toString('hex')}`;
    const apiKey = `clk_${crypto.randomBytes(24).toString('hex')}`;
    const tierConfig = PRICING_TIERS[tier];

    const client = {
      id: clientId,
      email,
      name: name || email.split('@')[0],
      company: company || null,
      tier,
      status: 'active',
      apiKey,
      
      // Stripe info
      stripeCustomerId: stripeCustomerId || null,
      stripeSubscriptionId: stripeSubscriptionId || null,
      
      // Limits based on tier
      limits: {
        emailsPerMonth: tierConfig?.emailsPerMonth || 5000,
        campaignsActive: tier === 'conquest' ? -1 : (tier === 'growth' ? 5 : 1),
        warmupDomains: tier === 'conquest' ? -1 : (tier === 'growth' ? 10 : 3)
      },
      
      // Usage tracking
      usage: {
        emailsSentThisMonth: 0,
        campaignsActive: 0,
        lastResetDate: new Date().toISOString()
      },
      
      // Metadata
      source,
      checkoutId: checkoutId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      onboardedAt: null
    };

    // Store in memory (for dev) or database
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('clients')
        .insert([{
          id: client.id,
          email: client.email,
          name: client.name,
          company: client.company,
          tier: client.tier,
          status: client.status,
          api_key: client.apiKey,
          stripe_customer_id: client.stripeCustomerId,
          stripe_subscription_id: client.stripeSubscriptionId,
          limits: client.limits,
          usage: client.usage,
          source: client.source,
          created_at: client.createdAt
        }])
        .select()
        .single();

      if (error) {
        this._trackEvent('client_creation_failed', { error: error.message });
        throw new Error(`Failed to create client: ${error.message}`);
      }

      this._trackEvent('client_created', { clientId: client.id, tier });
      return { ...client, ...data };
    }

    // In-memory storage for testing
    this.clients.set(clientId, client);
    this._trackEvent('client_created', { clientId: client.id, tier });

    return client;
  }

  /**
   * Send welcome email with onboarding info
   */
  async sendWelcomeEmail(client) {
    const tierConfig = PRICING_TIERS[client.tier];
    
    const emailContent = {
      to: client.email,
      subject: `Welcome to Caesar's Legions, ${client.name}! 🏛️`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #8B4513 0%, #D4AF37 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .api-key { background: #2d2d2d; color: #00ff00; padding: 15px; border-radius: 4px; font-family: monospace; word-break: break-all; }
    .cta { display: inline-block; background: #8B4513; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .features { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .feature { padding: 8px 0; border-bottom: 1px solid #eee; }
    .feature:last-child { border-bottom: none; }
    ul { padding-left: 20px; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏛️ Caesar's Legions</h1>
      <p>Your conquest begins now!</p>
    </div>
    <div class="content">
      <h2>Welcome, ${client.name}!</h2>
      
      <p>You've joined the <strong>${tierConfig.name}</strong> plan. Your AI-powered cold email empire awaits.</p>
      
      <h3>🔑 Your API Key</h3>
      <p>Use this to authenticate with our API:</p>
      <div class="api-key">${client.apiKey}</div>
      <p><small>Keep this secret! You can regenerate it from your dashboard if compromised.</small></p>
      
      <h3>📋 What's Included</h3>
      <div class="features">
        ${tierConfig.features.map(f => `<div class="feature">✓ ${f}</div>`).join('')}
      </div>
      
      <h3>🚀 Getting Started</h3>
      <ol>
        <li><strong>Connect your domains</strong> - Add your sending domains in the dashboard</li>
        <li><strong>Upload your leads</strong> - CSV or API, your choice</li>
        <li><strong>Create your first campaign</strong> - AI writes personalized emails</li>
        <li><strong>Launch!</strong> - Watch the replies roll in</li>
      </ol>
      
      <a href="https://caesarslegions.com/dashboard" class="cta">Go to Dashboard →</a>
      
      <h3>📞 Need Help?</h3>
      <p>
        Reply to this email or reach out at <a href="mailto:support@caesarslegions.com">support@caesarslegions.com</a>
      </p>
      
      <p style="margin-top: 30px; color: #666;">
        <em>Veni. Vidi. Vici.</em><br>
        The Caesar's Legions Team
      </p>
    </div>
  </div>
</body>
</html>
      `,
      text: `
Welcome to Caesar's Legions, ${client.name}!

You've joined the ${tierConfig.name} plan.

YOUR API KEY
============
${client.apiKey}

Keep this secret! You can regenerate it from your dashboard if compromised.

WHAT'S INCLUDED
===============
${tierConfig.features.map(f => `✓ ${f}`).join('\n')}

GETTING STARTED
===============
1. Connect your domains - Add your sending domains in the dashboard
2. Upload your leads - CSV or API, your choice
3. Create your first campaign - AI writes personalized emails
4. Launch! - Watch the replies roll in

Go to Dashboard: https://caesarslegions.com/dashboard

Need Help?
Reply to this email or reach out at support@caesarslegions.com

Veni. Vidi. Vici.
The Caesar's Legions Team
      `
    };

    if (this.emailSender) {
      try {
        await this.emailSender.send(emailContent);
        this._trackEvent('welcome_email_sent', { clientId: client.id });
      } catch (error) {
        this._trackEvent('welcome_email_failed', { clientId: client.id, error: error.message });
        // Don't throw - welcome email failure shouldn't block onboarding
        console.error('Failed to send welcome email:', error);
      }
    }

    return emailContent;
  }

  /**
   * Get client by ID
   */
  async getClient(clientId) {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();

      if (error) return null;
      return data;
    }

    return this.clients.get(clientId) || null;
  }

  /**
   * Get client by API key
   */
  async getClientByApiKey(apiKey) {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('clients')
        .select('*')
        .eq('api_key', apiKey)
        .single();

      if (error) return null;
      return data;
    }

    for (const client of this.clients.values()) {
      if (client.apiKey === apiKey) return client;
    }
    return null;
  }

  /**
   * Get client by email
   */
  async getClientByEmail(email) {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('clients')
        .select('*')
        .eq('email', email)
        .single();

      if (error) return null;
      return data;
    }

    for (const client of this.clients.values()) {
      if (client.email === email) return client;
    }
    return null;
  }

  /**
   * Update client
   */
  async updateClient(clientId, updates) {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('clients')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', clientId)
        .select()
        .single();

      if (error) throw new Error(`Failed to update client: ${error.message}`);
      return data;
    }

    const client = this.clients.get(clientId);
    if (!client) throw new Error('Client not found');

    const updated = {
      ...client,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.clients.set(clientId, updated);
    return updated;
  }

  /**
   * Handle subscription created
   */
  async _handleSubscriptionCreated(subscription) {
    this._trackEvent('subscription_created', {
      subscriptionId: subscription.id,
      customerId: subscription.customer
    });
    return { handled: true, eventType: 'customer.subscription.created' };
  }

  /**
   * Handle subscription updated (upgrade/downgrade)
   */
  async _handleSubscriptionUpdated(subscription) {
    const client = await this._findClientByStripeCustomer(subscription.customer);
    if (!client) {
      return { handled: false, reason: 'Client not found' };
    }

    // Check for tier change
    const newTier = subscription.metadata?.tier;
    if (newTier && newTier !== client.tier) {
      await this.updateClient(client.id, {
        tier: newTier,
        limits: PRICING_TIERS[newTier]?.emailsPerMonth || client.limits
      });
      this._trackEvent('subscription_tier_changed', {
        clientId: client.id,
        oldTier: client.tier,
        newTier
      });
    }

    return { handled: true, eventType: 'customer.subscription.updated' };
  }

  /**
   * Handle subscription canceled
   */
  async _handleSubscriptionCanceled(subscription) {
    const client = await this._findClientByStripeCustomer(subscription.customer);
    if (client) {
      await this.updateClient(client.id, { status: 'canceled' });
      this._trackEvent('subscription_canceled', { clientId: client.id });
    }
    return { handled: true, eventType: 'customer.subscription.deleted' };
  }

  /**
   * Handle successful payment
   */
  async _handlePaymentSucceeded(invoice) {
    this._trackEvent('payment_succeeded', {
      customerId: invoice.customer,
      amount: invoice.amount_paid / 100
    });
    return { handled: true, eventType: 'invoice.payment_succeeded' };
  }

  /**
   * Handle failed payment
   */
  async _handlePaymentFailed(invoice) {
    const client = await this._findClientByStripeCustomer(invoice.customer);
    if (client) {
      await this.updateClient(client.id, { status: 'payment_failed' });
      this._trackEvent('payment_failed', {
        clientId: client.id,
        amount: invoice.amount_due / 100
      });
    }
    return { handled: true, eventType: 'invoice.payment_failed' };
  }

  /**
   * Find client by Stripe customer ID
   */
  async _findClientByStripeCustomer(customerId) {
    if (this.supabase) {
      const { data } = await this.supabase
        .from('clients')
        .select('*')
        .eq('stripe_customer_id', customerId)
        .single();
      return data;
    }

    for (const client of this.clients.values()) {
      if (client.stripeCustomerId === customerId) return client;
    }
    return null;
  }

  /**
   * Track metrics event
   */
  _trackEvent(event, data = {}) {
    if (this.metricsTracker) {
      this.metricsTracker.trackEvent('onboarding', event, data);
    }
  }

  /**
   * Get all clients (for dashboard)
   */
  async getAllClients(options = {}) {
    const { status, tier, limit = 100 } = options;

    if (this.supabase) {
      let query = this.supabase.from('clients').select('*');
      if (status) query = query.eq('status', status);
      if (tier) query = query.eq('tier', tier);
      query = query.limit(limit).order('created_at', { ascending: false });
      
      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch clients: ${error.message}`);
      return data;
    }

    let clients = Array.from(this.clients.values());
    if (status) clients = clients.filter(c => c.status === status);
    if (tier) clients = clients.filter(c => c.tier === tier);
    return clients.slice(0, limit);
  }

  /**
   * Get onboarding stats
   */
  async getStats() {
    const clients = await this.getAllClients({});
    
    const stats = {
      total: clients.length,
      active: clients.filter(c => c.status === 'active').length,
      byTier: {
        starter: clients.filter(c => c.tier === 'starter').length,
        growth: clients.filter(c => c.tier === 'growth').length,
        conquest: clients.filter(c => c.tier === 'conquest').length
      },
      mrr: clients.reduce((sum, c) => {
        if (c.status !== 'active') return sum;
        const tier = PRICING_TIERS[c.tier];
        return sum + (tier?.price || 0);
      }, 0),
      pendingCheckouts: this.pendingCheckouts.size
    };

    return stats;
  }
}

// Export for use
module.exports = {
  ClientOnboardingManager,
  PRICING_TIERS
};
