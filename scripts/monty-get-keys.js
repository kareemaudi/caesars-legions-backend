#!/usr/bin/env node
/**
 * Login to MontyPay and retrieve API keys
 * Uses credentials: cmonkeytribe / w@rsf3M3fS
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const MERCHANT_LOGIN_URL = 'https://portal.montypay.com/api/login'; // Update if different
const DASHBOARD_URL = 'https://portal.montypay.com';

async function loginAndGetKeys() {
  console.log('🔐 Logging into MontyPay merchant dashboard...\n');
  
  const credentials = {
    username: 'cmonkeytribe',
    password: 'w@rsf3M3fS'
  };

  try {
    // Step 1: Login
    console.log('Attempting login...');
    const loginResponse = await axios.post(MERCHANT_LOGIN_URL, credentials, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (loginResponse.data.token || loginResponse.data.access_token) {
      const token = loginResponse.data.token || loginResponse.data.access_token;
      console.log('✅ Login successful!');
      console.log('Token:', token.substring(0, 20) + '...\n');

      // Step 2: Fetch API keys
      console.log('Fetching API keys...');
      const keysResponse = await axios.get(`${DASHBOARD_URL}/api/settings/keys`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const apiKeys = keysResponse.data;
      console.log('✅ API Keys retrieved!\n');
      console.log('Merchant ID:', apiKeys.merchant_id);
      console.log('API Key (Public):', apiKeys.public_key);
      console.log('Secret Key:', apiKeys.secret_key?.substring(0, 20) + '...');

      // Step 3: Save to .env
      const envPath = path.join(__dirname, '..', '.env');
      let envContent = fs.readFileSync(envPath, 'utf8');

      // Add Monty keys
      if (!envContent.includes('MONTY_MERCHANT_ID')) {
        envContent += `\n# MontyPay Configuration\n`;
        envContent += `MONTY_MERCHANT_ID=${apiKeys.merchant_id}\n`;
        envContent += `MONTY_API_KEY=${apiKeys.public_key}\n`;
        envContent += `MONTY_SECRET_KEY=${apiKeys.secret_key}\n`;
      }

      fs.writeFileSync(envPath, envContent);
      console.log('\n✅ Keys saved to .env file');
      console.log('\nReady to integrate MontyPay payments! 🎉');

    } else {
      console.error('❌ Login failed: No token in response');
      console.error('Response:', loginResponse.data);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      
      if (error.response.status === 404) {
        console.log('\n💡 Login endpoint may be different.');
        console.log('Manual steps:');
        console.log('1. Visit:', DASHBOARD_URL);
        console.log('2. Login with: cmonkeytribe / w@rsf3M3fS');
        console.log('3. Navigate to Settings > API Keys');
        console.log('4. Copy:');
        console.log('   - Merchant ID');
        console.log('   - API Key (Public)');
        console.log('   - Secret Key');
        console.log('5. Add to .env file:');
        console.log('   MONTY_MERCHANT_ID=...');
        console.log('   MONTY_API_KEY=...');
        console.log('   MONTY_SECRET_KEY=...');
      }
    }
  }
}

loginAndGetKeys();
