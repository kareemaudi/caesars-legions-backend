/**
 * Prospect Scoring System for Caesar's Legions
 * 
 * Scores leads 0-100 based on multiple factors:
 * - Cold email pain signals
 * - Company stage/size
 * - Urgency indicators
 * - Engagement likelihood
 * 
 * Usage:
 *   const score = scoreProspect(lead);
 *   if (score >= 80) { prioritize for immediate outreach }
 */

/**
 * Score a prospect based on multiple factors
 * @param {Object} prospect - Prospect data from any source (Reddit, X, Apollo)
 * @returns {Object} - { score, factors, category }
 */
function scoreProspect(prospect) {
  let score = 0;
  const factors = [];
  
  // === PAIN SIGNALS (0-40 points) ===
  const painScore = calculatePainScore(prospect);
  score += painScore.score;
  factors.push(...painScore.factors);
  
  // === COMPANY FIT (0-30 points) ===
  const companyScore = calculateCompanyScore(prospect);
  score += companyScore.score;
  factors.push(...companyScore.factors);
  
  // === URGENCY (0-20 points) ===
  const urgencyScore = calculateUrgencyScore(prospect);
  score += urgencyScore.score;
  factors.push(...urgencyScore.factors);
  
  // === ENGAGEMENT (0-10 points) ===
  const engagementScore = calculateEngagementScore(prospect);
  score += engagementScore.score;
  factors.push(...engagementScore.factors);
  
  // Determine category
  const category = categorizeProspect(score);
  
  return {
    score: Math.min(100, Math.round(score)),
    factors,
    category,
    recommendation: getRecommendation(score, factors)
  };
}

/**
 * Calculate pain signal score (0-40 points)
 */
function calculatePainScore(prospect) {
  let score = 0;
  const factors = [];
  
  const text = [
    prospect.selftext || '',
    prospect.exact_quote || '',
    prospect.pain_points?.join(' ') || ''
  ].join(' ').toLowerCase();
  
  // HIGH PAIN SIGNALS (+15 points each)
  const highPainKeywords = [
    'cold email not working',
    'cold email is becoming a nightmare',
    'struggling with outbound',
    'cant get replies',
    'can\'t get replies',
    'low reply rate',
    '1.2% reply', '1% reply', '2% reply',
    'emails going to spam',
    'deliverability issues',
    'warmup taking',
    'no visibility into',
    'constantly checking blacklists',
    'need more meetings',
    'stuck for',
    'tried everything',
    'sent 147k emails', 'sent 100k emails',
    'nothing working',
    'hit a wall'
  ];
  
  for (const keyword of highPainKeywords) {
    if (text.includes(keyword)) {
      score += 15;
      factors.push(`🔴 High pain: "${keyword}"`);
      break; // Only count once
    }
  }
  
  // MEDIUM PAIN SIGNALS (+10 points each)
  const mediumPainKeywords = [
    'struggling',
    'frustrated',
    'not getting',
    'hard to',
    'difficult',
    'nightmare',
    'pain',
    'stuck'
  ];
  
  for (const keyword of mediumPainKeywords) {
    if (text.includes(keyword)) {
      score += 10;
      factors.push(`🟡 Medium pain: "${keyword}"`);
      break; // Only count once
    }
  }
  
  // COLD EMAIL MENTIONS (+10 points)
  if (text.match(/cold email|outbound|lead gen|b2b sales/i)) {
    score += 10;
    factors.push(`✅ Mentions cold email/outbound`);
  }
  
  // EXPLICIT ASK FOR HELP (+15 points)
  if (text.match(/anyone (know|recommend|help|solved|cracked)/i) ||
      text.match(/looking for|need (help|solution|advice)/i)) {
    score += 15;
    factors.push(`🚨 Explicit ask for help`);
  }
  
  // TECHNICAL COLD EMAIL PAIN (+10 points)
  if (text.match(/warmup|deliverability|blacklist|inbox placement|spam folder|sender reputation/i)) {
    score += 10;
    factors.push(`🔧 Technical cold email infrastructure pain`);
  }
  
  // DATA-DRIVEN COMPLAINT (+10 points) - They track metrics
  if (text.match(/\d+(\.\d+)?%\s*(reply|open|click|response) rate/i) ||
      text.match(/sent \d+(k|,\d{3})+ emails/i)) {
    score += 10;
    factors.push(`📊 Data-driven (tracks email metrics)`);
  }
  
  // MULTIPLE PAIN POINTS (+5 points if 3+)
  if (prospect.pain_points && prospect.pain_points.length >= 3) {
    score += 5;
    factors.push(`📋 Multiple pain points (${prospect.pain_points.length})`);
  }
  
  return { score: Math.min(40, score), factors };
}

/**
 * Calculate company fit score (0-30 points)
 */
