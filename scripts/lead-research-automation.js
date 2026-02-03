// Lead Research Automation
// Continuously finds B2B SaaS founders discussing cold email pain
// Sources: X/Twitter, Reddit (r/SaaS, r/indiehackers, r/B2BSaaS)
// Output: research/prospects-YYYY-MM-DD.jsonl

const fs = require('fs');
const path = require('path');

// ========================
// CONFIGURATION
// ========================

const CONFIG = {
  // Search queries for X/Twitter
  xQueries: [
    'cold email not working',
    'low reply rate outbound',
    'struggling with cold outreach',
    'need better cold emails',
    'outbound sales broken',
    'cold email advice',
    'how to improve cold email',
    'cold email reply rate',
    'best cold email tool',
    'alternative to instantly',
    'alternative to lemlist',
    'cold email deliverability'
  ],
  
  // Reddit subreddits to monitor
  subreddits: [
    'SaaS',
    'indiehackers',
    'B2BSaaS',
    'startups',
    'sales',
    'smallbusiness',
    'Entrepreneur'
  ],
  
  // Keywords indicating pain points
  painKeywords: [
    'reply rate',
    'not getting replies',
    'emails going to spam',
    'deliverability',
    'bounce rate',
    'open rate',
    'looking for',
    'need help',
    'struggling',
    'frustrat',
    'better alternative',
    'recommendations',
    'which tool'
  ],
  
  // Qualification criteria
  minFollowers: 100, // For X accounts
  minRevenue: 5000, // Monthly (if mentioned)
  targetIndustries: [
    'SaaS',
    'B2B',
    'software',
    'tech',
    'agency',
    'consulting',
    'services'
  ],
  
  // Output
  outputDir: path.join(__dirname, '../research'),
  maxProspectsPerRun: 50,
  
  // Deduplication
  prospectCacheFile: path.join(__dirname, '../research/prospect-cache.json')
};

// ========================
// PROSPECT SCORING
// ========================

/**
 * Score a prospect based on various signals
 * Returns 0-100
 */
function scoreProspect(data) {
  let score = 0;
  
  // Source weight (X > Reddit for direct outreach)
  if (data.source === 'twitter') score += 20;
  if (data.source === 'reddit') score += 15;
  
  // Engagement signals
  if (data.followers > 1000) score += 15;
  if (data.followers > 5000) score += 10; // bonus
  if (data.engagement_rate > 2) score += 10;
  
  // Pain point clarity
  if (data.pain_explicit) score += 20; // Explicitly mentioned pain
  if (data.looking_for_solution) score += 15; // Actively seeking solutions
  
  // Revenue signals
  if (data.mentioned_revenue) {
    if (data.revenue > 10000) score += 15;
    else if (data.revenue > 5000) score += 10;
  }
  
  // Recency (recent posts = higher intent)
  const daysSincePost = (Date.now() - data.post_timestamp) / (1000 * 60 * 60 * 24);
  if (daysSincePost < 1) score += 10;
  else if (daysSincePost < 7) score += 5;
  
  // Industry fit
  if (data.industry && CONFIG.targetIndustries.includes(data.industry)) {
    score += 10;
  }
  
  return Math.min(100, score);
}

/**
 * Categorize prospect priority
 */
function categorizePriority(score) {
  if (score >= 80) return 'HOT';
  if (score >= 60) return 'WARM';
  if (score >= 40) return 'COLD';
  return 'RESEARCH';
}

// ========================
// X/TWITTER SCRAPING
// ========================

/**
 * Search X/Twitter for cold email pain points
 * Note: Requires bird CLI or browser automation
 */
async function searchTwitter(query, limit = 10) {
  // This would use bird CLI or browser automation
  // For now, returning mock structure
  
  console.log(`[Twitter] Searching: "${query}"`);
  
  // TODO: Implement actual search
  // const { exec } = require('child_process');
  // const { promisify } = require('util');
  // const execAsync = promisify(exec);
  // const result = await execAsync(`bird search "${query}" --limit ${limit}`);
  
  return [];
}

/**
 * Extract prospect data from tweet
 */
function extractTwitterProspect(tweet) {
  const prospect = {
    id: tweet.id,
    source: 'twitter',
    username: tweet.username,
    display_name: tweet.display_name,
    bio: tweet.bio || '',
    followers: tweet.followers || 0,
    following: tweet.following || 0,
    profile_url: `https://x.com/${tweet.username}`,
    post_url: tweet.url,
    post_text: tweet.text,
    post_timestamp: new Date(tweet.created_at).getTime(),
    engagement_rate: calculateTwitterEngagement(tweet),
    pain_explicit: detectPainPoint(tweet.text),
    looking_for_solution: detectSolutionSeeking(tweet.text),
    mentioned_revenue: extractRevenue(tweet.text),
    industry: extractIndustry(tweet.bio + ' ' + tweet.text),
    discovered_at: new Date().toISOString()
  };
  
  prospect.score = scoreProspect(prospect);
  prospect.priority = categorizePriority(prospect.score);
  
  return prospect;
}

