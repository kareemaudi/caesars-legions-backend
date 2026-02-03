/**
 * X Lead Scraper - Find B2B SaaS founders discussing cold email pain
 * 
 * Uses bird CLI (X/Twitter skill) to search for relevant conversations
 * Scores leads based on engagement, followers, and pain signals
 * Outputs to research/x-leads-YYYY-MM-DD.jsonl
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

/**
 * Search queries to find founders with cold email pain
 */
const SEARCH_QUERIES = [
  'cold email not working',
  'outbound sales struggling',
  'need lead gen help',
  'cold email agency expensive',
  'looking for cold email tool',
  'B2B SaaS cold email',
  'founder outbound strategy',
  'sales automation recommendations',
  'cold email open rates low',
  'need better cold email tool'
];

/**
 * Keywords that signal high intent / pain
 */
const PAIN_SIGNALS = [
  'struggling', 'expensive', 'not working', 'terrible', 'need help',
  'frustrated', 'looking for', 'recommendations', 'better alternative',
  'paying too much', 'waste of money', 'disappointed'
];

/**
 * Keywords that indicate good fit (B2B SaaS founder)
 */
const FIT_SIGNALS = [
  'founder', 'CEO', 'cofounder', 'building', 'launched', 'startup',
  'B2B', 'SaaS', 'enterprise', 'revenue', 'MRR', 'ARR'
];

/**
 * Score a tweet/profile for lead quality
 */
function scoreLead(tweet, profile) {
  let score = 0;
  const text = `${tweet.text} ${profile.bio || ''}`.toLowerCase();
  
  // Pain signals (high value)
  PAIN_SIGNALS.forEach(signal => {
    if (text.includes(signal)) score += 3;
  });
  
  // Fit signals (medium value)
  FIT_SIGNALS.forEach(signal => {
    if (text.includes(signal)) score += 2;
  });
  
  // Engagement (followers, verified)
  if (profile.followers > 1000) score += 2;
  if (profile.followers > 5000) score += 3;
  if (profile.followers > 10000) score += 5;
  if (profile.verified) score += 3;
  
  // Recent activity (posted in last 7 days)
  const tweetDate = new Date(tweet.created_at);
  const daysSince = (Date.now() - tweetDate) / (1000 * 60 * 60 * 24);
  if (daysSince < 7) score += 2;
  if (daysSince < 3) score += 3;
  
  // Engagement on tweet
  if (tweet.likes > 10) score += 1;
  if (tweet.retweets > 5) score += 1;
  if (tweet.replies > 3) score += 2;
  
  return score;
}

/**
 * Extract relevant info from tweet
 */
function extractLeadData(tweet, score) {
  return {
    username: tweet.username,
    name: tweet.name,
    bio: tweet.bio || '',
    followers: tweet.followers || 0,
    verified: tweet.verified || false,
    tweet_text: tweet.text,
    tweet_url: tweet.url,
    tweet_date: tweet.created_at,
    likes: tweet.likes || 0,
    retweets: tweet.retweets || 0,
    replies: tweet.replies || 0,
    score: score,
    fit: score > 10 ? 'HIGH' : score > 5 ? 'MEDIUM' : 'LOW',
    scraped_at: new Date().toISOString()
  };
}

/**
 * Search X for a query using bird CLI
 */
async function searchX(query, limit = 20) {
  try {
    // Using bird CLI from skills/bird (use -n for count, not --limit)
    const cmd = `bird search "${query}" -n ${limit} --json`;
    const { stdout } = await execAsync(cmd);
    
    // Parse JSON output
    const results = JSON.parse(stdout);
    return results.tweets || [];
  } catch (error) {
    console.error(`Error searching X for "${query}":`, error.message);
    return [];
  }
}

/**
 * Scrape leads from X
 */
