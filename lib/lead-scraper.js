// Lead Scraper - No Apollo.io dependency
// Scrapes leads from public sources: X/Twitter, Reddit, LinkedIn, Google

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Search X/Twitter for B2B SaaS founders
 */
async function searchTwitter(query, limit = 20) {
  // Note: Twitter API requires authentication
  // For now, return mock leads. In production, use:
  // - Twitter API v2 (requires bearer token)
  // - Or scrape search.twitter.com (harder, blocks bots)
  
  console.log(`🐦 Searching Twitter: "${query}"`);
  
  // Mock leads for testing
  return Array(limit).fill(null).map((_, i) => ({
    name: `Twitter User ${i + 1}`,
    email: `user${i}@example.com`,
    company: `SaaS Company ${i + 1}`,
    title: 'Founder',
    source: 'twitter',
    signal: `Tweeted about: ${query}`,
    url: `https://twitter.com/user${i}`
  }));
}

/**
 * Search Reddit for B2B SaaS discussions
 */
async function searchReddit(subreddit, query, limit = 20) {
  try {
    // Reddit JSON API (no auth needed for public content)
    const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&limit=${limit}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const posts = response.data.data.children;
    
    const leads = posts.map(post => {
      const data = post.data;
      return {
        name: data.author,
        email: null, // Reddit doesn't expose emails
        company: null,
        title: data.title,
        source: 'reddit',
        signal: `Posted in r/${subreddit}: ${data.title}`,
        url: `https://reddit.com${data.permalink}`,
        upvotes: data.ups,
        created: new Date(data.created_utc * 1000).toISOString()
      };
    });

    console.log(`✓ Found ${leads.length} Reddit leads`);
    return leads;
  } catch (error) {
    console.error('Reddit search error:', error.message);
    return [];
  }
}

/**
 * Search Indie Hackers for founders
 */
async function searchIndieHackers(limit = 20) {
  try {
    // Scrape Indie Hackers homepage for recent posts
    const response = await axios.get('https://www.indiehackers.com/start', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const leads = [];

    // Look for founder profiles (this is a simplified scraper)
    $('.feed-item').each((i, el) => {
      if (i >= limit) return false;

      const author = $(el).find('.user-link').text().trim();
      const title = $(el).find('.feed-item__title').text().trim();
      const url = $(el).find('a').attr('href');

      if (author && title) {
        leads.push({
          name: author,
          email: null,
          company: null,
          title: 'Indie Hacker',
          source: 'indiehackers',
          signal: title,
          url: url ? `https://www.indiehackers.com${url}` : null
        });
      }
    });

    console.log(`✓ Found ${leads.length} Indie Hackers leads`);
    return leads;
  } catch (error) {
    console.error('Indie Hackers scrape error:', error.message);
    return [];
  }
}

/**
 * Google search for B2B SaaS companies
 */
async function searchGoogle(query, limit = 10) {
  // Note: Google Search API requires API key
  // For now, return structure for manual CSV import
  
  console.log(`🔍 Google search: "${query}"`);
  
  // Placeholder - in production, use:
  // - Google Custom Search API (100 free queries/day)
  // - Or SerpApi (paid but works well)
  
  return Array(limit).fill(null).map((_, i) => ({
    name: null,
    email: null,
    company: `Company from Google ${i + 1}`,
    title: null,
    source: 'google',
    signal: `Found via: ${query}`,
    url: `https://example${i}.com`
  }));
}

/**
 * Search HackerNews for founders discussing problems
 */
async function searchHackerNews(query, limit = 20) {
  try {
    // HN Algolia API (free, no auth)
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`;
    
    const response = await axios.get(url);
    const hits = response.data.hits;

    const leads = hits.map(hit => ({
      name: hit.author,
      email: null,
      company: null,
      title: hit.title,
      source: 'hackernews',
      signal: `Posted on HN: ${hit.title}`,
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      points: hit.points,
      created: hit.created_at
    }));

    console.log(`✓ Found ${leads.length} HackerNews leads`);
    return leads;
  } catch (error) {
    console.error('HackerNews search error:', error.message);
    return [];
  }
}

/**
 * Manual CSV import helper
 */
function importFromCSV(csvPath) {
  const fs = require('fs');
  const csv = fs.readFileSync(csvPath, 'utf8');
  const lines = csv.split('\n');
  const headers = lines[0].split(',');
  
  const leads = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < 2) continue;
    
    const lead = {};
    headers.forEach((header, index) => {
      lead[header.trim()] = values[index]?.trim();
    });
    
    lead.source = 'csv_import';
    leads.push(lead);
  }
  
  console.log(`✓ Imported ${leads.length} leads from CSV`);
  return leads;
}

/**
 * Aggregate leads from all sources
 */
async function gatherLeads(options = {}) {
  const {
    twitter = true,
    reddit = true,
    indieHackers = true,
    hackerNews = true,
    limit = 20
  } = options;

  console.log('\n📍 Gathering leads from public sources...\n');

  const allLeads = [];

  // Reddit (r/SaaS, r/indiehackers, r/startups)
  if (reddit) {
    const saasLeads = await searchReddit('SaaS', 'cold email OR lead gen OR outbound', limit);
    const ihLeads = await searchReddit('indiehackers', 'email OR outreach', limit);
    allLeads.push(...saasLeads, ...ihLeads);
  }

  // Hacker News
  if (hackerNews) {
    const hnLeads = await searchHackerNews('cold email OR lead generation', limit);
    allLeads.push(...hnLeads);
  }

  // Indie Hackers
  if (indieHackers) {
    const ihLeads = await searchIndieHackers(limit);
    allLeads.push(...ihLeads);
  }

  // Twitter (requires API key - placeholder for now)
  if (twitter) {
    const twitterLeads = await searchTwitter('cold email saas founder', limit);
    // allLeads.push(...twitterLeads); // Uncomment when Twitter API is configured
  }

  console.log(`\n✓ Total leads gathered: ${allLeads.length}\n`);
  
  return allLeads;
}

/**
 * Enrich lead with email (via Hunter.io or similar)
 * Placeholder - requires Hunter API key
 */
async function enrichWithEmail(lead) {
  // In production, use Hunter.io, Snov.io, or email verification APIs
  // For now, try to guess email from name + company
  
  if (!lead.name || !lead.company) return lead;
  
  const firstName = lead.name.split(' ')[0].toLowerCase();
  const lastName = lead.name.split(' ')[1]?.toLowerCase() || '';
  const domain = lead.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
  
  // Common patterns
  const patterns = [
    `${firstName}@${domain}`,
    `${firstName}.${lastName}@${domain}`,
    `${firstName[0]}${lastName}@${domain}`,
    `${lastName}@${domain}`
  ];
  
  lead.email = patterns[0]; // Best guess
  lead.email_verified = false;
  
  return lead;
}

module.exports = {
  searchTwitter,
  searchReddit,
  searchIndieHackers,
  searchGoogle,
  searchHackerNews,
  importFromCSV,
  gatherLeads,
  enrichWithEmail
};