function calculateTwitterEngagement(tweet) {
  const total = (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0);
  return tweet.followers > 0 ? (total / tweet.followers) * 100 : 0;
}

// ========================
// REDDIT SCRAPING
// ========================

/**
 * Search Reddit for discussions
 */
async function searchReddit(subreddit, keywords, limit = 10) {
  console.log(`[Reddit] Searching r/${subreddit} for: ${keywords.join(', ')}`);
  
  // TODO: Implement with reddit-cli or web scraping
  // For now, returning mock structure
  
  return [];
}

/**
 * Extract prospect from Reddit post/comment
 */
function extractRedditProspect(post) {
  const prospect = {
    id: post.id,
    source: 'reddit',
    username: post.author,
    subreddit: post.subreddit,
    profile_url: `https://reddit.com/user/${post.author}`,
    post_url: post.url,
    post_title: post.title || '',
    post_text: post.text || post.body || '',
    post_timestamp: new Date(post.created_at).getTime(),
    karma: post.author_karma || 0,
    pain_explicit: detectPainPoint(post.text || post.body || ''),
    looking_for_solution: detectSolutionSeeking(post.text || post.body || ''),
    mentioned_revenue: extractRevenue(post.text || post.body || ''),
    discovered_at: new Date().toISOString()
  };
  
  prospect.score = scoreProspect(prospect);
  prospect.priority = categorizePriority(prospect.score);
  
  return prospect;
}

// ========================
// SIGNAL DETECTION
// ========================

/**
 * Detect explicit pain point mentions
 */
function detectPainPoint(text) {
  const painPhrases = [
    /reply rate.*low/i,
    /not getting.*replies/i,
    /emails.*spam/i,
    /struggling with.*email/i,
    /cold email.*not working/i,
    /deliverability.*issue/i,
    /bounce.*high/i
  ];
  
  return painPhrases.some(pattern => pattern.test(text));
}

/**
 * Detect if actively seeking solutions
 */
function detectSolutionSeeking(text) {
  const seekingPhrases = [
    /looking for/i,
    /need.*tool/i,
    /recommend/i,
    /alternative to/i,
    /better than/i,
    /which.*should I use/i,
    /help.*with/i
  ];
  
  return seekingPhrases.some(pattern => pattern.test(text));
}

/**
 * Extract revenue mentions
 */
function extractRevenue(text) {
  const revenuePatterns = [
    /\$(\d+)k?\s*(mrr|arr|\/mo|per month)/i,
    /(\d+)k?\s*(mrr|arr)/i
  ];
  
  for (const pattern of revenuePatterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseInt(match[1].replace(/,/g, ''));
      const unit = match[2].toLowerCase();
      
      if (unit.includes('arr') || unit.includes('year')) {
        return amount / 12; // Convert to monthly
      }
      return amount;
    }
  }
  
  return null;
}

/**
 * Extract industry from bio/text
 */
function extractIndustry(text) {
  const industryKeywords = {
    'SaaS': /\bsaas\b/i,
    'B2B': /\bb2b\b/i,
    'software': /software/i,
    'agency': /agency/i,
    'consulting': /consult/i
  };
  
  for (const [industry, pattern] of Object.entries(industryKeywords)) {
    if (pattern.test(text)) {
      return industry;
    }
  }
  
  return null;
}

// ========================
// DEDUPLICATION
// ========================

/**
 * Load prospect cache
 */
function loadProspectCache() {
  try {
    if (fs.existsSync(CONFIG.prospectCacheFile)) {
      return new Set(JSON.parse(fs.readFileSync(CONFIG.prospectCacheFile, 'utf8')));
    }
  } catch (error) {
    console.error('[Cache] Failed to load:', error.message);
  }
  return new Set();
}

/**
 * Save prospect cache
 */
function saveProspectCache(cache) {
  try {
    const dir = path.dirname(CONFIG.prospectCacheFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      CONFIG.prospectCacheFile,
      JSON.stringify([...cache], null, 2)
    );
  } catch (error) {
    console.error('[Cache] Failed to save:', error.message);
  }
}

/**
 * Check if prospect already exists
 */
function isDuplicate(prospect, cache) {
  const key = `${prospect.source}:${prospect.id}`;
  return cache.has(key);
}

/**
 * Add prospect to cache
 */
function addToCache(prospect, cache) {
  const key = `${prospect.source}:${prospect.id}`;
  cache.add(key);
}

// ========================
// OUTPUT
// ========================

/**
 * Save prospects to JSONL file
 */
function saveProspects(prospects) {
  const today = new Date().toISOString().split('T')[0];
  const filename = `prospects-${today}.jsonl`;
  const filepath = path.join(CONFIG.outputDir, filename);
  
  // Create directory if needed
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }
  
  // Append to file
  const lines = prospects.map(p => JSON.stringify(p)).join('\n') + '\n';
  fs.appendFileSync(filepath, lines);
  
  console.log(`✓ Saved ${prospects.length} prospects to ${filename}`);
  
  return filepath;
}

