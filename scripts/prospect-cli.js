#!/usr/bin/env node
// CLI for managing prospects

const {
  addProspect,
  updateProspectStatus,
  getTopProspects,
  getProspectsByStatus,
  searchProspects,
  getPipelineMetrics,
  exportToCSV
} = require('../lib/prospect-tracker');

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'add':
      // Usage: node prospect-cli.js add --name "John Doe" --email "john@example.com" --company "Acme" ...
      addProspectFromArgs(args.slice(1));
      break;
      
    case 'list':
      const status = args[1];
      const limit = parseInt(args[2]) || 10;
      listProspects(status, limit);
      break;
      
    case 'top':
      const topLimit = parseInt(args[1]) || 10;
      showTopProspects(topLimit);
      break;
      
    case 'update':
      // Usage: node prospect-cli.js update <id> <status> [notes]
      updateProspect(args[1], args[2], args.slice(3).join(' '));
      break;
      
    case 'search':
      const query = args.slice(1).join(' ');
      searchAndDisplay(query);
      break;
      
    case 'metrics':
      showMetrics();
      break;
      
    case 'export':
      const exportStatus = args[1] || null;
      exportProspects(exportStatus);
      break;
      
    default:
      showHelp();
  }
}

function addProspectFromArgs(args) {
  const prospect = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    
    if (key === 'pain-points') {
      prospect.pain_points = value.split(',').map(s => s.trim());
    } else if (key === 'company-size' || key === 'revenue-mrr' || key === 'twitter-followers') {
      prospect[key.replace('-', '_')] = parseInt(value);
    } else {
      prospect[key.replace('-', '_')] = value;
    }
  }
  
  const result = addProspect(prospect);
  console.log('\n✅ Prospect added:');
  console.log(JSON.stringify(result, null, 2));
}

function listProspects(status, limit) {
  let prospects;
  
  if (status) {
    prospects = getProspectsByStatus(status).slice(0, limit);
    console.log(`\n📋 Prospects (Status: ${status}):\n`);
  } else {
    prospects = getTopProspects(limit);
    console.log(`\n📋 Top ${limit} Prospects:\n`);
  }
  
  if (prospects.length === 0) {
    console.log('No prospects found.');
    return;
  }
  
  prospects.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name || p.email} (Score: ${p.score})`);
    console.log(`   Company: ${p.company || 'N/A'}`);
    console.log(`   Status: ${p.status}`);
    console.log(`   Email: ${p.email || 'N/A'}`);
    console.log(`   Twitter: ${p.twitter_handle ? '@' + p.twitter_handle : 'N/A'}`);
    if (p.pain_points && p.pain_points.length > 0) {
      console.log(`   Pain Points: ${p.pain_points.join(', ')}`);
    }
    console.log('');
  });
}

function showTopProspects(limit) {
  listProspects(null, limit);
}

function updateProspect(id, status, notes) {
  if (!id || !status) {
    console.error('Usage: prospect-cli.js update <id> <status> [notes]');
    return;
  }
  
  try {
    const result = updateProspectStatus(id, status, notes);
    console.log(`\n✅ Updated prospect: ${result.name || result.email}`);
    console.log(`   Status: ${result.status}`);
    if (notes) {
      console.log(`   Note: ${notes}`);
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  }
}

function searchAndDisplay(query) {
  if (!query) {
    console.error('Usage: prospect-cli.js search <query>');
    return;
  }
  
  const results = searchProspects(query);
  
  if (results.length === 0) {
    console.log(`\nNo prospects found matching: "${query}"`);
    return;
  }
  
  console.log(`\n🔍 Found ${results.length} prospect(s):\n`);
  listProspects(null, results.length);
}

function showMetrics() {
  const metrics = getPipelineMetrics();
  
  console.log('\n📊 Prospect Pipeline Metrics:\n');
  console.log(`Total Prospects: ${metrics.total}`);
  console.log(`Average Score: ${metrics.avg_score}`);
  console.log(`Top 10 Avg Score: ${metrics.top_10_avg_score}`);
  console.log('\nBy Status:');
  
  Object.entries(metrics.by_status).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });
  console.log('');
}

function exportProspects(status) {
  const csv = exportToCSV(status);
  const filename = status 
    ? `prospects_${status}_${Date.now()}.csv`
    : `prospects_all_${Date.now()}.csv`;
  
  require('fs').writeFileSync(filename, csv);
  console.log(`\n✅ Exported to: ${filename}`);
}

function showHelp() {
  console.log(`
📋 Prospect CLI - Caesar's Legions

Usage:
  prospect-cli.js add --name "Name" --email "email" --company "Company" ...
  prospect-cli.js list [status] [limit]
  prospect-cli.js top [limit]
  prospect-cli.js update <id> <status> [notes]
  prospect-cli.js search <query>
  prospect-cli.js metrics
  prospect-cli.js export [status]

Commands:
  add       Add a new prospect
  list      List prospects (optionally by status)
  top       Show top-scored prospects
  update    Update prospect status
  search    Search prospects by name/company/email
  metrics   Show pipeline metrics
  export    Export prospects to CSV

Statuses:
  new, contacted, responded, qualified, lost

Example:
  prospect-cli.js add --name "John Doe" --email "john@acme.com" \\
    --company "Acme Inc" --twitter-handle "johndoe" \\
    --company-size 50 --revenue-mrr 25000 \\
    --pain-points "deliverability,expensive tools"
`);
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
