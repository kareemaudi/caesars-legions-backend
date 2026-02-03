#!/usr/bin/env node

/**
 * Run X Lead Scraper
 * 
 * Usage:
 *   node scripts/run-lead-scraper.js
 *   node scripts/run-lead-scraper.js --min-score 8 --limit 50
 */

const { scrapeLeads, saveLeads, generateOutreachPlan } = require('../lib/x-lead-scraper');
const fs = require('fs').promises;
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const minScore = parseInt(args[args.indexOf('--min-score') + 1] || '5');
  const limit = parseInt(args[args.indexOf('--limit') + 1] || '20');
  
  console.log('🏛️  CAESAR\'S LEGIONS - X Lead Scraper');
  console.log('====================================\n');
  console.log(`Config: min-score=${minScore}, limit=${limit}\n`);
  
  const timestamp = new Date().toISOString().split('T')[0];
  const outputPath = path.join(__dirname, '..', 'research', `x-leads-${timestamp}.jsonl`);
  const planPath = path.join(__dirname, '..', 'research', `outreach-plan-${timestamp}.json`);
  
  try {
    // Scrape leads
    const leads = await scrapeLeads({ minScore, limit });
    
    if (leads.length === 0) {
      console.log('\n⚠️  No qualified leads found.');
      console.log('   Try lowering --min-score or increasing --limit');
      process.exit(0);
    }
    
    // Save leads
    await saveLeads(leads, outputPath);
    
    // Generate outreach plan
    const plan = generateOutreachPlan(leads, 10);
    await fs.writeFile(planPath, JSON.stringify(plan, null, 2));
    
    console.log(`\n📋 Outreach Plan: ${planPath}`);
    console.log('   Ready for first 10 DMs\n');
    
    // Print top 5 leads
    console.log('🎯 TOP 5 LEADS:\n');
    leads.slice(0, 5).forEach((lead, i) => {
      console.log(`${i + 1}. @${lead.username}`);
      console.log(`   ${lead.fit} fit (score: ${lead.score})`);
      console.log(`   ${lead.followers.toLocaleString()} followers${lead.verified ? ' ✓' : ''}`);
      console.log(`   Bio: ${lead.bio.substring(0, 60)}...`);
      console.log(`   Tweet: "${lead.tweet_text.substring(0, 80)}..."`);
      console.log(`   ${lead.tweet_url}\n`);
    });
    
    // Next steps
    console.log('📝 NEXT STEPS:');
    console.log('   1. Review outreach plan');
    console.log('   2. Customize DM templates for top leads');
    console.log('   3. Send 5-10 DMs per day (avoid spam filters)');
    console.log('   4. Track responses in research/outreach-tracking.jsonl\n');
    
    console.log('🏛️  Veni. Vidi. Vici.\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
