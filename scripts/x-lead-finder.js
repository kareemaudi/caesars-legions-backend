#!/usr/bin/env node
// X Lead Finder - Find B2B SaaS founders discussing cold email pain
// Runs autonomously via cron to build prospect database

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '../research');
const PROSPECTS_FILE = path.join(RESEARCH_DIR, 'prospects.jsonl');

// Ensure research directory exists
if (!fs.existsSync(RESEARCH_DIR)) {
  fs.mkdirSync(RESEARCH_DIR, { recursive: true });
}

// Search queries for finding cold email pain points
const SEARCH_QUERIES = [
  'cold email help',
  'outbound sales strategy',
  'lead generation advice',
  'SDR hiring expensive',
  'book more demos',
  'B2B sales funnel',
  'cold outreach tips',
  'email deliverability issues'
];

// Scoring criteria
function scoreProspect(tweet) {
  let score = 0;
  
  // High engagement (more likely to respond)
  if (tweet.likes > 10) score += 10;
  if (tweet.retweets > 5) score += 10;
  if (tweet.replies > 3) score += 10;
  
  // Recent activity (still active on X)
  const hoursSincePosted = (Date.now() - new Date(tweet.created_at)) / (1000 * 60 * 60);
  if (hoursSincePosted < 24) score += 15;
  else if (hoursSincePosted < 72) score += 10;
  else if (hoursSincePosted < 168) score += 5;
  
  // Keywords indicating pain points
  const painKeywords = ['struggling', 'need help', 'looking for', 'recommendations', 'frustrated', 'tired of'];
  painKeywords.forEach(keyword => {
    if (tweet.text.toLowerCase().includes(keyword)) score += 5;
  });
  
  // B2B SaaS indicators
  const b2bKeywords = ['saas', 'b2b', 'founder', 'ceo', 'startup', 'mrr', 'arr'];
  b2bKeywords.forEach(keyword => {
    if (tweet.text.toLowerCase().includes(keyword)) score += 3;
  });
  
  return score;
}

// Extract prospect info from tweet
function extractProspect(tweet) {
  return {
    id: tweet.id,
    username: tweet.username,
    name: tweet.name,
    bio: tweet.bio || '',
    followers: tweet.followers || 0,
    tweet_text: tweet.text,
    tweet_url: `https://x.com/${tweet.username}/status/${tweet.id}`,
    posted_at: tweet.created_at,
    engagement: {
      likes: tweet.likes || 0,
      retweets: tweet.retweets || 0,
      replies: tweet.replies || 0
    },
    score: scoreProspect(tweet),
    pain_point: extractPainPoint(tweet.text),
    found_at: new Date().toISOString(),
    contacted: false,
    campaign_id: null
  };
}

// Extract the main pain point from tweet
function extractPainPoint(text) {
  const painPatterns = [
    /struggling (with|to) ([^.!?]+)/i,
    /need help (with|on) ([^.!?]+)/i,
    /looking for ([^.!?]+)/i,
    /how (to|do you) ([^.!?]+)/i,
    /(tired of|frustrated with) ([^.!?]+)/i
  ];
  
  for (const pattern of painPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  
  return text.slice(0, 100); // Fallback: first 100 chars
}

// Search X for prospects (using bird CLI from skills/bird)
async function searchX(query) {
  try {
    console.log(`🔍 Searching X for: "${query}"`);
    
    // Note: This requires bird CLI to be configured
    // For now, returning mock data structure for development
    console.log('⚠️  Bird CLI integration pending - building data structure');
    
    // TODO: Integrate with skills/bird when ready
    // const result = execSync(`bird search "${query}" --limit 20`);
    // const tweets = JSON.parse(result);
    
    return [];
  } catch (error) {
    console.error(`Error searching X: ${error.message}`);
    return [];
  }
}

// Search Reddit for prospects
async function searchReddit(subreddit, query) {
  try {
    console.log(`🔍 Searching r/${subreddit} for: "${query}"`);
    
    // Note: This would use reddit-cli skill
    console.log('⚠️  Reddit CLI integration pending - building data structure');
    
    return [];
  } catch (error) {
    console.error(`Error searching Reddit: ${error.message}`);
    return [];
  }
}

// Save prospect to database
function saveProspect(prospect) {
  const line = JSON.stringify(prospect) + '\n';
  fs.appendFileSync(PROSPECTS_FILE, line);
  console.log(`✅ Saved prospect: @${prospect.username} (score: ${prospect.score})`);
}

// Check if prospect already exists
function prospectExists(username) {
  if (!fs.existsSync(PROSPECTS_FILE)) return false;
  
  const lines = fs.readFileSync(PROSPECTS_FILE, 'utf-8').split('\n').filter(Boolean);
  return lines.some(line => {
    const prospect = JSON.parse(line);
    return prospect.username === username;
  });
}

// Main execution
async function main() {
  console.log('🏛️ Caesar\'s Legions - X Lead Finder\n');
  console.log(`📊 Target: Find 50 qualified B2B SaaS prospects`);
  console.log(`📁 Database: ${PROSPECTS_FILE}\n`);
  
  let newProspects = 0;
  let totalFound = 0;
  
  // Search X
  for (const query of SEARCH_QUERIES) {
    const results = await searchX(query);
    totalFound += results.length;
    
    for (const tweet of results) {
      // Skip if already in database
      if (prospectExists(tweet.username)) {
        console.log(`⏭️  Skipping @${tweet.username} (already in database)`);
        continue;
      }
      
      const prospect = extractProspect(tweet);
      
      // Only save if score > 20 (quality filter)
      if (prospect.score >= 20) {
        saveProspect(prospect);
        newProspects++;
      } else {
        console.log(`⏭️  Skipping @${prospect.username} (score too low: ${prospect.score})`);
      }
    }
    
    // Rate limit: wait 2 seconds between searches
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Search Reddit
  const subreddits = ['SaaS', 'indiehackers', 'Entrepreneur', 'startups'];
  for (const subreddit of subreddits) {
    const results = await searchReddit(subreddit, 'cold email');
    // Process results similar to X
  }
  
  // Summary
  console.log(`\n📈 Summary:`);
  console.log(`   Found: ${totalFound} total prospects`);
  console.log(`   New: ${newProspects} high-quality leads added`);
  console.log(`   Database: ${PROSPECTS_FILE}`);
  
  // Get top prospects by score
  if (fs.existsSync(PROSPECTS_FILE)) {
    const lines = fs.readFileSync(PROSPECTS_FILE, 'utf-8').split('\n').filter(Boolean);
    const prospects = lines.map(line => JSON.parse(line));
    const top10 = prospects
      .filter(p => !p.contacted)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    
    console.log(`\n🎯 Top 10 Prospects to Contact:`);
    top10.forEach((p, i) => {
      console.log(`   ${i + 1}. @${p.username} (score: ${p.score}) - "${p.pain_point.slice(0, 50)}..."`);
    });
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Error:', error);
    process.exit(1);
  });
}

module.exports = { searchX, extractProspect, scoreProspect };
