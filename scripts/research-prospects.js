#!/usr/bin/env node

/**
 * Prospect Research Script
 * 
 * Finds and scores B2B SaaS founders who might need cold email help.
 * 
 * Usage:
 *   node scripts/research-prospects.js --source=apollo --save
 *   node scripts/research-prospects.js --source=manual --input=research/manual-prospects.json
 */

const fs = require('fs').promises;
const path = require('path');
const { scoreProspect, batchScore } = require('../lib/prospect-scorer');

const RESEARCH_DIR = path.join(__dirname, '../research');
const OUTPUT_FILE = path.join(RESEARCH_DIR, `prospects-${new Date().toISOString().split('T')[0]}.jsonl`);

/**
 * Research prospects from Apollo.io
 */
async function researchFromApollo() {
  const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
  
  if (!APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY not found in environment');
  }

  console.log('🔍 Searching Apollo.io for B2B SaaS founders...');

  const payload = {
    page: 1,
    per_page: 50,
    person_titles: ['CEO', 'Founder', 'Co-Founder', 'Chief Executive Officer'],
    organization_num_employees_ranges: ['1,10', '11,50', '51,100'],
    q_keywords: 'B2B SaaS software',
  };

  try {
    const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Apollo API error: ${data.error}`);
    }

    if (!data.people || data.people.length === 0) {
      console.log('⚠️  No prospects found');
      return [];
    }

    console.log(`✅ Found ${data.people.length} prospects from Apollo`);

    // Transform to our format
    const prospects = data.people.map(p => ({
      name: p.name,
      title: p.title,
      company: p.organization?.name,
      employees: p.organization?.estimated_num_employees,
      industry: p.organization?.industry,
      linkedin: p.linkedin_url,
      twitter: p.twitter_url,
      email: p.email,
      source: 'apollo',
      foundAt: new Date().toISOString()
    }));

    return prospects;
  } catch (error) {
    console.error('❌ Apollo search failed:', error.message);
    return [];
  }
}

/**
 * Load prospects from manual research file
 */
async function loadManualProspects(inputFile) {
  console.log(`📂 Loading prospects from ${inputFile}...`);
  
  try {
    const content = await fs.readFile(inputFile, 'utf-8');
    const prospects = JSON.parse(content);
    
    console.log(`✅ Loaded ${prospects.length} manual prospects`);
    return prospects;
  } catch (error) {
    console.error('❌ Failed to load manual prospects:', error.message);
    return [];
  }
}

/**
 * Enrich prospect with Twitter data (placeholder - needs Twitter API or scraping)
 */
async function enrichWithTwitter(prospect) {
  // TODO: Implement Twitter scraping via bird CLI or API
  // For now, return prospect as-is
  return {
    ...prospect,
    recentTweets: [], // Would fetch last 5-10 tweets
    signals: {
      coldEmailPain: false,
      needsLeads: false,
      askedForRecs: false,
      lowResponseRate: false
    }
  };
}

/**
 * Save prospects to JSONL file
 */
async function saveProspects(prospects, filename = OUTPUT_FILE) {
  await fs.mkdir(RESEARCH_DIR, { recursive: true });
  
  const lines = prospects.map(p => JSON.stringify(p)).join('\n');
  await fs.writeFile(filename, lines, 'utf-8');
  
  console.log(`💾 Saved ${prospects.length} prospects to ${filename}`);
}

/**
 * Generate summary report
 */
function generateReport(prospects) {
  const scored = batchScore(prospects);
  
  const hot = scored.filter(p => p.scoring.tier === 'hot');
  const warm = scored.filter(p => p.scoring.tier === 'warm');
  const cold = scored.filter(p => p.scoring.tier === 'cold');

  console.log('\n📊 RESEARCH SUMMARY');
  console.log('==================');
  console.log(`Total prospects: ${scored.length}`);
  console.log(`🔥 Hot leads (70+): ${hot.length}`);
  console.log(`🟡 Warm leads (50-69): ${warm.length}`);
  console.log(`❄️  Cold leads (<50): ${cold.length}`);
  console.log('');

  if (hot.length > 0) {
    console.log('🎯 TOP 5 HOT LEADS:');
    hot.slice(0, 5).forEach((p, i) => {
      console.log(`${i + 1}. ${p.name} (${p.title} @ ${p.company}) - Score: ${p.scoring.score}`);
      console.log(`   Twitter: ${p.twitter || 'N/A'}`);
      console.log(`   Recommendation: ${p.scoring.recommendation.template}`);
      console.log('');
    });
  }

  return scored;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const source = args.find(a => a.startsWith('--source='))?.split('=')[1] || 'apollo';
  const inputFile = args.find(a => a.startsWith('--input='))?.split('=')[1];
  const shouldSave = args.includes('--save');

  let prospects = [];

  if (source === 'apollo') {
    prospects = await researchFromApollo();
  } else if (source === 'manual' && inputFile) {
    prospects = await loadManualProspects(inputFile);
  } else {
    console.error('❌ Invalid source or missing input file');
    console.log('Usage: node research-prospects.js --source=apollo --save');
    console.log('   or: node research-prospects.js --source=manual --input=path/to/prospects.json');
    process.exit(1);
  }

  if (prospects.length === 0) {
    console.log('⚠️  No prospects to process');
    return;
  }

  // Enrich with Twitter data
  console.log('🐦 Enriching with Twitter data...');
  const enriched = await Promise.all(
    prospects.map(p => enrichWithTwitter(p))
  );

  // Score and generate report
  const scored = generateReport(enriched);

  // Save if requested
  if (shouldSave) {
    await saveProspects(scored);
  }

  console.log('✅ Research complete!');
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { researchFromApollo, loadManualProspects, enrichWithTwitter, saveProspects };