/**
 * Generate summary report
 */
function generateSummary(prospects) {
  const byPriority = prospects.reduce((acc, p) => {
    acc[p.priority] = (acc[p.priority] || 0) + 1;
    return acc;
  }, {});
  
  const bySource = prospects.reduce((acc, p) => {
    acc[p.source] = (acc[p.source] || 0) + 1;
    return acc;
  }, {});
  
  const avgScore = prospects.reduce((sum, p) => sum + p.score, 0) / prospects.length;
  
  const withPain = prospects.filter(p => p.pain_explicit).length;
  const seekingSolution = prospects.filter(p => p.looking_for_solution).length;
  
  return {
    total: prospects.length,
    by_priority: byPriority,
    by_source: bySource,
    avg_score: avgScore.toFixed(1),
    with_explicit_pain: withPain,
    seeking_solution: seekingSolution,
    top_5: prospects
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(p => ({
        priority: p.priority,
        score: p.score,
        source: p.source,
        username: p.username,
        url: p.profile_url
      }))
  };
}

// ========================
// MAIN RESEARCH FUNCTION
// ========================

/**
 * Run lead research cycle
 */
async function runResearch(options = {}) {
  const {
    sources = ['twitter', 'reddit'],
    maxProspects = CONFIG.maxProspectsPerRun,
    verbose = false
  } = options;
  
  console.log('🔍 Starting lead research...\n');
  
  const startTime = Date.now();
  const cache = loadProspectCache();
  const prospects = [];
  
  // Search X/Twitter
  if (sources.includes('twitter')) {
    console.log('📱 Searching X/Twitter...');
    
    for (const query of CONFIG.xQueries.slice(0, 3)) { // Limit queries for now
      try {
        const results = await searchTwitter(query, 10);
        
        for (const tweet of results) {
          const prospect = extractTwitterProspect(tweet);
          
          if (!isDuplicate(prospect, cache)) {
            prospects.push(prospect);
            addToCache(prospect, cache);
            
            if (verbose) {
              console.log(`  → ${prospect.priority} (${prospect.score}): @${prospect.username}`);
            }
            
            if (prospects.length >= maxProspects) break;
          }
        }
        
        if (prospects.length >= maxProspects) break;
      } catch (error) {
        console.error(`  ✗ Error searching "${query}":`, error.message);
      }
    }
  }
  
  // Search Reddit
  if (sources.includes('reddit')) {
    console.log('\n🔴 Searching Reddit...');
    
    for (const subreddit of CONFIG.subreddits.slice(0, 3)) { // Limit subreddits
      try {
        const results = await searchReddit(subreddit, CONFIG.painKeywords, 10);
        
        for (const post of results) {
          const prospect = extractRedditProspect(post);
          
          if (!isDuplicate(prospect, cache)) {
            prospects.push(prospect);
            addToCache(prospect, cache);
            
            if (verbose) {
              console.log(`  → ${prospect.priority} (${prospect.score}): u/${prospect.username}`);
            }
            
            if (prospects.length >= maxProspects) break;
          }
        }
        
        if (prospects.length >= maxProspects) break;
      } catch (error) {
        console.error(`  ✗ Error searching r/${subreddit}:`, error.message);
      }
    }
  }
  
  // Save results
  if (prospects.length > 0) {
    saveProspects(prospects);
    saveProspectCache(cache);
  }
  
  // Generate summary
  const summary = generateSummary(prospects);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n📊 Research Summary:');
  console.log(`   Total found: ${summary.total}`);
  console.log(`   By priority: ${JSON.stringify(summary.by_priority)}`);
  console.log(`   Avg score: ${summary.avg_score}`);
  console.log(`   With pain: ${summary.with_explicit_pain} (${((summary.with_explicit_pain/summary.total)*100).toFixed(0)}%)`);
  console.log(`   Seeking solution: ${summary.seeking_solution} (${((summary.seeking_solution/summary.total)*100).toFixed(0)}%)`);
  console.log(`   Duration: ${duration}s\n`);
  
  if (summary.top_5.length > 0) {
    console.log('🔥 Top 5 prospects:');
    summary.top_5.forEach((p, i) => {
      console.log(`   ${i+1}. [${p.priority}] ${p.source}/${p.username} (${p.score})`);
    });
  }
  
  return {
    success: true,
    prospects,
    summary,
    duration
  };
}

// ========================
// CLI INTERFACE
// ========================

if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options = {
    sources: ['twitter', 'reddit'],
    maxProspects: 50,
    verbose: args.includes('--verbose') || args.includes('-v')
  };
  
  runResearch(options)
    .then(result => {
      console.log('\n✓ Research complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ Research failed:', error);
      process.exit(1);
    });
}

// ========================
// EXPORTS
// ========================

module.exports = {
  runResearch,
  scoreProspect,
  detectPainPoint,
  detectSolutionSeeking,
  extractRevenue,
  extractIndustry
};
