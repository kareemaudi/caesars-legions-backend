#!/usr/bin/env node

const db = require('../lib/db');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, answer => resolve(answer));
  });
}

async function onboardClient() {
  console.log('\n🏛️  CAESAR\'S LEGIONS - Client Onboarding\n');
  
  const email = await question('Client email: ');
  const name = await question('Client name: ');
  const company = await question('Company name: ');
  const target_audience = await question('Target audience (e.g., B2B SaaS founders): ');
  const value_prop = await question('Value proposition (1 sentence): ');
  const website = await question('Website (optional): ');
  
  try {
    const result = db.insertClient({
      email,
      name,
      company,
      target_audience,
      value_prop,
      website: website || null
    });
    
    console.log(`\n✅ Client onboarded! ID: ${result.lastInsertRowid}`);
    console.log('\nNext steps:');
    console.log('1. Run campaign: node scripts/run-campaign.js ' + result.lastInsertRowid);
    console.log('\n');
  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n');
  }
  
  rl.close();
}

onboardClient();
