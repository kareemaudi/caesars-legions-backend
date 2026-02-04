/**
 * Tests for Client Onboarding System
 */

const { ClientOnboardingManager, PRICING_TIERS } = require('../lib/client-onboarding.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertTruthy(value, message) {
  if (!value) {
    throw new Error(`${message}: expected truthy value`);
  }
}

function assertIncludes(str, substr, message) {
  if (!str.includes(substr)) {
    throw new Error(`${message}: expected "${str}" to include "${substr}"`);
  }
}

async function runTests() {
  console.log('\n=== Client Onboarding Tests ===\n');

  const manager = new ClientOnboardingManager();

  // Pricing tier tests
  test('PRICING_TIERS has 3 tiers', () => {
    assertEqual(Object.keys(PRICING_TIERS).length, 3, 'Tier count');
  });

  test('Starter tier has correct price', () => {
    assertEqual(PRICING_TIERS.starter.price, 297, 'Starter price');
  });

  test('Growth tier has correct price', () => {
    assertEqual(PRICING_TIERS.growth.price, 597, 'Growth price');
  });

  test('Conquest tier has correct price', () => {
    assertEqual(PRICING_TIERS.conquest.price, 1497, 'Conquest price');
  });

  test('getPricingTiers returns all tiers', () => {
    const tiers = manager.getPricingTiers();
    assertEqual(tiers.length, 3, 'Tier count');
  });

  test('getTier returns correct tier', () => {
    const tier = manager.getTier('growth');
    assertEqual(tier.name, 'Growth Legion', 'Tier name');
  });

  test('getTier returns null for invalid tier', () => {
    const tier = manager.getTier('invalid');
    assertEqual(tier, null, 'Invalid tier');
  });

  // Checkout session tests
  test('createCheckoutSession creates mock session without Stripe', async () => {
    const result = await manager.createCheckoutSession({
      email: 'test@example.com',
      name: 'Test User',
      company: 'Test Corp',
      tier: 'starter'
    });
    
    assertTruthy(result.success, 'Success');
    assertTruthy(result.checkoutId, 'Has checkout ID');
    assertTruthy(result.url, 'Has URL');
    assertEqual(result._mock, true, 'Is mock');
  });

  test('createCheckoutSession requires email', async () => {
    try {
      await manager.createCheckoutSession({ name: 'Test', tier: 'starter' });
      throw new Error('Should have thrown');
    } catch (err) {
      assertIncludes(err.message, 'Email is required', 'Error message');
    }
  });

  test('createCheckoutSession rejects invalid tier', async () => {
    try {
      await manager.createCheckoutSession({ email: 'test@example.com', tier: 'invalid' });
      throw new Error('Should have thrown');
    } catch (err) {
      assertIncludes(err.message, 'Invalid tier', 'Error message');
    }
  });

  test('createCheckoutSession stores pending checkout', async () => {
    const sizeBefore = manager.pendingCheckouts.size;
    await manager.createCheckoutSession({
      email: 'pending@example.com',
      tier: 'growth'
    });
    assertEqual(manager.pendingCheckouts.size, sizeBefore + 1, 'Pending checkout stored');
  });

  // Client creation tests
  test('createClient creates client with correct fields', async () => {
    const client = await manager.createClient({
      email: 'new@example.com',
      name: 'New Client',
      company: 'New Corp',
      tier: 'starter'
    });

    assertTruthy(client.id.startsWith('cli_'), 'Client ID prefix');
    assertEqual(client.email, 'new@example.com', 'Email');
    assertEqual(client.name, 'New Client', 'Name');
    assertEqual(client.company, 'New Corp', 'Company');
    assertEqual(client.tier, 'starter', 'Tier');
    assertEqual(client.status, 'active', 'Status');
    assertTruthy(client.apiKey.startsWith('clk_'), 'API key prefix');
  });

  test('createClient sets correct limits for starter', async () => {
    const client = await manager.createClient({
      email: 'starter@example.com',
      tier: 'starter'
    });

    assertEqual(client.limits.emailsPerMonth, 5000, 'Emails per month');
    assertEqual(client.limits.campaignsActive, 1, 'Campaigns active');
    assertEqual(client.limits.warmupDomains, 3, 'Warmup domains');
  });

  test('createClient sets correct limits for growth', async () => {
    const client = await manager.createClient({
      email: 'growth@example.com',
      tier: 'growth'
    });

    assertEqual(client.limits.emailsPerMonth, 15000, 'Emails per month');
    assertEqual(client.limits.campaignsActive, 5, 'Campaigns active');
    assertEqual(client.limits.warmupDomains, 10, 'Warmup domains');
  });

  test('createClient sets correct limits for conquest', async () => {
    const client = await manager.createClient({
      email: 'conquest@example.com',
      tier: 'conquest'
    });

    assertEqual(client.limits.emailsPerMonth, 50000, 'Emails per month');
    assertEqual(client.limits.campaignsActive, -1, 'Campaigns unlimited');
    assertEqual(client.limits.warmupDomains, -1, 'Warmup domains unlimited');
  });

  test('createClient generates unique API keys', async () => {
    const client1 = await manager.createClient({ email: 'unique1@example.com' });
    const client2 = await manager.createClient({ email: 'unique2@example.com' });
    
    if (client1.apiKey === client2.apiKey) {
      throw new Error('API keys should be unique');
    }
  });

  // Client retrieval tests
  test('getClient retrieves stored client', async () => {
    const created = await manager.createClient({
      email: 'retrieve@example.com',
      name: 'Retrieve Test'
    });

    const retrieved = await manager.getClient(created.id);
    assertEqual(retrieved.email, 'retrieve@example.com', 'Email matches');
  });

  test('getClient returns null for non-existent client', async () => {
    const client = await manager.getClient('cli_nonexistent');
    assertEqual(client, null, 'Should be null');
  });

  test('getClientByApiKey retrieves by API key', async () => {
    const created = await manager.createClient({
      email: 'apikey@example.com'
    });

    const retrieved = await manager.getClientByApiKey(created.apiKey);
    assertEqual(retrieved.id, created.id, 'ID matches');
  });

  test('getClientByEmail retrieves by email', async () => {
    const created = await manager.createClient({
      email: 'byemail@example.com'
    });

    const retrieved = await manager.getClientByEmail('byemail@example.com');
    assertEqual(retrieved.id, created.id, 'ID matches');
  });

  // Update client tests
  test('updateClient updates client fields', async () => {
    const created = await manager.createClient({
      email: 'update@example.com'
    });

    const updated = await manager.updateClient(created.id, {
      name: 'Updated Name',
      company: 'Updated Corp'
    });

    assertEqual(updated.name, 'Updated Name', 'Name updated');
    assertEqual(updated.company, 'Updated Corp', 'Company updated');
    assertTruthy(updated.updatedAt > created.createdAt, 'UpdatedAt changed');
  });

  test('updateClient throws for non-existent client', async () => {
    try {
      await manager.updateClient('cli_nonexistent', { name: 'Test' });
      throw new Error('Should have thrown');
    } catch (err) {
      assertIncludes(err.message, 'Client not found', 'Error message');
    }
  });

  // Welcome email tests
  test('sendWelcomeEmail generates correct content', async () => {
    const client = await manager.createClient({
      email: 'welcome@example.com',
      name: 'Welcome Test',
      tier: 'growth'
    });

    const email = await manager.sendWelcomeEmail(client);
    
    assertIncludes(email.subject, "Caesar's Legions", 'Subject includes brand');
    assertIncludes(email.html, client.apiKey, 'HTML includes API key');
    assertIncludes(email.html, 'Growth Legion', 'HTML includes tier name');
    assertIncludes(email.text, client.apiKey, 'Text includes API key');
  });

  // Webhook handling tests
  test('handleStripeWebhook processes checkout.session.completed', async () => {
    const manager2 = new ClientOnboardingManager();
    
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer_email: 'webhook@example.com',
          customer: 'cus_test123',
          subscription: 'sub_test123',
          metadata: {
            checkoutId: 'chk_test',
            clientName: 'Webhook Test',
            company: 'Webhook Corp',
            tier: 'starter'
          }
        }
      }
    };

    const result = await manager2.handleStripeWebhook(JSON.stringify(event));
    
    assertEqual(result.handled, true, 'Was handled');
    assertEqual(result.eventType, 'checkout.session.completed', 'Event type');
    assertTruthy(result.client, 'Has client');
    assertEqual(result.client.email, 'webhook@example.com', 'Client email');
  });

  test('handleStripeWebhook handles subscription.deleted', async () => {
    // Create a client first
    const client = await manager.createClient({
      email: 'cancel@example.com',
      stripeCustomerId: 'cus_cancel123'
    });

    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          customer: 'cus_cancel123'
        }
      }
    };

    const result = await manager.handleStripeWebhook(JSON.stringify(event));
    assertEqual(result.handled, true, 'Was handled');

    // Check client status updated
    const updated = await manager.getClient(client.id);
    assertEqual(updated.status, 'canceled', 'Status is canceled');
  });

  test('handleStripeWebhook handles payment_failed', async () => {
    const client = await manager.createClient({
      email: 'failed@example.com',
      stripeCustomerId: 'cus_failed123'
    });

    const event = {
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_failed123',
          amount_due: 29700
        }
      }
    };

    const result = await manager.handleStripeWebhook(JSON.stringify(event));
    assertEqual(result.handled, true, 'Was handled');

    const updated = await manager.getClient(client.id);
    assertEqual(updated.status, 'payment_failed', 'Status is payment_failed');
  });

  test('handleStripeWebhook returns unhandled for unknown events', async () => {
    const event = {
      type: 'some.unknown.event',
      data: { object: {} }
    };

    const result = await manager.handleStripeWebhook(JSON.stringify(event));
    assertEqual(result.handled, false, 'Not handled');
  });

  // Stats tests
  test('getStats returns correct metrics', async () => {
    const manager3 = new ClientOnboardingManager();
    
    // Create clients of different tiers
    await manager3.createClient({ email: 's1@example.com', tier: 'starter' });
    await manager3.createClient({ email: 's2@example.com', tier: 'starter' });
    await manager3.createClient({ email: 'g1@example.com', tier: 'growth' });
    await manager3.createClient({ email: 'c1@example.com', tier: 'conquest' });

    const stats = await manager3.getStats();
    
    assertEqual(stats.total, 4, 'Total clients');
    assertEqual(stats.active, 4, 'Active clients');
    assertEqual(stats.byTier.starter, 2, 'Starter count');
    assertEqual(stats.byTier.growth, 1, 'Growth count');
    assertEqual(stats.byTier.conquest, 1, 'Conquest count');
    // MRR: 2*297 + 1*597 + 1*1497 = 2688
    assertEqual(stats.mrr, 2688, 'MRR calculation');
  });

  // getAllClients tests
  test('getAllClients filters by status', async () => {
    const manager4 = new ClientOnboardingManager();
    
    await manager4.createClient({ email: 'active1@example.com' });
    const canceled = await manager4.createClient({ email: 'canceled1@example.com' });
    await manager4.updateClient(canceled.id, { status: 'canceled' });

    const activeClients = await manager4.getAllClients({ status: 'active' });
    assertEqual(activeClients.length, 1, 'Only active clients');
    assertEqual(activeClients[0].email, 'active1@example.com', 'Correct email');
  });

  test('getAllClients filters by tier', async () => {
    const manager5 = new ClientOnboardingManager();
    
    await manager5.createClient({ email: 't1@example.com', tier: 'starter' });
    await manager5.createClient({ email: 't2@example.com', tier: 'growth' });
    await manager5.createClient({ email: 't3@example.com', tier: 'growth' });

    const growthClients = await manager5.getAllClients({ tier: 'growth' });
    assertEqual(growthClients.length, 2, 'Growth clients count');
  });

  // Metrics integration test
  test('Metrics tracker integration works', async () => {
    const events = [];
    const mockTracker = {
      trackEvent: (category, event, data) => {
        events.push({ category, event, data });
      }
    };

    const manager6 = new ClientOnboardingManager({
      metricsTracker: mockTracker
    });

    await manager6.createClient({ email: 'tracked@example.com', tier: 'starter' });

    const createEvent = events.find(e => e.event === 'client_created');
    assertTruthy(createEvent, 'Client created event tracked');
    assertEqual(createEvent.category, 'onboarding', 'Category is onboarding');
    assertEqual(createEvent.data.tier, 'starter', 'Tier in event data');
  });

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
