#!/usr/bin/env node
/**
 * Extract Twitter cookies using Puppeteer
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function extractCookies() {
  console.log('🍪 Extracting Twitter cookies using Puppeteer...\n');

  const userDataDir = 'C:\\Users\\Asus\\AppData\\Local\\Google\\Chrome\\User Data';
  
  let browser;
  try {
    // Launch with existing Chrome profile
    browser = await puppeteer.launch({
      headless: false,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      userDataDir: userDataDir,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://x.com', { waitUntil: 'networkidle2' });

    // Get cookies
    const cookies = await page.cookies('https://x.com');
    
    const authToken = cookies.find(c => c.name === 'auth_token');
    const ct0 = cookies.find(c => c.name === 'ct0');

    if (authToken && ct0) {
      console.log('✅ Cookies extracted!\n');
      console.log('AUTH_TOKEN:', authToken.value.substring(0, 20) + '...');
      console.log('CT0:', ct0.value.substring(0, 20) + '...\n');

      // Save to .env
      const envPath = path.join(__dirname, '..', '.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      
      envContent = envContent.replace(/^AUTH_TOKEN=.*/gm, '');
      envContent = envContent.replace(/^CT0=.*/gm, '');
      
      envContent += `\n# Twitter cookies (extracted ${new Date().toISOString()})\n`;
      envContent += `AUTH_TOKEN=${authToken.value}\n`;
      envContent += `CT0=${ct0.value}\n`;

      fs.writeFileSync(envPath, envContent);
      console.log('✅ Saved to .env\n');

      return { authToken: authToken.value, ct0: ct0.value };
    } else {
      console.log('❌ Cookies not found. Are you logged in to x.com?\n');
      return null;
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

if (require.main === module) {
  extractCookies().then(() => process.exit(0));
}

module.exports = { extractCookies };
