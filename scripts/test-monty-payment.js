#!/usr/bin/env node
/**
 * Test MontyPay integration
 * Creates a payment link for Caesar's Legions Tier 1
 */

const monty = require('../lib/monty-integration');

async function test() {
  console.log('🧪 Testing MontyPay Integration\n');
  console.log('Creating payment link for Tier 1 ($297/month)...\n');

  const result = await monty.createPaymentLink(
    1, // Tier 1
    'test@example.com',
    'Test Client'
  );

  if (result.success) {
    console.log('✅ SUCCESS!\n');
    console.log('Payment URL:', result.payment_url);
    console.log('Session ID:', result.session_id);
    console.log('\nClient can visit this URL to complete payment.');
  } else {
    console.log('❌ FAILED\n');
    console.log('Error:', result.error);
    console.log('\nCheck:');
    console.log('1. MONTY_MERCHANT_ID is set in .env');
    console.log('2. MONTY_API_KEY is set in .env');
    console.log('3. MONTY_SECRET_KEY is set in .env');
    console.log('4. API keys are correct (check MontyPay dashboard)');
  }
}

test();
