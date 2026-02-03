#!/usr/bin/env node

/**
 * Monitoring Dashboard - Quick System Overview
 * 
 * Run this anytime to see current system status:
 *   node scripts/monitoring-dashboard.js
 * 
 * Shows:
 * - Current health status
 * - Recent metrics (emails sent, campaigns running)
 * - API usage and limits
 * - Recent errors
 */

const { runHealthChecks } = require('../lib/health-monitor');
const db = require('../lib/db');
const fs = require('fs').promises;
const path = require('path');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function box(title, content) {
  const width = 60;
  const line = '─'.repeat(width - 2);
  
  console.log(`\n┌${line}┐`);
  console.log(`│ ${colorize(title.padEnd(width - 3), 'bright')}│`);
  console.log(`├${line}┤`);
  
  content.split('\n').forEach(line => {
    console.log(`│ ${line.padEnd(width - 3)}│`);
  });
  
  console.log(`└${line}┘`);
}

async function getRecentMetrics() {
  try {
    // Get metrics for last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // These queries assume certain database schema
    // Adjust based on actual schema from db.js
    
    const metrics = {
      emailsSent24h: 0,
      campaignsActive: 0,
      leadsAdded24h: 0,
      repliesReceived24h: 0,
      openRate: 0,
      replyRate: 0
    };
    
    // Try to get real data, but don't fail if database isn't set up yet
    try {
      // This is pseudocode - adjust to actual db schema
      // const results = await db.query('SELECT COUNT(*) as count FROM emails WHERE created_at > ?', [yesterday]);
      // metrics.emailsSent24h = results[0].count;
    } catch (error) {
      // Database not set up yet, that's OK
    }
    
    return metrics;
  } catch (error) {
    return null;
  }
}

async function getRecentErrors() {
  try {
    const errorLogPath = path.join(__dirname, '..', 'logs', 'errors.log');
    const logContent = await fs.readFile(errorLogPath, 'utf8');
    const lines = logContent.split('\n').filter(l => l.trim());
    
    // Get last 5 errors
    return lines.slice(-5);
  } catch (error) {
    return ['No error log found (system might be new)'];
  }
}

async function getSystemInfo() {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    uptime: `${hours}h ${minutes}m`,
    pid: process.pid,
    memoryUsage: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
    environment: process.env.NODE_ENV || 'development'
  };
}

async function main() {
  console.clear();
  
  // Header
  console.log('\n' + '='.repeat(60));
  console.log(colorize('🏛️  CAESAR\'S LEGIONS - MONITORING DASHBOARD', 'cyan'));
  console.log('='.repeat(60));
  console.log(colorize(`Generated: ${new Date().toLocaleString()}`, 'blue'));
  
  // System Info
  const sysInfo = await getSystemInfo();
  box('📊 System Info', 
    `Node.js: ${sysInfo.nodeVersion} | Platform: ${sysInfo.platform}\n` +
    `Environment: ${sysInfo.environment} | Uptime: ${sysInfo.uptime}\n` +
    `Memory: ${sysInfo.memoryUsage} | PID: ${sysInfo.pid}`
  );
  
  // Health Checks
  console.log('\n' + colorize('🏥 Running Health Checks...', 'yellow'));
  const healthResult = await runHealthChecks();
  
  // Build health summary
  const healthSummary = Object.entries(healthResult.checks)
    .map(([name, check]) => {
      const icon = 
        check.status === 'healthy' ? colorize('✅', 'green') :
        check.status === 'warning' ? colorize('⚠️', 'yellow') :
        check.status === 'critical' ? colorize('🚨', 'red') : 'ℹ️';
      
      return `${icon} ${name.padEnd(15)}: ${check.message}`;
    })
    .join('\n');
  
  box('Health Status', healthSummary);
  
  // Metrics
  const metrics = await getRecentMetrics();
  if (metrics) {
    box('📈 Last 24 Hours',
      `Emails Sent: ${metrics.emailsSent24h}\n` +
      `Campaigns Active: ${metrics.campaignsActive}\n` +
      `Leads Added: ${metrics.leadsAdded24h}\n` +
      `Replies Received: ${metrics.repliesReceived24h}\n` +
      `Open Rate: ${(metrics.openRate * 100).toFixed(1)}%\n` +
      `Reply Rate: ${(metrics.replyRate * 100).toFixed(1)}%`
    );
  }
  
  // Recent Errors
  const recentErrors = await getRecentErrors();
  if (recentErrors.length > 0) {
    const errorSummary = recentErrors
      .map(err => `  ${err.substring(0, 55)}...`)
      .join('\n');
    
    box('⚠️  Recent Errors (Last 5)', errorSummary);
  }
  
  // API Keys Status
  const apiStatus = [
    { name: 'OpenAI', key: process.env.OPENAI_API_KEY, critical: true },
    { name: 'Apollo', key: process.env.APOLLO_API_KEY, critical: false },
    { name: 'Instantly', key: process.env.INSTANTLY_API_KEY, critical: false },
    { name: 'Stripe', key: process.env.STRIPE_SECRET_KEY, critical: false }
  ];
  
  const apiSummary = apiStatus
    .map(api => {
      const status = api.key ? 
        colorize('✅ Configured', 'green') : 
        (api.critical ? colorize('❌ Missing (REQUIRED)', 'red') : colorize('⚠️ Not configured', 'yellow'));
      
      return `${api.name.padEnd(15)}: ${status}`;
    })
    .join('\n');
  
  box('🔑 API Keys', apiSummary);
  
  // Footer
  console.log('\n' + '='.repeat(60));
  
  // Overall status
  if (healthResult.status === 'critical') {
    console.log(colorize('🚨 CRITICAL: Immediate attention required!', 'red'));
  } else if (healthResult.status === 'warning') {
    console.log(colorize('⚠️  WARNING: System operational with issues', 'yellow'));
  } else {
    console.log(colorize('✅ All systems operational', 'green'));
  }
  
  console.log('='.repeat(60) + '\n');
  
  // Helpful commands
  console.log(colorize('Quick Commands:', 'cyan'));
  console.log('  npm start              - Start the server');
  console.log('  npm test               - Run test suite');
  console.log('  node scripts/monitoring-dashboard.js - This dashboard');
  console.log('  tail -f logs/app.log   - Watch application logs');
  console.log('');
}

main().catch(error => {
  console.error(colorize('Dashboard failed:', 'red'), error);
  process.exit(1);
});
