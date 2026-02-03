/**
 * Launch Dashboard - Quick Status Check
 * 
 * Shows everything you need to know before launching:
 * - System health
 * - Prospects ready to contact
 * - Content ready to post
 * - Next recommended actions
 * 
 * Run: node scripts/launch-dashboard.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function colorize(text, color) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function header(text) {
  console.log('\n' + colorize('='.repeat(60), 'cyan'));
  console.log(colorize(text.toUpperCase().padStart(30 + text.length/2), 'bold'));
  console.log(colorize('='.repeat(60), 'cyan') + '\n');
}

function checkmark(passed) {
  return passed ? colorize('✅', 'green') : colorize('❌', 'red');
}

async function checkSystemHealth() {
  const checks = {
    envConfigured: false,
    openaiKey: false,
    apolloKey: false,
    smtpConfigured: false,
    databaseExists: false
  };

  // Check environment variables
  checks.envConfigured = fs.existsSync(path.join(__dirname, '..', '.env'));
  checks.openaiKey = !!process.env.OPENAI_API_KEY;
  checks.apolloKey = !!process.env.APOLLO_API_KEY;
  checks.smtpConfigured = !!(
    process.env.SMTP_HOST && 
    process.env.SMTP_USER && 
    process.env.SMTP_PASS
  );

  // Check database
  const dbPath = path.join(__dirname, '..', 'data', 'caesars-legions.db');
  checks.databaseExists = fs.existsSync(dbPath);

  return checks;
}

function countProspects() {
  const researchDir = path.join(__dirname, '..', 'research');
  let totalProspects = 0;
  let qualifiedProspects = 0;

  try {
    const files = fs.readdirSync(researchDir);
    const prospectFiles = files.filter(f => 
      f.startsWith('prospects-') && (f.endsWith('.json') || f.endsWith('.jsonl'))
    );

    prospectFiles.forEach(file => {
      const content = fs.readFileSync(path.join(researchDir, file), 'utf-8');
      
      // Try parsing as JSON array first
      try {
        const prospects = JSON.parse(content);
        if (Array.isArray(prospects)) {
          totalProspects += prospects.length;
          qualifiedProspects += prospects.filter(p => p.score > 7 || p.priority === 'high').length;
        }
      } catch {
        // Try JSONL format
        const lines = content.split('\n').filter(l => l.trim());
        lines.forEach(line => {
          try {
            const prospect = JSON.parse(line);
            totalProspects++;
            if (prospect.score > 7 || prospect.priority === 'high') {
              qualifiedProspects++;
            }
          } catch {}
        });
      }
    });
  } catch (error) {
    console.error('Error counting prospects:', error.message);
  }

  return { total: totalProspects, qualified: qualifiedProspects };
}

function countDMTemplates() {
  const outreachDir = path.join(__dirname, '..', 'outreach');
  let templates = 0;

  try {
    const files = fs.readdirSync(outreachDir);
    
    // Count DM template files
    templates = files.filter(f => 
      f.includes('dm-template') || f.includes('first-client')
    ).length;

    // Also check for templates in JSON files
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    jsonFiles.forEach(file => {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(outreachDir, file), 'utf-8'));
        if (Array.isArray(content)) {
          templates += content.length;
        }
      } catch {}
    });
  } catch (error) {
    console.error('Error counting templates:', error.message);
  }

  return templates;
}

function getLatestProspects(limit = 5) {
  const researchDir = path.join(__dirname, '..', 'research');
  const prospects = [];

  try {
    const files = fs.readdirSync(researchDir);
    const prospectFiles = files
      .filter(f => f.startsWith('prospects-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (prospectFiles.length > 0) {
      const latestFile = prospectFiles[0];
      const content = JSON.parse(
        fs.readFileSync(path.join(researchDir, latestFile), 'utf-8')
      );
      
      if (Array.isArray(content)) {
        prospects.push(...content.slice(0, limit));
      }
    }
  } catch (error) {
    console.error('Error reading prospects:', error.message);
  }

  return prospects;
}

function getNextActions() {
  const actions = [];
  
  // Check system health first
  const health = {
    envConfigured: fs.existsSync(path.join(__dirname, '..', '.env')),
    openaiKey: !!process.env.OPENAI_API_KEY,
    apolloKey: !!process.env.APOLLO_API_KEY,
    smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER)
  };

  if (!health.envConfigured) {
    actions.push({
      priority: 'CRITICAL',
      action: 'Configure .env file',
      command: 'cp .env.template .env && edit .env'
    });
  }

  if (!health.openaiKey) {
    actions.push({
      priority: 'CRITICAL',
      action: 'Add OpenAI API key to .env',
      command: 'Get key from https://platform.openai.com/api-keys'
    });
  }

  if (!health.smtpConfigured) {
    actions.push({
      priority: 'HIGH',
      action: 'Configure SMTP settings in .env',
      command: 'Add SMTP_HOST, SMTP_USER, SMTP_PASS'
    });
  }

  // If system is healthy, suggest next steps
  if (Object.values(health).every(v => v)) {
    const prospects = countProspects();
    
    if (prospects.qualified === 0) {
      actions.push({
        priority: 'HIGH',
        action: 'Research prospects on X/Twitter',
        command: 'Search for B2B SaaS founders discussing cold email pain'
      });
    }

    const dmTemplates = countDMTemplates();
    if (dmTemplates === 0) {
      actions.push({
        priority: 'HIGH',
        action: 'Create DM templates',
        command: 'Check outreach/first-client-dm-templates.md for examples'
      });
    }

    // Always suggest testing if system is ready
    actions.push({
      priority: 'MEDIUM',
      action: 'Test email generation and sending',
      command: 'node test-system-verification.js'
    });

    // Suggest outreach if everything is ready
    if (prospects.qualified > 0 && dmTemplates > 0) {
      actions.push({
        priority: 'HIGH',
        action: `DM ${Math.min(3, prospects.qualified)} high-priority prospects`,
        command: 'See outreach/READY-TO-SEND-DMS.md for templates'
      });
    }
  }

  return actions;
}

async function main() {
  console.clear();
  
  header('🏛️  Caesar\'s Legions - Launch Dashboard');
  
  // System Health
  header('System Health');
  const health = await checkSystemHealth();
  
  console.log(`${checkmark(health.envConfigured)} Environment file (.env) configured`);
  console.log(`${checkmark(health.openaiKey)} OpenAI API key set`);
  console.log(`${checkmark(health.apolloKey)} Apollo.io API key set`);
  console.log(`${checkmark(health.smtpConfigured)} SMTP email configured`);
  console.log(`${checkmark(health.databaseExists)} Database initialized`);
  
  const systemReady = Object.values(health).every(v => v);
  console.log(`\n${colorize('System Status:', 'bold')} ${systemReady ? colorize('READY ✅', 'green') : colorize('NOT READY ⚠️', 'yellow')}`);
  
  // Prospects
  header('Prospects & Outreach');
  const prospects = countProspects();
  const dmTemplates = countDMTemplates();
  
  console.log(`📊 Total prospects researched: ${colorize(prospects.total, 'cyan')}`);
  console.log(`⭐ High-priority prospects: ${colorize(prospects.qualified, 'green')}`);
  console.log(`📝 DM templates ready: ${colorize(dmTemplates, 'cyan')}`);
  
  // Latest prospects
  if (prospects.qualified > 0) {
    console.log(`\n${colorize('Top Prospects to Contact:', 'bold')}`);
    const latestProspects = getLatestProspects(5);
    latestProspects.forEach((p, i) => {
      const priority = p.score > 8 ? '🔥' : p.score > 7 ? '⭐' : '📌';
      console.log(`  ${priority} ${p.name || p.twitter_handle || 'Unknown'} - ${p.company || 'N/A'} (Score: ${p.score || 'N/A'})`);
    });
  }
  
  // Next Actions
  header('Next Actions (Prioritized)');
  const actions = getNextActions();
  
  if (actions.length === 0) {
    console.log(colorize('🎉 All systems go! Ready to launch!', 'green'));
    console.log('\nSuggested next steps:');
    console.log('1. Send test email to yourself');
    console.log('2. DM 3 high-priority prospects');
    console.log('3. Monitor responses and iterate');
  } else {
    actions.forEach((action, i) => {
      const priorityColor = 
        action.priority === 'CRITICAL' ? 'red' :
        action.priority === 'HIGH' ? 'yellow' : 'cyan';
      
      console.log(`${i + 1}. [${colorize(action.priority, priorityColor)}] ${action.action}`);
      console.log(`   ${colorize(action.command, 'cyan')}`);
    });
  }
  
  // Footer
  console.log('\n' + colorize('='.repeat(60), 'cyan'));
  console.log(colorize('Veni. Vidi. Vici.', 'bold').padStart(35));
  console.log(colorize('='.repeat(60), 'cyan') + '\n');
  
  // Quick stats box
  const now = new Date();
  console.log(colorize('📍 Status as of:', 'bold') + ` ${now.toLocaleString('en-US', { timeZone: 'Asia/Beirut' })} Beirut time`);
  console.log(colorize('🎯 Goal:', 'bold') + ' First paying client by Feb 5, 2026');
  console.log(colorize('⏰ Time remaining:', 'bold') + ` ${Math.ceil((new Date('2026-02-05') - now) / (1000 * 60 * 60 * 24))} days\n`);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { checkSystemHealth, countProspects, getNextActions };
