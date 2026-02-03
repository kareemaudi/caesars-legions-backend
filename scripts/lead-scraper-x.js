#!/usr/bin/env node

/**
 * X (Twitter) Lead Scraper for Caesar's Legions
 * 
 * Finds B2B SaaS founders discussing cold email, outbound, lead gen
 * Scores them based on engagement, pain points, and fit
 * Outputs to research/prospects-YYYY-MM-DD.jsonl
 * 
 * Usage:
 *   node scripts/lead-scraper-x.js [--dry-run] [--keywords="cold email,outbound"]
 * 
 * Requirements:
 *   - bird CLI installed (npm install -g @sweetistics/bird)
 *   - X cookies configured in bird
 * 
 * Auto-approval: YES (read-only research, no posting)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  // Keywords to search for (pain points, topics)
  keywords: [
    'cold email',
    'outbound automation',
    'lead generation',
    'email deliverability',
    'cold outreach',
    'B2B sales automation',
    'reply rate optimization',
    'email personalization',
    'sales development',
    'SDR automation'
  ],
  
  // Negative keywords (filter out noise)
  excludeKeywords: [
    'spam',
    'unsubscribe',
    'scam',
    'free trial',
    'discount code'
  ],
  
  // Scoring weights
  scoring: {
    hasMetrics: 10,        // Shares reply rates, volume, etc.
    hasPainPoint: 15,      // Expresses frustration or challenge
    isFounder: 12,         // Bio indicates founder/CEO
    hasRevenue: 8,         // Mentions revenue/customers
    highEngagement: 5,     // >100 followers, >10 likes on tweet
    recentActivity: 3      // Posted in last 7 days
  },
  
  // Quality filters
  minFollowers: 50,        // Avoid brand new accounts
  maxFollowers: 100000,    // Avoid mega-influencers (not our market)
  minScore: 6,             // Minimum fit score to save
  maxResults: 20           // Max leads per run
};

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const customKeywords = args.find(a => a.startsWith('--keywords='))?.split('=')[1]?.split(',');
  
  console.log('🏛️ Caesar\'s Legions - X Lead Scraper\n');
  
  // Check if bird CLI is available
  if (!isBirdAvailable()) {
    console.error('❌ Error: bird CLI not found');
    console.error('   Install: npm install -g @sweetistics/bird');
    console.error('   Then configure with your X cookies');
    process.exit(1);
  }
  
  const keywords = customKeywords || CONFIG.keywords;
  const allProspects = [];
  
  // Search for each keyword
  for (const keyword of keywords.slice(0, 3)) { // Limit to 3 to avoid rate limits
    console.log(`\n🔍 Searching: "${keyword}"...`);
    
    try {
      const results = await searchTwitter(keyword);
      const scored = scoreLeads(results, keyword);
      const filtered = scored.filter(p => p.fit_score >= CONFIG.minScore);
      
      console.log(`   Found ${results.length} tweets, ${filtered.length} qualified leads`);
      
      allProspects.push(...filtered);
    } catch (error) {
      console.error(`   ❌ Error searching "${keyword}":`, error.message);
    }
    
    // Rate limiting
    await sleep(2000);
  }
  
  // Deduplicate by handle
  const uniqueProspects = deduplicateByHandle(allProspects);
  
  // Sort by score
  uniqueProspects.sort((a, b) => b.fit_score - a.fit_score);
  
  // Limit results
  const topProspects = uniqueProspects.slice(0, CONFIG.maxResults);
  
  // Save results
  if (!dryRun && topProspects.length > 0) {
    const outputPath = saveProspects(topProspects);
    console.log(`\n✅ Saved ${topProspects.length} prospects to ${outputPath}`);
  } else if (dryRun) {
    console.log('\n[DRY RUN] Would save:', JSON.stringify(topProspects, null, 2));
  } else {
    console.log('\n⚠️ No qualified prospects found');
  }
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Total searched: ${keywords.length} keywords`);
  console.log(`   Raw results: ${allProspects.length}`);
  console.log(`   Qualified: ${topProspects.length}`);
  console.log(`   Top score: ${topProspects[0]?.fit_score || 0}/50`);
  
  return topProspects;
}

/**
 * Check if bird CLI is installed and configured
 */
