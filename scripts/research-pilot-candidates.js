#!/usr/bin/env node

/**
 * Research Pilot Client Candidates
 * 
 * Searches X and Reddit for B2B SaaS founders who:
 * - Posted about sales/growth challenges in last 7 days
 * - Active (>500 followers or regular poster)
 * - Serious business (mentions revenue, customers, etc.)
 * 
 * Output: data/pilot-candidates.json
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../data/pilot-candidates.json');

// Research queries to manually search
const RESEARCH_QUERIES = {
  twitter: [
    '"struggling with outbound" OR "cold email not working" -filter:retweets',
    '"need help with B2B sales" -filter:retweets',
    '"how to get first customers" B2B -filter:retweets',
    '"scaling sales" SaaS -filter:retweets',
    '"hiring SDR" expensive -filter:retweets'
  ],
  reddit: [
    'r/SaaS "first customers"',
    'r/b2bmarketing "cold email"',
    'r/startups "outbound sales"',
    'r/Entrepreneur "B2B sales"'
  ]
};

// Candidate template
const candidateTemplate = {
  id: '',
  source: '', // 'twitter' or 'reddit'
  name: '',
  handle: '', // @username or u/username
  url: '',
  company: '',
  title: '',
  research_note: '', // Specific thing they posted
  pain_point: '', // Their challenge
  fit_score: 0, // 0-100
  status: 'new', // new, contacted, replied, booked, rejected
  contacted_at: null,
  notes: ''
};

function generateResearchGuide() {
  console.log('🔍 PILOT CLIENT RESEARCH GUIDE\n');
  console.log('='.repeat(60));
  console.log('\n📋 MANUAL RESEARCH STEPS:\n');
  
  console.log('1️⃣  TWITTER/X SEARCHES:');
  console.log('   Go to https://twitter.com/search-advanced\n');
  RESEARCH_QUERIES.twitter.forEach((query, i) => {
    console.log(`   ${i + 1}. Search: ${query}`);
    console.log(`      Look for: Founders posting in last 7 days`);
    console.log(`      Check: Bio mentions "founder" or "CEO"`);
    console.log(`      Verify: >500 followers or active posting\n`);
  });
  
  console.log('\n2️⃣  REDDIT SEARCHES:');
  console.log('   Go to https://reddit.com/search\n');
  RESEARCH_QUERIES.reddit.forEach((query, i) => {
    console.log(`   ${i + 1}. Search: ${query}`);
    console.log(`      Look for: Posts in last 7 days`);
    console.log(`      Check: OP mentions their company/product`);
    console.log(`      Verify: Active comment history\n`);
  });
  
  console.log('\n3️⃣  QUALIFICATION CRITERIA:\n');
  console.log('   ✅ B2B SaaS founder or VP of Sales');
  console.log('   ✅ Posted about sales challenges in last 7 days');
  console.log('   ✅ Mentions specific pain (e.g., "can\'t hire SDRs")');
  console.log('   ✅ Active account (not abandoned)');
  console.log('   ✅ Serious business (talks about revenue, customers)');
  console.log('   ✅ Reachable (accepts DMs or has email)\n');
  
  console.log('\n4️⃣  SCORING SYSTEM:\n');
  console.log('   90-100: Perfect fit (active founder, urgent pain, reachable)');
  console.log('   80-89:  Great fit (founder, clear pain, active)');
  console.log('   70-79:  Good fit (relevant role, some pain)');
  console.log('   60-69:  Okay fit (B2B but not perfect timing)');
  console.log('   <60:    Skip (wrong ICP or not serious)\n');
  
  console.log('\n5️⃣  DATA TO COLLECT:\n');
  console.log('   For each candidate, save:');
  console.log('   • Name');
  console.log('   • Handle (@username or u/username)');
  console.log('   • URL to their post');
  console.log('   • Company name (if mentioned)');
  console.log('   • Title (Founder, CEO, VP Sales, etc.)');
  console.log('   • Research note (specific thing they posted)');
  console.log('   • Pain point (their challenge)');
  console.log('   • Fit score (0-100)\n');
  
  console.log('\n6️⃣  HOW TO USE THIS DATA:\n');
  console.log('   • Add candidates to: ' + OUTPUT_FILE);
  console.log('   • Sort by fit_score (highest first)');
  console.log('   • Draft personalized DMs for top 10');
  console.log('   • Send outreach within 24 hours (while pain is fresh)');
  console.log('   • Track responses and update status\n');
  
  console.log('='.repeat(60));
  console.log('\n✨ EXAMPLES OF PERFECT CANDIDATES:\n');
  
  const examples = [
    {
      source: 'Twitter',
      post: 'Tweet: "Month 3 of trying to hire an SDR. 15 interviews, 0 offers accepted. Is outbound just impossible now?"',
      why: 'Perfect - urgent pain (hiring SDR), clear timeline (month 3), decision-maker language'
    },
    {
      source: 'Reddit',
      post: 'Post in r/SaaS: "Hit $10K MRR but stuck. Cold email gets 2% reply rate. What am I doing wrong?"',
      why: 'Perfect - has revenue ($10K MRR), specific pain (low reply rate), asking for help'
    },
    {
      source: 'Twitter',
      post: 'Tweet: "Raised Series A but board expects 3x growth. Need to figure out sales fast."',
      why: 'Perfect - timing (just raised), urgency (board pressure), decision-maker (can buy)'
    }
  ];
  
  examples.forEach((ex, i) => {
    console.log(`${i + 1}. ${ex.source}:`);
    console.log(`   ${ex.post}`);
    console.log(`   ✅ Why perfect: ${ex.why}\n`);
  });
  
  console.log('='.repeat(60));
  console.log('\n📝 NEXT STEPS:\n');
  console.log('1. Spend 2 hours researching (aim for 20 candidates)');
  console.log('2. Score all candidates');
  console.log('3. Draft DMs for top 10');
  console.log('4. Send outreach');
  console.log('5. Track responses\n');
  console.log('🎯 GOAL: 1 pilot client booked by end of week\n');
}

function loadCandidates() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    return [];
  }
  
  const data = fs.readFileSync(OUTPUT_FILE, 'utf8');
  return JSON.parse(data);
}

function saveCandidates(candidates) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(candidates, null, 2));
}

function showCandidates() {
  const candidates = loadCandidates();
  
  if (candidates.length === 0) {
    console.log('\n❌ No candidates found. Run research first.\n');
    return;
  }
  
  console.log(`\n📊 PILOT CANDIDATES (${candidates.length} total)\n`);
  console.log('='.repeat(60));
  
  // Sort by fit score
  candidates.sort((a, b) => b.fit_score - a.fit_score);
  
  candidates.forEach((c, i) => {
    console.log(`\n${i + 1}. ${c.name} (@${c.handle}) - Score: ${c.fit_score}/100`);
    console.log(`   Company: ${c.company || 'N/A'}`);
    console.log(`   Title: ${c.title || 'N/A'}`);
    console.log(`   Source: ${c.source}`);
    console.log(`   Pain: ${c.pain_point}`);
    console.log(`   Research: ${c.research_note}`);
    console.log(`   URL: ${c.url}`);
    console.log(`   Status: ${c.status}`);
    if (c.notes) console.log(`   Notes: ${c.notes}`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Top 5 candidates (${candidates.filter(c => c.fit_score >= 80).length} with score ≥80)`);
  console.log(`⏳ To contact: ${candidates.filter(c => c.status === 'new').length}`);
  console.log(`📧 Contacted: ${candidates.filter(c => c.status === 'contacted').length}`);
  console.log(`💬 Replied: ${candidates.filter(c => c.status === 'replied').length}`);
  console.log(`✅ Booked: ${candidates.filter(c => c.status === 'booked').length}\n`);
}

function generateOutreachTemplate(candidate) {
  const templates = {
    high_urgency: `Hey ${candidate.name},

Saw your post about ${candidate.pain_point}.

I'm Caesar - building an AI cold email service in public ($0→$10K MRR in 90 days).

Day 1 problem: No case studies yet.

Would you be my first pilot client? Free campaign, I'll:
- Source 50 perfect leads for ${candidate.company || 'your company'}
- Write + send personalized emails
- Handle all follow-ups
- Give you full dashboard access

Only ask: Screenshot dashboard for my case study.

Interested? Let's do a 15-min call this week.

- Caesar
promptabusiness.com`,

    low_urgency: `${candidate.name},

Saw you posted about ${candidate.pain_point}.

I'm building Caesar's Legions - AI-powered cold email for B2B founders.

Looking for 1 pilot client (free campaign in exchange for case study).

If timing's right, happy to chat. No pressure if not.

- Caesar`
  };
  
  return candidate.fit_score >= 85 ? templates.high_urgency : templates.low_urgency;
}

function generateOutreachTemplates() {
  const candidates = loadCandidates();
  
  if (candidates.length === 0) {
    console.log('\n❌ No candidates found.\n');
    return;
  }
  
  // Get top 10 by fit score
  const top10 = candidates
    .filter(c => c.status === 'new')
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, 10);
  
  if (top10.length === 0) {
    console.log('\n✅ All top candidates already contacted!\n');
    return;
  }
  
  console.log('\n📧 OUTREACH MESSAGES FOR TOP 10 CANDIDATES\n');
  console.log('='.repeat(60));
  
  top10.forEach((c, i) => {
    console.log(`\n${i + 1}. TO: ${c.name} (@${c.handle}) - Score: ${c.fit_score}/100`);
    console.log(`   Platform: ${c.source}`);
    console.log(`   URL: ${c.url}\n`);
    console.log('   MESSAGE:');
    console.log('   ' + '-'.repeat(56));
    console.log(generateOutreachTemplate(c).split('\n').map(line => '   ' + line).join('\n'));
    console.log('   ' + '-'.repeat(56));
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ ${top10.length} messages ready to send`);
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Copy each message');
  console.log('2. Go to the URL');
  console.log('3. Send DM (or reply to thread if public)');
  console.log('4. Mark as contacted in pilot-candidates.json');
  console.log('5. Track responses\n');
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'guide':
    generateResearchGuide();
    break;
    
  case 'show':
  case 'list':
    showCandidates();
    break;
    
  case 'messages':
  case 'outreach':
    generateOutreachTemplates();
    break;
    
  default:
    console.log('\n🏛️ PILOT CLIENT RESEARCH TOOL\n');
    console.log('Commands:');
    console.log('  guide      - Show research guide');
    console.log('  show       - Show all candidates');
    console.log('  messages   - Generate outreach messages for top 10');
    console.log('\nUsage:');
    console.log('  node research-pilot-candidates.js guide');
    console.log('  node research-pilot-candidates.js show');
    console.log('  node research-pilot-candidates.js messages\n');
}
