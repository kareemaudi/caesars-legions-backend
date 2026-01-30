#!/usr/bin/env node
/**
 * Read cookies from Chrome SQLite database
 * Direct file reading approach
 */

const fs = require('fs');
const path = require('path');

const cookieFile = path.join(__dirname, '..', 'chrome-cookies.db');

if (!fs.existsSync(cookieFile)) {
  console.error('Cookie file not found:', cookieFile);
  process.exit(1);
}

// Read the SQLite file as binary and search for cookie values
const buffer = fs.readFileSync(cookieFile);
const content = buffer.toString('latin1'); // Use latin1 to preserve binary data

// Look for auth_token and ct0 patterns
const authTokenMatch = content.match(/auth_token[\x00-\xFF]{0,100}?([a-f0-9]{40,})/);
const ct0Match = content.match(/ct0[\x00-\xFF]{0,100}?([a-f0-9]{32,})/);

if (authTokenMatch && ct0Match) {
  const authToken = authTokenMatch[1];
  const ct0 = ct0Match[1];
  
  console.log('✅ Cookies found!\n');
  console.log('AUTH_TOKEN:', authToken.substring(0, 20) + '...');
  console.log('CT0:', ct0.substring(0, 20) + '...\n');
  
  // Save to .env
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  
  envContent = envContent.replace(/^AUTH_TOKEN=.*/gm, '');
  envContent = envContent.replace(/^CT0=.*/gm, '');
  
  envContent += `\n# Twitter cookies (extracted ${new Date().toISOString()})\n`;
  envContent += `AUTH_TOKEN=${authToken}\n`;
  envContent += `CT0=${ct0}\n`;
  
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Saved to .env\n');
  
  // Output for shell
  console.log('To test:');
  console.log(`$env:AUTH_TOKEN="${authToken}"`);
  console.log(`$env:CT0="${ct0}"`);
  console.log('bird whoami\n');
  
} else {
  console.log('❌ Could not find cookies in database');
  console.log('auth_token found:', !!authTokenMatch);
  console.log('ct0 found:', !!ct0Match);
}