async function scrapeLeads(options = {}) {
  const {
    queries = SEARCH_QUERIES,
    minScore = 5,
    limit = 20
  } = options;
  
  console.log(`🔍 Scraping X leads with ${queries.length} queries...`);
  
  const allLeads = [];
  const seenUsers = new Set();
  
  for (const query of queries) {
    console.log(`  Searching: "${query}"...`);
    
    const tweets = await searchX(query, limit);
    console.log(`    Found ${tweets.length} tweets`);
    
    for (const tweet of tweets) {
      // Skip if we've already seen this user
      if (seenUsers.has(tweet.username)) continue;
      seenUsers.add(tweet.username);
      
      // Score the lead
      const score = scoreLead(tweet, {
        bio: tweet.bio,
        followers: tweet.followers,
        verified: tweet.verified
      });
      
      // Only keep leads above threshold
      if (score >= minScore) {
        const lead = extractLeadData(tweet, score);
        allLeads.push(lead);
        console.log(`    ✅ Lead found: @${lead.username} (score: ${score}, fit: ${lead.fit})`);
      }
    }
    
    // Rate limiting - wait 2 seconds between queries
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Sort by score (highest first)
  allLeads.sort((a, b) => b.score - a.score);
  
  console.log(`\n✅ Found ${allLeads.length} qualified leads`);
  console.log(`   HIGH: ${allLeads.filter(l => l.fit === 'HIGH').length}`);
  console.log(`   MEDIUM: ${allLeads.filter(l => l.fit === 'MEDIUM').length}`);
  console.log(`   LOW: ${allLeads.filter(l => l.fit === 'LOW').length}`);
  
  return allLeads;
}

/**
 * Save leads to JSONL file
 */
async function saveLeads(leads, outputPath) {
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });
  
  const jsonl = leads.map(lead => JSON.stringify(lead)).join('\n');
  await fs.writeFile(outputPath, jsonl + '\n');
  
  console.log(`\n💾 Saved ${leads.length} leads to ${outputPath}`);
}

/**
 * Generate DM outreach suggestions for top leads
 */
function generateOutreachPlan(leads, topN = 10) {
  const topLeads = leads.slice(0, topN);
  
  const plan = {
    generated_at: new Date().toISOString(),
    total_leads: leads.length,
    outreach_batch: topLeads.length,
    leads: topLeads.map(lead => ({
      username: lead.username,
      name: lead.name,
      score: lead.score,
      fit: lead.fit,
      context: lead.tweet_text,
      dm_approach: generateDMApproach(lead),
      priority: lead.fit === 'HIGH' ? 1 : lead.fit === 'MEDIUM' ? 2 : 3
    }))
  };
  
  return plan;
}

/**
 * Generate personalized DM approach based on lead data
 */
function generateDMApproach(lead) {
  const approaches = [];
  
  // Acknowledge their pain
  if (lead.tweet_text.toLowerCase().includes('expensive')) {
    approaches.push('Acknowledge pricing frustration');
  }
  if (lead.tweet_text.toLowerCase().includes('not working')) {
    approaches.push('Empathize with poor results');
  }
  if (lead.tweet_text.toLowerCase().includes('looking for')) {
    approaches.push('Direct offer to help');
  }
  
  // Offer value
  approaches.push('Offer free test campaign (50 emails)');
  approaches.push('Share Caesar\'s Legions value prop ($250/mo vs $18K/mo agencies)');
  
  // Build credibility
  if (lead.followers > 5000) {
    approaches.push('Reference their audience/expertise');
  }
  
  return approaches.join(' → ');
}

/**
 * Main execution
 */
async function main() {
  const timestamp = new Date().toISOString().split('T')[0];
  const outputPath = path.join(__dirname, '..', 'research', `x-leads-${timestamp}.jsonl`);
  const planPath = path.join(__dirname, '..', 'research', `outreach-plan-${timestamp}.json`);
  
  try {
    // Scrape leads
    const leads = await scrapeLeads({
      minScore: 5,
      limit: 20
    });
    
    if (leads.length === 0) {
      console.log('⚠️  No leads found. Try different search queries.');
      return;
    }
    
    // Save leads
    await saveLeads(leads, outputPath);
    
    // Generate outreach plan for top 10
    const plan = generateOutreachPlan(leads, 10);
    await fs.writeFile(planPath, JSON.stringify(plan, null, 2));
    console.log(`📋 Outreach plan saved to ${planPath}`);
    
    // Print summary
    console.log('\n🎯 TOP 5 LEADS:');
    leads.slice(0, 5).forEach((lead, i) => {
      console.log(`\n${i + 1}. @${lead.username} (${lead.fit}, score: ${lead.score})`);
      console.log(`   ${lead.bio.substring(0, 80)}...`);
      console.log(`   Tweet: "${lead.tweet_text.substring(0, 100)}..."`);
      console.log(`   ${lead.followers.toLocaleString()} followers`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  scrapeLeads,
  scoreLead,
  extractLeadData,
  saveLeads,
  generateOutreachPlan,
  generateDMApproach
};
