/**
 * CLI tool to score existing prospects
 * 
 * Usage:
 *   node scripts/score-prospects.js
 *   node scripts/score-prospects.js --min-score 80
 *   node scripts/score-prospects.js --category hot
 */

const fs = require('fs');
const path = require('path');
const { scoreProspects } = require('../lib/prospect-scorer');

// Parse CLI args
const args = process.argv.slice(2);
const minScore = parseInt(args.find(a => a.startsWith('--min-score='))?.split('=')[1] || '0');
const category = args.find(a => a.startsWith('--category='))?.split('=')[1];

// Load prospects
const prospectsPath = path.join(__dirname, '../data/prospects-warm.json');
const data = JSON.parse(fs.readFileSync(prospectsPath, 'utf8'));

console.log('🏛️ Caesar\'s Legions - Prospect Scorer\n');
console.log(`📊 Scoring ${data.prospects.length} prospects...\n`);

// Score all prospects
const scored = scoreProspects(data.prospects);

// Filter by criteria
let filtered = scored;
if (minScore > 0) {
  filtered = filtered.filter(p => p.scoring.score >= minScore);
}
if (category) {
  filtered = filtered.filter(p => p.scoring.category === category);
}

// Display results
console.log(`\n✅ Found ${filtered.length} prospects matching criteria\n`);
console.log('='.repeat(80));

filtered.forEach((prospect, i) => {
  console.log(`\n#${i + 1} | Score: ${prospect.scoring.score}/100 | Category: ${prospect.scoring.category.toUpperCase()}`);
  console.log(`Source: ${prospect.source}`);
  console.log(`ID: ${prospect.id}`);
  
  if (prospect.company_arr) {
    console.log(`ARR: ${prospect.company_arr}`);
  }
  
  console.log(`\n📋 Scoring Factors:`);
  prospect.scoring.factors.forEach(f => console.log(`  ${f}`));
  
  console.log(`\n🎯 Recommendation:`);
  const rec = prospect.scoring.recommendation;
  console.log(`  Priority: ${rec.priority}`);
  console.log(`  Action: ${rec.action}`);
  console.log(`  Timeline: ${rec.timeline}`);
  console.log(`  Channel: ${rec.channel}`);
  console.log(`  Why: ${rec.why}`);
  
  if (prospect.exact_quote) {
    console.log(`\n💬 Key Quote:`);
    console.log(`  "${prospect.exact_quote.substring(0, 200)}..."`);
  }
  
  console.log('\n' + '='.repeat(80));
});

// Summary by category
console.log('\n📊 Summary by Category:\n');
const summary = scored.reduce((acc, p) => {
  acc[p.scoring.category] = (acc[p.scoring.category] || 0) + 1;
  return acc;
}, {});

Object.entries(summary)
  .sort(([,a], [,b]) => b - a)
  .forEach(([cat, count]) => {
    const emoji = {
      hot: '🔥',
      warm: '🟡',
      qualified: '✅',
      nurture: '🌱'
    }[cat] || '📌';
    
    console.log(`  ${emoji} ${cat.padEnd(10)} ${count}`);
  });

console.log('\n📈 Score Distribution:\n');
const buckets = {
  '80-100': scored.filter(p => p.scoring.score >= 80).length,
  '60-79': scored.filter(p => p.scoring.score >= 60 && p.scoring.score < 80).length,
  '40-59': scored.filter(p => p.scoring.score >= 40 && p.scoring.score < 60).length,
  '0-39': scored.filter(p => p.scoring.score < 40).length
};

Object.entries(buckets).forEach(([range, count]) => {
  const bar = '█'.repeat(count);
  console.log(`  ${range}  ${bar} ${count}`);
});

console.log('\n🎯 Next Actions:\n');
const hot = scored.filter(p => p.scoring.category === 'hot');
const warm = scored.filter(p => p.scoring.category === 'warm');

if (hot.length > 0) {
  console.log(`  🔥 ${hot.length} HOT prospects → Reach out TODAY (next 4 hours)`);
  hot.forEach(p => console.log(`     - ${p.id} (score: ${p.scoring.score})`));
}

if (warm.length > 0) {
  console.log(`\n  🟡 ${warm.length} WARM prospects → Reach out within 24 hours`);
  warm.length <= 5 && warm.forEach(p => console.log(`     - ${p.id} (score: ${p.scoring.score})`));
}

console.log('\n');
