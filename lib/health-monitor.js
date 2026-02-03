/**
 * Health Monitor - System Health Checks & Alerting
 * 
 * Monitors critical systems and alerts when something breaks:
 * - Database connectivity
 * - API key validity (OpenAI, Apollo, Instantly)
 * - Disk space
 * - Memory usage
 * - Email sending capability
 * - Webhook endpoint reachability
 * 
 * Run via cron every 5 minutes in production
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Telegram notification helper
async function sendAlert(title, details, severity = 'warning') {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram not configured, alert not sent:', title);
    return;
  }

  const emoji = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
  const message = `${emoji} **${title}**\n\n${details}\n\n_Caesar's Legions Health Monitor_`;
  
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('Failed to send Telegram alert:', error.message);
  }
}

// Health check results
const healthChecks = {
  database: { status: 'unknown', message: '', lastChecked: null },
  openai: { status: 'unknown', message: '', lastChecked: null },
  apollo: { status: 'unknown', message: '', lastChecked: null },
  instantly: { status: 'unknown', message: '', lastChecked: null },
  diskSpace: { status: 'unknown', message: '', lastChecked: null },
  memory: { status: 'unknown', message: '', lastChecked: null },
  webhookUrl: { status: 'unknown', message: '', lastChecked: null }
};

// Check database connectivity
async function checkDatabase() {
  try {
    const db = require('./db');
    // Try a simple query
    await db.getClient('test-client-id'); // Will fail gracefully if not exists
    
    healthChecks.database = {
      status: 'healthy',
      message: 'Database connection OK',
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    healthChecks.database = {
      status: 'critical',
      message: `Database connection failed: ${error.message}`,
      lastChecked: new Date().toISOString()
    };
    
    await sendAlert(
      'Database Connection Failed',
      `Cannot connect to database.\n\nError: ${error.message}`,
      'critical'
    );
  }
}

// Check OpenAI API key validity
async function checkOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    healthChecks.openai = {
      status: 'critical',
      message: 'OpenAI API key not configured',
      lastChecked: new Date().toISOString()
    };
    return;
  }
  
  try {
    // Make a minimal API call to check key validity
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 5000
    });
    
    healthChecks.openai = {
      status: 'healthy',
      message: `OpenAI API key valid (${response.data.data.length} models available)`,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    const status = error.response?.status === 401 ? 'critical' : 'warning';
    healthChecks.openai = {
      status,
      message: `OpenAI API check failed: ${error.message}`,
      lastChecked: new Date().toISOString()
    };
    
    if (status === 'critical') {
      await sendAlert(
        'OpenAI API Key Invalid',
        'OpenAI API key is invalid or expired. Email generation will fail.',
        'critical'
      );
    }
  }
}

// Check Apollo.io API key validity
async function checkApollo() {
  const apiKey = process.env.APOLLO_API_KEY;
  
  if (!apiKey) {
    healthChecks.apollo = {
      status: 'warning',
      message: 'Apollo API key not configured (optional)',
      lastChecked: new Date().toISOString()
    };
    return;
  }
  
  try {
    // Check API key with a minimal request
    const response = await axios.post('https://api.apollo.io/v1/auth/health', {}, {
      headers: { 'Api-Key': apiKey },
      timeout: 5000
    });
    
    healthChecks.apollo = {
      status: 'healthy',
      message: 'Apollo API key valid',
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    healthChecks.apollo = {
      status: 'warning',
      message: `Apollo API check failed: ${error.message}`,
      lastChecked: new Date().toISOString()
    };
  }
}

// Check Instantly.ai API key validity
async function checkInstantly() {
  const apiKey = process.env.INSTANTLY_API_KEY;
  
  if (!apiKey) {
    healthChecks.instantly = {
      status: 'warning',
      message: 'Instantly API key not configured (optional)',
      lastChecked: new Date().toISOString()
    };
    return;
  }
  
  try {
    // Check API key validity
    const response = await axios.get('https://api.instantly.ai/api/v1/account', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 5000
    });
    
    const accountInfo = response.data;
    healthChecks.instantly = {
      status: 'healthy',
      message: `Instantly account OK (${accountInfo.email_accounts?.length || 0} email accounts connected)`,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    healthChecks.instantly = {
      status: 'warning',
      message: `Instantly API check failed: ${error.message}`,
      lastChecked: new Date().toISOString()
    };
  }
}

// Check disk space
async function checkDiskSpace() {
  try {
    const dataDir = path.join(__dirname, '..', 'data');
    const stats = await fs.stat(dataDir);
    
    // On most systems, we can't easily check disk space without external tools
    // So we'll just check if the directory exists and is writable
    const testFile = path.join(dataDir, '.health-check-test');
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    
    healthChecks.diskSpace = {
      status: 'healthy',
      message: 'Data directory writable',
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    healthChecks.diskSpace = {
      status: 'critical',
      message: `Disk space check failed: ${error.message}`,
      lastChecked: new Date().toISOString()
    };
    
    await sendAlert(
      'Disk Space Issue',
      `Cannot write to data directory.\n\nError: ${error.message}`,
      'critical'
    );
  }
}

// Check memory usage
async function checkMemory() {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
  const rssMB = Math.round(used.rss / 1024 / 1024);
  
  // Alert if using more than 1GB RSS (reasonable threshold for Node.js)
  const status = rssMB > 1024 ? 'warning' : 'healthy';
  
  healthChecks.memory = {
    status,
    message: `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB, RSS: ${rssMB}MB`,
    lastChecked: new Date().toISOString()
  };
  
  if (status === 'warning') {
    await sendAlert(
      'High Memory Usage',
      `Memory usage is elevated:\n- Heap: ${heapUsedMB}MB / ${heapTotalMB}MB\n- RSS: ${rssMB}MB\n\nConsider restarting the service.`,
      'warning'
    );
  }
}

// Check webhook URL reachability
async function checkWebhookUrl() {
  const webhookUrl = process.env.WEBHOOK_URL;
  
  if (!webhookUrl) {
    healthChecks.webhookUrl = {
      status: 'info',
      message: 'Webhook URL not configured (will be needed for production)',
      lastChecked: new Date().toISOString()
    };
    return;
  }
  
  try {
    // Try to reach the health endpoint (not the webhook endpoint itself)
    const baseUrl = new URL(webhookUrl).origin;
    const response = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
    
    healthChecks.webhookUrl = {
      status: 'healthy',
      message: `Webhook URL reachable (${response.data.status})`,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    healthChecks.webhookUrl = {
      status: 'warning',
      message: `Webhook URL unreachable: ${error.message}`,
      lastChecked: new Date().toISOString()
    };
  }
}

// Run all health checks
async function runHealthChecks() {
  console.log('🏥 Running health checks...\n');
  
  await Promise.all([
    checkDatabase(),
    checkOpenAI(),
    checkApollo(),
    checkInstantly(),
    checkDiskSpace(),
    checkMemory(),
    checkWebhookUrl()
  ]);
  
  // Summary
  console.log('\n📊 Health Check Results:\n');
  
  let hasWarnings = false;
  let hasCritical = false;
  
  for (const [check, result] of Object.entries(healthChecks)) {
    const emoji = 
      result.status === 'healthy' ? '✅' :
      result.status === 'warning' ? '⚠️' :
      result.status === 'critical' ? '🚨' : 'ℹ️';
    
    console.log(`${emoji} ${check}: ${result.message}`);
    
    if (result.status === 'warning') hasWarnings = true;
    if (result.status === 'critical') hasCritical = true;
  }
  
  console.log('\n');
  
  // Overall status
  if (hasCritical) {
    console.log('🚨 CRITICAL: System has critical issues that need immediate attention!');
    return { status: 'critical', checks: healthChecks };
  } else if (hasWarnings) {
    console.log('⚠️ WARNING: System is operational but has warnings.');
    return { status: 'warning', checks: healthChecks };
  } else {
    console.log('✅ All systems operational!');
    return { status: 'healthy', checks: healthChecks };
  }
}

// Save health check results to file
async function saveHealthReport() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(__dirname, '..', 'logs', `health-${timestamp}.json`);
  
  const report = {
    timestamp: new Date().toISOString(),
    checks: healthChecks,
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version,
    platform: process.platform
  };
  
  try {
    const logsDir = path.join(__dirname, '..', 'logs');
    await fs.mkdir(logsDir, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Health report saved: ${reportPath}`);
  } catch (error) {
    console.error('Failed to save health report:', error.message);
  }
}

// Run health checks and exit
async function main() {
  try {
    const result = await runHealthChecks();
    await saveHealthReport();
    
    // Exit with appropriate code
    if (result.status === 'critical') {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('Health check failed:', error);
    await sendAlert(
      'Health Check Script Failed',
      `The health check script itself crashed:\n\n${error.message}`,
      'critical'
    );
    process.exit(1);
  }
}

// Export for use as module or run standalone
if (require.main === module) {
  main();
} else {
  module.exports = {
    runHealthChecks,
    healthChecks,
    sendAlert
  };
}