function calculateCompanyScore(prospect) {
  let score = 0;
  const factors = [];
  
  // ARR / Revenue signals
  if (prospect.company_arr) {
    const arr = parseARR(prospect.company_arr);
    
    if (arr >= 500000 && arr <= 5000000) {
      score += 20;
      factors.push(`💰 Perfect ARR range: $${(arr/1000).toFixed(0)}K`);
    } else if (arr >= 100000 && arr < 500000) {
      score += 15;
      factors.push(`💰 Good ARR: $${(arr/1000).toFixed(0)}K`);
    } else if (arr >= 50000 && arr < 100000) {
      score += 10;
      factors.push(`💰 Early stage ARR: $${(arr/1000).toFixed(0)}K`);
    } else if (arr > 5000000) {
      score += 5;
      factors.push(`⚠️ High ARR (may need enterprise): $${(arr/1000).toFixed(0)}K`);
    }
  }
  
  // B2B SaaS indicators
  const text = [
    prospect.selftext || '',
    prospect.exact_quote || '',
    prospect.title || ''
  ].join(' ').toLowerCase();
  
  if (text.match(/b2b|saas|software/i)) {
    score += 10;
    factors.push(`✅ B2B SaaS confirmed`);
  }
  
  // Founder / Decision maker
  if (prospect.title?.match(/founder|ceo|vp|head of/i) ||
      prospect.author?.match(/founder|ceo/i) ||
      text.match(/i'm (building|running|founder)/i)) {
    score += 10;
    factors.push(`👑 Decision maker`);
  }
  
  return { score: Math.min(30, score), factors };
}

/**
 * Calculate urgency score (0-20 points)
 */
function calculateUrgencyScore(prospect) {
  let score = 0;
  const factors = [];
  
  const text = [
    prospect.selftext || '',
    prospect.exact_quote || ''
  ].join(' ').toLowerCase();
  
  // TIME PRESSURE (+15 points)
  if (text.match(/need (asap|urgently|now|this week|immediately)/i) ||
      text.match(/stuck for (months?|weeks?|a? long time)/i) ||
      text.match(/losing (money|deals|opportunities)/i)) {
    score += 15;
    factors.push(`⏰ High urgency / time pressure`);
  }
  
  // ACTIVE SEARCH (+10 points)
  if (text.match(/looking for|searching for|trying to find/i) ||
      text.match(/anyone recommend|what do you use/i)) {
    score += 10;
    factors.push(`🔍 Actively searching for solution`);
  }
  
  // RECENT POST (+5 points if <7 days old)
  if (prospect.created_utc || prospect.posted_date) {
    const postDate = prospect.created_utc 
      ? new Date(prospect.created_utc * 1000)
      : new Date(prospect.posted_date);
    
    const daysOld = (Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysOld < 7) {
      score += 5;
      factors.push(`📅 Posted ${Math.floor(daysOld)} days ago (recent)`);
    }
  }
  
  return { score: Math.min(20, score), factors };
}

/**
 * Calculate engagement likelihood score (0-10 points)
 */
function calculateEngagementScore(prospect) {
  let score = 0;
  const factors = [];
  
  // Platform engagement signals
  if (prospect.num_comments && prospect.num_comments > 5) {
    score += 5;
    factors.push(`💬 Active discussion (${prospect.num_comments} comments)`);
  }
  
  // Detailed post (shows genuine pain)
  const textLength = (prospect.selftext || '').length;
  if (textLength > 500) {
    score += 5;
    factors.push(`📝 Detailed post (${textLength} chars) = deep pain`);
  }
  
  return { score: Math.min(10, score), factors };
}

/**
 * Categorize prospect by score
 */
function categorizeProspect(score) {
  if (score >= 80) return 'hot';      // Drop everything, reach out now
  if (score >= 60) return 'warm';     // High priority, reach out today
  if (score >= 40) return 'qualified'; // Reach out this week
  return 'nurture';                    // Add to list, reach out later
}

/**
 * Get recommendation based on score
 */
function getRecommendation(score, factors) {
  if (score >= 80) {
    return {
      priority: 'P0',
      action: 'IMMEDIATE OUTREACH',
      timeline: 'Today (next 4 hours)',
      channel: 'DM (personalized)',
      why: 'Perfect fit + high urgency + active pain'
    };
  }
  
  if (score >= 60) {
    return {
      priority: 'P1',
      action: 'High priority outreach',
      timeline: 'Within 24 hours',
      channel: 'DM (personalized)',
      why: 'Good fit + clear pain signals'
    };
  }
  
  if (score >= 40) {
    return {
      priority: 'P2',
      action: 'Standard outreach',
      timeline: 'This week',
      channel: 'DM or comment reply',
      why: 'Qualified lead, may need nurturing'
    };
  }
  
  return {
    priority: 'P3',
    action: 'Add to nurture list',
    timeline: 'Follow up in 30-60 days',
    channel: 'Content engagement first',
    why: 'Early stage or low urgency'
  };
}

/**
 * Parse ARR from various formats
 */
function parseARR(arrString) {
  if (typeof arrString === 'number') return arrString;
  if (!arrString) return 0;
  
  const str = arrString.toString().toLowerCase().replace(/[^0-9kmb.]/g, '');
  
  let multiplier = 1;
  if (str.includes('k')) multiplier = 1000;
  if (str.includes('m')) multiplier = 1000000;
  if (str.includes('b')) multiplier = 1000000000;
  
  const num = parseFloat(str.replace(/[kmb]/g, ''));
  return num * multiplier;
}

/**
 * Batch score multiple prospects
 */
function scoreProspects(prospects) {
  return prospects
    .map(p => ({
      ...p,
      scoring: scoreProspect(p)
    }))
    .sort((a, b) => b.scoring.score - a.scoring.score);
}

module.exports = {
  scoreProspect,
  scoreProspects
};
