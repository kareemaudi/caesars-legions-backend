#!/usr/bin/env node
/**
 * Extract Twitter cookies from Chrome
 * Works around the SQLite "value too large" issue
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Chrome cookie paths
const CHROME_COOKIES = 'C:\\Users\\Asus\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Network\\Cookies';
const TEMP_COOKIES = 'C:\\Users\\Asus\\AppData\\Local\\Temp\\chrome-cookies-temp.db';

async function extractCookies() {
  try {
    console.log('🍪 Extracting Twitter cookies from Chrome...\n');

    // Copy cookies DB to temp (Chrome must be closed)
    if (fs.existsSync(TEMP_COOKIES)) {
      fs.unlinkSync(TEMP_COOKIES);
    }
    
    try {
      fs.copyFileSync(CHROME_COOKIES, TEMP_COOKIES);
    } catch (error) {
      console.error('❌ Could not copy Chrome cookies DB');
      console.error('   Chrome is likely running. Close Chrome and try again.\n');
      process.exit(1);
    }

    // Query using sqlite3 CLI
    const query = `SELECT name, value FROM cookies WHERE host_key LIKE '%x.com%' AND (name = 'auth_token' OR name = 'ct0');`;
    
    let output;
    try {
      output = execSync(`sqlite3 "${TEMP_COOKIES}" "${query}"`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      // Try with different approach - read file directly
      console.log('⚠️ sqlite3 not found, trying alternative method...\n');
      return extractCookiesManual();
    }

    // Parse output
    const lines = output.trim().split('\n');
    const cookies = {};
    
    for (const line of lines) {
      const [name, value] = line.split('|');
      if (name && value) {
        cookies[name] = value;
      }
    }

    if (cookies.auth_token && cookies.ct0) {
      console.log('✅ Cookies extracted successfully!\n');
      console.log('AUTH_TOKEN:', cookies.auth_token.substring(0, 20) + '...');
      console.log('CT0:', cookies.ct0.substring(0, 20) + '...\n');

      // Save to .env
      const envPath = path.join(__dirname, '..', '.env');
      let envContent = '';
      
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
        // Remove old values
        envContent = envContent.replace(/^AUTH_TOKEN=.*/gm, '');
        envContent = envContent.replace(/^CT0=.*/gm, '');
      }

      envContent += `\n# Twitter cookies (extracted ${new Date().toISOString()})\n`;
      envContent += `AUTH_TOKEN=${cookies.auth_token}\n`;
      envContent += `CT0=${cookies.ct0}\n`;

      fs.writeFileSync(envPath, envContent);
      console.log('✅ Saved to .env file\n');

      // Test with bird
      console.log('Testing with bird CLI...\n');
      try {
        const result = execSync('bird whoami', {
          encoding: 'utf8',
          env: { ...process.env, AUTH_TOKEN: cookies.auth_token, CT0: cookies.ct0 }
        });
        console.log(result);
        console.log('\n✅ Bird CLI authenticated successfully!\n');
      } catch (error) {
        console.log('⚠️ Bird test failed, but cookies are saved to .env\n');
      }

      return cookies;
    } else {
      console.error('❌ Could not find auth_token or ct0 in cookies\n');
      return null;
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  } finally {
    // Cleanup
    if (fs.existsSync(TEMP_COOKIES)) {
      fs.unlinkSync(TEMP_COOKIES);
    }
  }
}

function extractCookiesManual() {
  console.log('📋 Manual extraction required:\n');
  console.log('1. Open Chrome and go to x.com');
  console.log('2. Press F12 (DevTools)');
  console.log('3. Go to: Application → Cookies → https://x.com');
  console.log('4. Find and copy these values:');
  console.log('   - auth_token');
  console.log('   - ct0\n');
  console.log('5. Run:');
  console.log('   $env:AUTH_TOKEN="your_auth_token"');
  console.log('   $env:CT0="your_ct0"');
  console.log('   bird whoami\n');
  process.exit(1);
}

if (require.main === module) {
  extractCookies();
}

module.exports = { extractCookies };
