#!/usr/bin/env node
// ============================================================================
// ENVIRONMENT VALIDATOR - Caesar's Legions
// ============================================================================
// Purpose: Validate all required environment variables before deployment
// Usage: node scripts/validate-env.js
// ============================================================================

const fs = require('fs');
const path = require('path');

// Load .env file
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

console.log(`
╔════════════════════════════════════════════════════════════╗
║     🏛️ CAESAR'S LEGIONS - ENVIRONMENT VALIDATOR 🏛️         ║
╚════════════════════════════════════════════════════════════╝
`);

// Environment variable requirements
const REQUIRED_VARS = {
  // Core API Keys
  OPENAI_API_KEY: {
    desc: 'OpenAI API key for email generation',
    critical: true,
    validate: (v) => v?.startsWith('sk-'),
    hint: 'Get from: https://platform.openai.com/api-keys'
  },
  
  // Stripe (Payments)
  STRIPE_SECRET_KEY: {
    desc: 'Stripe secret key for payments',
    critical: true,
    validate: (v) => v?.startsWith('sk_'),
    hint: 'Get from: https://dashboard.stripe.com/apikeys'
  },
  STRIPE_WEBHOOK_SECRET: {
    desc: 'Stripe webhook signing secret',
    critical: true,
    validate: (v) => v?.startsWith('whsec_'),
    hint: 'Get from Stripe webhook settings'
  },
  STRIPE_PRICE_STARTER: {
    desc: 'Stripe price ID for Starter tier ($297)',
    critical: true,
    validate: (v) => v?.startsWith('price_'),
    hint: 'Create product in Stripe Dashboard'
  },
  STRIPE_PRICE_GROWTH: {
    desc: 'Stripe price ID for Growth tier ($597)',
    critical: false,
    validate: (v) => !v || v?.startsWith('price_'),
    hint: 'Create product in Stripe Dashboard'
  },
  STRIPE_PRICE_CONQUEST: {
    desc: 'Stripe price ID for Conquest tier ($1497)',
    critical: false,
    validate: (v) => !v || v?.startsWith('price_'),
    hint: 'Create product in Stripe Dashboard'
  },
  
  // Supabase (Database)
  SUPABASE_URL: {
    desc: 'Supabase project URL',
    critical: true,
    validate: (v) => v?.includes('supabase.co'),
    hint: 'Get from: https://supabase.com/dashboard/project/[project]/settings/api'
  },
  SUPABASE_ANON_KEY: {
    desc: 'Supabase anonymous key',
    critical: true,
    validate: (v) => v?.startsWith('eyJ'),
    hint: 'Get from Supabase project settings'
  },
  
  // Instantly.ai (Email sending)
  INSTANTLY_API_KEY: {
    desc: 'Instantly.ai API key',
    critical: false,
    validate: (v) => v?.length > 20,
    hint: 'Get from: https://app.instantly.ai/settings/integrations'
  },
  INSTANTLY_WEBHOOK_SECRET: {
    desc: 'Instantly webhook verification secret',
    critical: false,
    validate: (v) => v?.length >= 16,
    hint: 'Set when configuring webhooks in Instantly'
  },
  
  // Application URLs
  APP_URL: {
    desc: 'Public URL of the application',
    critical: true,
    validate: (v) => v?.startsWith('http'),
    hint: 'e.g., https://caesars-legions.railway.app'
  },
  
  // Optional
  PORT: {
    desc: 'Server port',
    critical: false,
    validate: (v) => !v || parseInt(v) > 0,
    hint: 'Default: 3001'
  }
};

let passed = 0;
let failed = 0;
let warnings = 0;

const results = [];

for (const [varName, config] of Object.entries(REQUIRED_VARS)) {
  const value = process.env[varName];
  const exists = !!value;
  const valid = config.validate(value);
  
  let status, icon;
  
  if (exists && valid) {
    status = 'OK';
    icon = '✅';
    passed++;
  } else if (config.critical) {
    status = 'MISSING';
    icon = '❌';
    failed++;
  } else {
    status = 'OPTIONAL';
    icon = '⚠️';
    warnings++;
  }
  
  results.push({ varName, config, status, icon, value: exists ? '[SET]' : '[NOT SET]' });
}

// Print results
console.log('Environment Variables Status:');
console.log('─'.repeat(60));

for (const r of results) {
  const valueDisplay = r.status === 'OK' ? '✓ configured' : r.config.hint;
  console.log(`${r.icon} ${r.varName.padEnd(25)} ${r.status.padEnd(10)}`);
  if (r.status !== 'OK') {
    console.log(`   └─ ${r.config.desc}`);
    console.log(`   └─ ${r.config.hint}`);
  }
}

console.log('─'.repeat(60));
console.log(`\nSummary: ${passed} passed | ${failed} critical missing | ${warnings} optional missing\n`);

// Deployment readiness
if (failed === 0) {
  console.log('✅ DEPLOYMENT READY - All critical variables configured!\n');
  console.log('Next steps:');
  console.log('  1. Run tests: npm test');
  console.log('  2. Start server: npm start');
  console.log('  3. Deploy: railway up\n');
  process.exit(0);
} else {
  console.log('❌ NOT READY - Missing critical environment variables\n');
  console.log('Please configure the missing variables in your .env file or Railway environment.\n');
  
  // Generate .env template for missing vars
  const missing = results.filter(r => r.status === 'MISSING');
  console.log('Add to .env:');
  console.log('─'.repeat(40));
  for (const m of missing) {
    console.log(`${m.varName}=your_${m.varName.toLowerCase()}_here`);
  }
  console.log('─'.repeat(40));
  
  process.exit(1);
}
