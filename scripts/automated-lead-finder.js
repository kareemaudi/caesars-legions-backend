#!/usr/bin/env node

/**
 * Automated Lead Finder for Caesar's Legions
 * 
 * Searches X, Reddit, and Indie Hackers for B2B SaaS founders
 * discussing cold email pain points.
 * 
 * Usage:
 *   node automated-lead-finder.js [--platform=x|reddit|all] [--limit=10]
 * 
 * Output:
 *   caesars-legions-backend/data/leads-YYYY-MM-DD.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const SEARCH_QUERIES = {
  x: [
    'cold email tips',
    'outbound strategy',
    'lead generation B2B',
    'SDR hiring',
    'cold outreach help',
    'email deliverability issues',
    'appointment setting',
    'demo booking',
  ],
  reddit: [
    'cold email',
    'B2B lead generation',
    'outbound sales',
    'SDR tools',
    'appointment setting',
  ]
};

const PAIN_SIGNALS = [
  'struggling with',
  'need help',
  'any recommendations',
  'what tool',
  'low response rate',
  'not working',
  'frustrating',
  'hard to',
  'can\'t figure out',
  'advice on',
];

const POSITIVE_SIGNALS = [
  'founder',
  'CEO',
  'building',
  'SaaS',
  'B2B',
  'startup',
  'revenue',
  'customers',
  'growth',
  'raised',
];

// Scoring criteria
function scoreProspect(prospect) {
  let score = 50; // Base score

  // Pain signals (+10 each)
  const hasPainSignals = PAIN_SIGNALS.filter(signal => 
    prospect.content?.toLowerCase().includes(signal)
  ).length;
  score += hasPainSignals * 10;

  // Positive signals (+5 each)
  const hasPositiveSignals = POSITIVE_SIGNALS.filter(signal =>
    prospect.bio?.toLowerCase().includes(signal) || 
    prospect.content?.toLowerCase().includes(signal)
  ).length;
  score += hasPositiveSignals * 5;

  // Engagement (followers, likes, etc.)
  if (prospect.followers > 1000) score += 10;
  if (prospect.followers > 5000) score += 10;
  if (prospect.engagement_rate > 2) score += 15;

  // Recent activity
  const postAge = Date.now() - new Date(prospect.timestamp).getTime();
  const daysSincePost = postAge / (1000 * 60 * 60 * 24);
  if (daysSincePost < 7) score += 15;
  if (daysSincePost < 3) score += 10;

  // Explicit cold email mention
  if (prospect.content?.toLowerCase().includes('cold email')) score += 20;

  return Math.min(100, Math.max(0, score));
}

// Extract insights from prospect content
function extractInsights(content) {
  const insights = {
    pain_points: [],
    goals: [],
    tech_stack: [],
    company_stage: null
  };

  // Pain points
  const painPatterns = [
    /struggling with (.+?)[.!?]/gi,
    /need help with (.+?)[.!?]/gi,
    /can't figure out (.+?)[.!?]/gi,
  ];

  painPatterns.forEach(pattern => {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      insights.pain_points.push(match[1].trim());
    }
  });

  // Goals
  const goalPatterns = [
    /want to (.+?)[.!?]/gi,
    /trying to (.+?)[.!?]/gi,
    /goal is to (.+?)[.!?]/gi,
  ];

  goalPatterns.forEach(pattern => {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      insights.goals.push(match[1].trim());
    }
  });

  // Tech stack mentions
  const techKeywords = ['Instantly', 'Lemlist', 'Smartlead', 'Apollo', 'HubSpot', 'Salesforce'];
  techKeywords.forEach(tech => {
    if (content.includes(tech)) {
      insights.tech_stack.push(tech);
    }
  });

  // Company stage
  if (content.match(/pre-seed|seed|series a/i)) {
    insights.company_stage = content.match(/pre-seed|seed|series a/i)[0];
  }

  return insights;
}

// Search X using bird CLI
async function searchX(query, limit = 10) {
  console.log(`🔍 Searching X for: "${query}"`);
  
  try {
    // Use bird CLI to search (assumes it's installed and configured)
    const cmd = `bird search "${query}" --limit ${limit} --json`;
    const result = execSync(cmd, { encoding: 'utf-8' });
    const tweets = JSON.parse(result);

    return tweets.map(tweet => ({
      platform: 'x',
      id: tweet.id,
      username: tweet.username,
      display_name: tweet.display_name,
      bio: tweet.user?.bio || '',
      content: tweet.text,
      url: `https://x.com/${tweet.username}/status/${tweet.id}`,
      timestamp: tweet.created_at,
      followers: tweet.user?.followers_count || 0,
      engagement: tweet.likes + tweet.retweets + tweet.replies,
      engagement_rate: ((tweet.likes + tweet.retweets) / (tweet.user?.followers_count || 1)) * 100,
    }));
  } catch (error) {
    console.error(`❌ Error searching X: ${error.message}`);
    return [];
  }
}

// Search Reddit (placeholder - would use reddit-cli or API)
async function searchReddit(query, limit = 10) {
  console.log(`🔍 Searching Reddit for: "${query}"`);
  
  // TODO: Implement reddit-cli integration
  // For now, return empty array
  console.log('⚠️  Reddit search not implemented yet (add reddit-cli integration)');
  return [];
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const platform = args.find(a => a.startsWith('--platform='))?.split('=')[1] || 'all';
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10');

  const allProspects = [];

  // Search X
  if (platform === 'x' || platform === 'all') {
    for (const query of SEARCH_QUERIES.x) {
      const results = await searchX(query, limit);
      allProspects.push(...results);
      
      // Rate limiting (be nice to X API)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Search Reddit
  if (platform === 'reddit' || platform === 'all') {
    for (const query of SEARCH_QUERIES.reddit) {
      const results = await searchReddit(query, limit);
      allProspects.push(...results);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Deduplicate by username/author
  const uniqueProspects = Array.from(
    new Map(allProspects.map(p => [p.username, p])).values()
  );

  // Score and enrich prospects
  const scoredProspects = uniqueProspects.map(prospect => {
    const score = scoreProspect(prospect);
    const insights = extractInsights(prospect.content + ' ' + prospect.bio);
    
    return {
      ...prospect,
      score,
      insights,
      added_at: new Date().toISOString(),
    };
  });

  // Sort by score (highest first)
  scoredProspects.sort((a, b) => b.score - a.score);

  // Save to file
  const date = new Date().toISOString().split('T')[0];
  const outputPath = path.join(__dirname, '..', 'data', `leads-${date}.json`);
  
  // Ensure data directory exists
  const dataDir = path.dirname(outputPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(scoredProspects, null, 2));

  // Summary
  console.log('\n📊 Lead Research Summary');
  console.log('═══════════════════════════════════════');
  console.log(`Total prospects found: ${scoredProspects.length}`);
  console.log(`High quality (90+ score): ${scoredProspects.filter(p => p.score >= 90).length}`);
  console.log(`Good fit (70-89 score): ${scoredProspects.filter(p => p.score >= 70 && p.score < 90).length}`);
  console.log(`Medium fit (50-69 score): ${scoredProspects.filter(p => p.score >= 50 && p.score < 70).length}`);
  console.log(`Output: ${outputPath}`);
  console.log('═══════════════════════════════════════\n');

  // Show top 5
  console.log('🏆 Top 5 Prospects:');
  scoredProspects.slice(0, 5).forEach((p, i) => {
    console.log(`\n${i + 1}. @${p.username} (Score: ${p.score}/100)`);
    console.log(`   Platform: ${p.platform}`);
    console.log(`   Content: ${p.content.substring(0, 100)}...`);
    console.log(`   URL: ${p.url}`);
    if (p.insights.pain_points.length > 0) {
      console.log(`   Pain: ${p.insights.pain_points[0]}`);
    }
  });

  console.log(`\n✅ Done! ${scoredProspects.length} prospects ready for outreach.\n`);

  return scoredProspects;
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { searchX, searchReddit, scoreProspect, extractInsights };