function isBirdAvailable() {
  try {
    execSync('bird --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Search Twitter using bird CLI
 * @param {string} query - Search query
 * @returns {Array} Array of tweet results
 */
async function searchTwitter(query) {
  try {
    // Use bird CLI to search
    const cmd = `bird search "${query}" --count 20 --json`;
    const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    
    // Parse JSON output
    const results = JSON.parse(output);
    return Array.isArray(results) ? results : [results];
  } catch (error) {
    // If bird fails, return empty (graceful degradation)
    console.warn(`   ⚠️ bird search failed: ${error.message}`);
    return [];
  }
}

/**
 * Score leads based on fit criteria
 * @param {Array} tweets - Raw tweet data
 * @param {string} keyword - Keyword that found them
 * @returns {Array} Scored prospects
 */
function scoreLeads(tweets, keyword) {
  return tweets.map(tweet => {
    const author = tweet.author || {};
    const text = tweet.text || '';
    const bio = author.description || '';
    
    let score = 0;
    const reasons = [];
    
    // Check metrics mentioned
    if (/\d+%|reply rate|open rate|conversion/i.test(text)) {
      score += CONFIG.scoring.hasMetrics;
      reasons.push('Shares metrics');
    }
    
    // Check pain points
    const painWords = ['struggling', 'frustrated', 'need', 'help', 'improve', 'optimize', 'stuck'];
    if (painWords.some(word => text.toLowerCase().includes(word))) {
      score += CONFIG.scoring.hasPainPoint;
      reasons.push('Expresses pain point');
    }
    
    // Check if founder
    if (/founder|ceo|co-founder|owner/i.test(bio)) {
      score += CONFIG.scoring.isFounder;
      reasons.push('Founder/CEO');
    }
    
    // Check revenue signals
    if (/\$\d+k|revenue|mrr|arr|\d+ customers/i.test(text + bio)) {
      score += CONFIG.scoring.hasRevenue;
      reasons.push('Revenue signals');
    }
    
    // Engagement score
    const followers = author.followers_count || 0;
    const likes = tweet.favorite_count || 0;
    if (followers >= CONFIG.minFollowers && followers <= CONFIG.maxFollowers && likes >= 10) {
      score += CONFIG.scoring.highEngagement;
      reasons.push('Good engagement');
    }
    
    // Recent activity
    const tweetDate = new Date(tweet.created_at);
    const daysSince = (Date.now() - tweetDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) {
      score += CONFIG.scoring.recentActivity;
      reasons.push('Recent activity');
    }
    
    // Extract pain point from tweet
    let painPoint = 'Unknown';
    if (text.match(/need|want|looking for/i)) {
      painPoint = text.substring(0, 100) + '...';
    }
    
    // Determine priority
    let priority = 'LOW';
    if (score >= 25) priority = 'HIGH';
    else if (score >= 15) priority = 'MEDIUM';
    
    return {
      handle: `@${author.screen_name || author.username}`,
      name: author.name || 'Unknown',
      bio: bio.substring(0, 100),
      followers: followers,
      fit_score: score,
      reasons: reasons.join(', '),
      pain_point: painPoint,
      tweet_text: text.substring(0, 200),
      tweet_url: `https://x.com/${author.screen_name || author.username}/status/${tweet.id_str || tweet.id}`,
      keyword_found: keyword,
      priority: priority,
      scraped_at: new Date().toISOString()
    };
  });
}

/**
 * Remove duplicate prospects by handle
 */
function deduplicateByHandle(prospects) {
  const seen = new Set();
  return prospects.filter(p => {
    if (seen.has(p.handle)) return false;
    seen.add(p.handle);
    return true;
  });
}

/**
 * Save prospects to JSONL file
 */
function saveProspects(prospects) {
  const date = new Date().toISOString().split('T')[0];
  const filename = `prospects-x-${date}.jsonl`;
  const outputPath = path.join(__dirname, '../research', filename);
  
  // Ensure research directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Write as JSONL (one JSON object per line)
  const content = prospects.map(p => JSON.stringify(p)).join('\n');
  fs.writeFileSync(outputPath, content);
  
  return outputPath;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { main, scoreLeads, CONFIG };
