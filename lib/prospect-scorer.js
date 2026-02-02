/**
 * Prospect Scoring System for Caesar's Legions
 * 
 * Scores potential clients based on fit criteria:
 * - Company size (employees)
 * - Revenue indicators (MRR mentions, funding)
 * - Activity on X/Twitter
 * - Pain point signals (complaints about cold email)
 * - Build-in-public engagement
 * 
 * Score: 0-100 (70+ = hot lead, 50-69 = warm, <50 = cold)
 */

/**
 * Score a prospect based on available data
 * @param {Object} prospect - Prospect data
 * @param {string} prospect.name - Full name
 * @param {string} prospect.title - Job title
 * @param {string} prospect.company - Company name
 * @param {number} prospect.employees - Employee count
 * @param {string} prospect.twitter - Twitter handle
 * @param {string} prospect.linkedin - LinkedIn URL
 * @param {Array<string>} prospect.recentTweets - Recent tweet texts
 * @param {Object} prospect.signals - Pain point signals
 * @returns {Object} Score breakdown and total
 */
function scoreProspect(prospect) {
  let score = 0;
  const breakdown = {
    title: 0,
    companySize: 0,
    activity: 0,
    painPoints: 0,
    buildInPublic: 0,
    revenueSignals: 0,
  };

  // 1. Title Score (max 20 points)
  if (prospect.title) {
    const title = prospect.title.toLowerCase();
    if (title.includes('founder') || title.includes('co-founder')) {
      breakdown.title = 20;
    } else if (title.includes('ceo')) {
      breakdown.title = 18;
    } else if (title.includes('cto') || title.includes('coo')) {
      breakdown.title = 15;
    } else if (title.includes('head of') || title.includes('vp')) {
      breakdown.title = 12;
    } else if (title.includes('director')) {
      breakdown.title = 8;
    }
  }

  // 2. Company Size Score (max 20 points)
  // Sweet spot: 5-50 employees (need sales, can afford)
  if (prospect.employees) {
    const emp = prospect.employees;
    if (emp >= 5 && emp <= 20) {
      breakdown.companySize = 20; // Perfect size
    } else if (emp >= 21 && emp <= 50) {
      breakdown.companySize = 18;
    } else if (emp >= 2 && emp <= 4) {
      breakdown.companySize = 15;
    } else if (emp === 1) {
      breakdown.companySize = 10; // Solo founder (tight budget)
    } else if (emp > 50 && emp <= 200) {
      breakdown.companySize = 12; // Larger, but slower
    } else {
      breakdown.companySize = 5; // Too big (procurement) or no data
    }
  }

  // 3. Twitter Activity Score (max 20 points)
  if (prospect.twitter && prospect.recentTweets) {
    const tweets = prospect.recentTweets;
    const tweetCount = tweets.length;
    
    // Active poster (10 points)
    if (tweetCount >= 5) {
      breakdown.activity = 10;
    } else if (tweetCount >= 3) {
      breakdown.activity = 7;
    } else if (tweetCount >= 1) {
      breakdown.activity = 4;
    }
    
    // Build-in-public signals (10 points)
    const bipKeywords = ['building', 'shipped', 'launched', 'working on', 'update', 'progress'];
    const hasBIP = tweets.some(t => 
      bipKeywords.some(kw => t.toLowerCase().includes(kw))
    );
    if (hasBIP) {
      breakdown.activity += 10;
    }
  }

  // 4. Pain Point Signals (max 25 points) - MOST IMPORTANT
  if (prospect.signals) {
    const signals = prospect.signals;
    
    // Direct cold email pain (15 points)
    if (signals.coldEmailPain) {
      breakdown.painPoints = 15;
    }
    
    // Needs more leads (10 points)
    if (signals.needsLeads) {
      breakdown.painPoints += 10;
    }
    
    // Asked for recommendations (8 points)
    if (signals.askedForRecs) {
      breakdown.painPoints += 8;
    }
    
    // Mentioned low response rates (7 points)
    if (signals.lowResponseRate) {
      breakdown.painPoints += 7;
    }
  } else if (prospect.recentTweets) {
    // Auto-detect pain signals from tweets
    const painKeywords = [
      'cold email',
      'outbound',
      'lead gen',
      'need more customers',
      'need more leads',
      'how to get customers',
      'struggling with sales',
      'nobody responding'
    ];
    
    const tweets = prospect.recentTweets.join(' ').toLowerCase();
    painKeywords.forEach(keyword => {
      if (tweets.includes(keyword)) {
        breakdown.painPoints += 5; // Max 25 if 5+ keywords match
      }
    });
    breakdown.painPoints = Math.min(breakdown.painPoints, 25);
  }

  // 5. Build-in-Public Score (max 10 points)
  if (prospect.recentTweets) {
    const tweets = prospect.recentTweets.join(' ').toLowerCase();
    const bipIndicators = [
      '#buildinpublic',
      'day 1 of',
      'mrr update',
      'revenue update',
      'building in public'
    ];
    
    if (bipIndicators.some(indicator => tweets.includes(indicator))) {
      breakdown.buildInPublic = 10;
    }
  }

  // 6. Revenue Signals (max 5 points)
  if (prospect.recentTweets) {
    const tweets = prospect.recentTweets.join(' ').toLowerCase();
    const revenueIndicators = ['mrr', 'arr', '$', 'revenue', 'customers'];
    
    if (revenueIndicators.some(indicator => tweets.includes(indicator))) {
      breakdown.revenueSignals = 5;
    }
  }

  // Calculate total
  score = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

  // Determine tier
  let tier = 'cold';
  if (score >= 70) tier = 'hot';
  else if (score >= 50) tier = 'warm';

  return {
    score,
    tier,
    breakdown,
    recommendation: getRecommendation(tier, breakdown)
  };
}

/**
 * Get outreach recommendation based on score
 */
function getRecommendation(tier, breakdown) {
  if (tier === 'hot') {
    return {
      priority: 'HIGH',
      template: breakdown.painPoints >= 15 ? 'Template 1: Direct Pain Point' : 'Template 2: Build in Public',
      timing: 'Reach out ASAP',
      approach: 'Highly personalized DM referencing specific tweet/pain point'
    };
  } else if (tier === 'warm') {
    return {
      priority: 'MEDIUM',
      template: breakdown.buildInPublic >= 8 ? 'Template 4: Case Study Approach' : 'Template 3: Direct ROI Pitch',
      timing: 'Reach out within 48 hours',
      approach: 'Personalized DM with value prop'
    };
  } else {
    return {
      priority: 'LOW',
      template: 'Template 3: Direct ROI Pitch',
      timing: 'Low priority - focus on hot/warm first',
      approach: 'Generic DM or skip for now'
    };
  }
}

/**
 * Batch score multiple prospects and sort by score
 */
function batchScore(prospects) {
  const scored = prospects.map(p => ({
    ...p,
    scoring: scoreProspect(p)
  }));

  // Sort by score (highest first)
  scored.sort((a, b) => b.scoring.score - a.scoring.score);

  return scored;
}

/**
 * Filter prospects by minimum score
 */
function filterByScore(prospects, minScore = 50) {
  const scored = batchScore(prospects);
  return scored.filter(p => p.scoring.score >= minScore);
}

module.exports = {
  scoreProspect,
  batchScore,
  filterByScore
};
