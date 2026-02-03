#!/usr/bin/env node

/**
 * Health Check Cron Job
 * 
 * Run this via cron every 5-15 minutes in production
 * 
 * Example crontab:
 *   */5 * * * * cd /path/to/caesars-legions-backend && node cron/health-check.js >> logs/health-cron.log 2>&1
 * 
 * Or via Clawdbot cron:
 *   Every 15 minutes, run health check and alert if issues
 */

const { runHealthChecks, sendAlert } = require('../lib/health-monitor');
const fs = require('fs').promises;
const path = require('path');

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Health Check - ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  
  try {
    const result = await runHealthChecks();
    
    // Keep track of consecutive failures
    const stateFile = path.join(__dirname, '..', 'data', 'health-state.json');
    let state = { consecutiveFailures: 0, lastCritical: null };
    
    try {
      const stateData = await fs.readFile(stateFile, 'utf8');
      state = JSON.parse(stateData);
    } catch (error) {
      // State file doesn't exist yet, that's OK
    }
    
    if (result.status === 'critical') {
      state.consecutiveFailures += 1;
      state.lastCritical = new Date().toISOString();
      
      // Only alert every 3rd consecutive failure (avoid spam)
      if (state.consecutiveFailures === 1 || state.consecutiveFailures % 3 === 0) {
        const criticalChecks = Object.entries(result.checks)
          .filter(([_, check]) => check.status === 'critical')
          .map(([name, check]) => `- ${name}: ${check.message}`)
          .join('\n');
        
        await sendAlert(
          `System Health Critical (${state.consecutiveFailures}x)`,
          `Critical issues detected:\n\n${criticalChecks}\n\nRequires immediate attention.`,
          'critical'
        );
      }
    } else if (result.status === 'warning' && state.consecutiveFailures === 0) {
      // Only alert on first warning (not every time)
      const warningChecks = Object.entries(result.checks)
        .filter(([_, check]) => check.status === 'warning')
        .map(([name, check]) => `- ${name}: ${check.message}`)
        .join('\n');
      
      await sendAlert(
        'System Health Warning',
        `Warning detected:\n\n${warningChecks}\n\nNot critical but should investigate.`,
        'warning'
      );
    } else if (result.status === 'healthy' && state.consecutiveFailures > 0) {
      // System recovered!
      await sendAlert(
        '✅ System Recovered',
        `All health checks passing after ${state.consecutiveFailures} consecutive failures.\n\nSystem is back online.`,
        'info'
      );
      state.consecutiveFailures = 0;
    }
    
    // Save state
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
    
  } catch (error) {
    console.error('Health check failed:', error);
    await sendAlert(
      'Health Check Script Error',
      `The health check cron job crashed:\n\n${error.message}\n\nStack:\n${error.stack}`,
      'critical'
    );
    process.exit(1);
  }
}

main();
