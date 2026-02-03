#!/usr/bin/env node
/**
 * API Key Checker
 * Validates all required API keys and tests connections
 * 
 * Usage: node scripts/check-api-keys.js
 */

require('dotenv').config();
const https = require('https');

const API_KEYS = {
  required: [
    {
      name: 'OPENAI_API_KEY',
      env: 'OPENAI_API_KEY',
      description: 'OpenAI API for email generation',
      testUrl: 'https://api.openai.com/v1/models',
      cost: '$20 free credit',
      link: 'https://platform.openai.com/api-keys'
    }
  ],
  optional: [
    {
      name: 'APOLLO_API_KEY',
      env: 'APOLLO_API_KEY',
      description: 'Apollo.io for contact enrichment',
      testUrl: 'https://api.apollo.io/v1/auth/health',
      cost: 'Free tier (50 credits/month)',
      link: 'https://app.apollo.io/#/settings/integrations/api'
    },
    {
      name: 'INSTANTLY_API_KEY',
      env: 'INSTANTLY_API_KEY',
      description: 'Instantly.ai for email sending',
      testUrl: null, // No public test endpoint
      cost: '$37/month',
      link: 'https://app.instantly.ai/app/settings/api'
    },
    {
      name: 'BIRD_CLI_COOKIES',
      env: 'BIRD_CLI_COOKIES',
      description: 'X/Twitter for lead scraping',
      testUrl: null,
      cost: 'Free',
      link: 'https://twitter.com (use EditThisCookie extension)'
    },
    {
      name: 'STRIPE_SECRET_KEY',
      env: 'STRIPE_SECRET_KEY',
      description: 'Stripe for payments',
      testUrl: 'https://api.stripe.com/v1/balance',
      cost: 'Free (2.9% + 30¢ per transaction)',
      link: 'https://dashboard.stripe.com/apikeys'
    }
  ]
};

function testApiKey(config) {
  return new Promise((resolve) => {
    const value = process.env[config.env];
    
    if (!value) {
      resolve({ ...config, status: 'missing', valid: false });
      return;
    }

    if (!config.testUrl) {
      resolve({ 
        ...config, 
        status: 'present', 
        valid: null, 
        note: 'Cannot test (no test endpoint)' 
      });
      return;
    }

    // Test the API key
    const url = new URL(config.testUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {}
    };

    // Add auth header based on API
    if (config.env === 'OPENAI_API_KEY') {
      options.headers['Authorization'] = `Bearer ${value}`;
    } else if (config.env === 'APOLLO_API_KEY') {
      options.headers['X-Api-Key'] = value;
    } else if (config.env === 'STRIPE_SECRET_KEY') {
      options.headers['Authorization'] = `Bearer ${value}`;
    }

    const req = https.request(options, (res) => {
      if (res.statusCode === 200 || res.statusCode === 401) {
        resolve({ 
          ...config, 
          status: res.statusCode === 200 ? 'valid' : 'invalid',
          valid: res.statusCode === 200 
        });
      } else {
        resolve({ 
          ...config, 
          status: 'error', 
          valid: false,
          error: `HTTP ${res.statusCode}` 
        });
      }
    });

    req.on('error', (error) => {
      resolve({ 
        ...config, 
        status: 'error', 
        valid: false,
        error: error.message 
      });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ 
        ...config, 
        status: 'timeout', 
        valid: false,
        error: 'Request timeout' 
      });
    });

    req.end();
  });
}

async function checkAllKeys() {
  console.log('🔍 Checking API Keys');
  console.log('=' .repeat(60));
  console.log('');

  // Check required keys
  console.log('✅ REQUIRED KEYS:\n');
  const requiredResults = await Promise.all(
    API_KEYS.required.map(config => testApiKey(config))
  );

  let allRequiredValid = true;
  for (const result of requiredResults) {
    const icon = result.status === 'missing' ? '❌' : 
                 result.status === 'valid' ? '✅' : 
                 result.status === 'present' ? '⚠️' : '❌';
    
    console.log(`${icon} ${result.name}`);
    console.log(`   ${result.description}`);
    
    if (result.status === 'missing') {
      console.log(`   Status: NOT CONFIGURED`);
      console.log(`   Cost: ${result.cost}`);
      console.log(`   Get it: ${result.link}`);
      allRequiredValid = false;
    } else if (result.status === 'valid') {
      console.log(`   Status: VALID ✓`);
    } else if (result.status === 'present') {
      console.log(`   Status: PRESENT (not tested)`);
      console.log(`   Note: ${result.note}`);
    } else {
      console.log(`   Status: ERROR - ${result.error || 'Invalid key'}`);
      allRequiredValid = false;
    }
    console.log('');
  }

  // Check optional keys
  console.log('⚙️  OPTIONAL KEYS:\n');
  const optionalResults = await Promise.all(
    API_KEYS.optional.map(config => testApiKey(config))
  );

  for (const result of optionalResults) {
    const icon = result.status === 'missing' ? '⚪' : 
                 result.status === 'valid' ? '✅' : 
                 result.status === 'present' ? '⚠️' : '❌';
    
    console.log(`${icon} ${result.name}`);
    console.log(`   ${result.description}`);
    
    if (result.status === 'missing') {
      console.log(`   Status: Not configured (optional)`);
      console.log(`   Cost: ${result.cost}`);
      console.log(`   Get it: ${result.link}`);
    } else if (result.status === 'valid') {
      console.log(`   Status: VALID ✓`);
    } else if (result.status === 'present') {
      console.log(`   Status: PRESENT (not tested)`);
      console.log(`   Note: ${result.note}`);
    } else {
      console.log(`   Status: ERROR - ${result.error || 'Invalid key'}`);
    }
    console.log('');
  }

  // Summary
  console.log('=' .repeat(60));
  const requiredValid = requiredResults.filter(r => r.status === 'valid' || r.status === 'present').length;
  const optionalValid = optionalResults.filter(r => r.status === 'valid' || r.status === 'present').length;

  console.log('📊 SUMMARY:');
  console.log(`   Required: ${requiredValid}/${API_KEYS.required.length} configured`);
  console.log(`   Optional: ${optionalValid}/${API_KEYS.optional.length} configured`);
  console.log('');

  if (allRequiredValid) {
    console.log('✅ All required API keys are configured!');
    console.log('   You can now run: node scripts/e2e-test.js');
  } else {
    console.log('❌ Missing required API keys');
    console.log('   Add them to .env file before testing');
  }

  console.log('');
  console.log('💡 Next steps:');
  console.log('   1. Add missing keys to .env file');
  console.log('   2. Run this script again to verify');
  console.log('   3. Run: node scripts/e2e-test.js');
  console.log('   4. Follow: DEPLOYMENT-GUIDE.md');
  console.log('');

  return allRequiredValid;
}

// Run check
checkAllKeys()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
