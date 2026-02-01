#!/usr/bin/env node

/**
 * YC Directory Prospect Scraper
 * 
 * Scrapes YC company directory for B2B SaaS founders
 * Filters by: B2B, SaaS, recent batch, has revenue
 * 
 * Usage:
 *   node scripts/yc-directory-scraper.js [--batch=W25] [--min-employees=5]
 * 
 * Output: prospects.jsonl
 */

const https = require('https');
const fs = require('fs');

// YC public companies API
const YC_API = 'https://api.ycombinator.com/v0.1/companies';

async function fetchYCCompanies() {
  return new Promise((resolve, reject) => {
    https.get(YC_API, {
      headers: {
        'User-Agent': 'CaesarsLegions/1.0 (Prospect Research)',
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function isGoodFit(company) {
  // B2B SaaS filters
  const tags = (company.tags || []).map(t => t.toLowerCase());
  const description = (company.one_liner || '').toLowerCase();
  
  const isB2B = tags.includes('b2b') || 
                description.includes('b2b') ||
                tags.includes('enterprise');
                
  const isSaaS = tags.includes('saas') || 
                 tags.includes('software') ||
                 description.includes('platform') ||
                 description.includes('software');
  
  // Has traction (team size proxy for revenue)
  const hasTeam = company.team_size && company.team_size >= 3;
  
  // Recent batch (more likely to be scaling)
  const batch = company.batch || '';
  const isRecent = batch.match(/W2[4-6]|S2[4-6]/); // 2024-2026
  
  return isB2B && isSaaS && hasTeam && isRecent;
}

function extractFounderInfo(company) {
  // YC API includes founder names and sometimes LinkedIn
  const founders = company.founders || [];
  
  return founders.map(f => ({
    name: f.name,
    role: f.role || 'Co-founder',
    linkedin: f.linkedin_url,
    twitter: f.twitter_url
  }));
}

function scoreCompany(company) {
  let score = 0;
  
  // Team size = revenue proxy
  if (company.team_size > 10) score += 3;
  else if (company.team_size > 5) score += 2;
  else score += 1;
  
  // Recent batch = growth phase
  const batch = company.batch || '';
  if (batch.match(/W25|S25|W26/)) score += 2;
  else if (batch.match(/W24|S24/)) score += 1;
  
  // Has social presence = reachable
  if (company.twitter_url) score += 1;
  if (company.linkedin_url) score += 1;
  
  // Funded = has budget
  if (company.is_hiring) score += 1;
  
  return score;
}

async function main() {
  console.log('🔍 Fetching YC directory...\n');
  
  try {
    const companies = await fetchYCCompanies();
    console.log(`✅ Found ${companies.length} total companies\n`);
    
    const goodFits = companies
      .filter(isGoodFit)
      .map(c => ({
        ...c,
        score: scoreCompany(c),
        founders: extractFounderInfo(c)
      }))
      .sort((a, b) => b.score - a.score);
    
    console.log(`✅ ${goodFits.length} B2B SaaS companies match filters\n`);
    console.log('Top 10 Prospects:\n');
    
    goodFits.slice(0, 10).forEach((c, i) => {
      console.log(`${i + 1}. ${c.name} (${c.batch})`);
      console.log(`   ${c.one_liner}`);
      console.log(`   Team: ${c.team_size} | Score: ${c.score}/9`);
      console.log(`   Founders: ${c.founders.map(f => f.name).join(', ')}`);
      console.log('');
    });
    
    // Save to file
    const outputPath = 'outreach/yc-prospects.jsonl';
    const lines = goodFits.map(c => JSON.stringify(c)).join('\n');
    fs.writeFileSync(outputPath, lines);
    
    console.log(`💾 Saved ${goodFits.length} prospects to: ${outputPath}`);
    console.log('\n📊 Next Steps:');
    console.log('   1. Review top 20 manually');
    console.log('   2. Find founders on Twitter/LinkedIn');
    console.log('   3. Draft personalized DMs');
    console.log('   4. Send outreach (target: 10/day)');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    
    if (err.message.includes('ENOTFOUND')) {
      console.log('\n⚠️  YC API might have changed.');
      console.log('Alternative: Scrape https://www.ycombinator.com/companies with browser tool');
    }
    
    process.exit(1);
  }
}

main();
