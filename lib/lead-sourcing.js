const { gatherLeads, enrichWithEmail, importFromCSV } = require('./lead-scraper');
require('dotenv').config();

/**
 * Search for leads using web scraping (no Apollo.io needed)
 * @param {Object} criteria - Search criteria
 * @param {string[]} criteria.titles - Job titles (not used for scraping)
 * @param {string[]} criteria.industries - Industries (not used for scraping)
 * @param {number} criteria.limit - Max results (default 50)
 * @returns {Promise<Array>} - Array of lead objects
 */
async function searchLeads(criteria) {
  console.log('🔍 Sourcing leads from public sources (Reddit, HackerNews, Indie Hackers)...');

  const leads = await gatherLeads({
    reddit: true,
    hackerNews: true,
    indieHackers: true,
    twitter: false, // Disabled until Twitter API is configured
    limit: criteria.limit || 20
  });

  // Enrich with email guesses
  const enrichedLeads = await Promise.all(
    leads.map(lead => enrichWithEmail(lead))
  );

  // Filter to only leads with emails
  const leadsWithEmails = enrichedLeads.filter(l => l.email);

  console.log(`✓ Found ${leadsWithEmails.length} leads with email addresses`);

  return leadsWithEmails.map(lead => ({
    email: lead.email,
    first_name: lead.name?.split(' ')[0] || 'there',
    last_name: lead.name?.split(' ')[1] || '',
    title: lead.title || 'Founder',
    company: lead.company || 'Unknown',
    linkedin_url: lead.url || null,
    source: lead.source
  }));
}

/**
 * Mock leads for testing when Apollo API is unavailable
 */
function getMockLeads(limit = 10) {
  const mockLeads = [
    {
      email: 'john@example.com',
      first_name: 'John',
      last_name: 'Doe',
      title: 'CEO',
      company: 'Example SaaS Inc',
      linkedin_url: 'https://linkedin.com/in/johndoe',
      source: 'mock'
    },
    {
      email: 'jane@startup.io',
      first_name: 'Jane',
      last_name: 'Smith',
      title: 'Founder',
      company: 'Startup.io',
      linkedin_url: 'https://linkedin.com/in/janesmith',
      source: 'mock'
    }
  ];

  return Array(Math.min(limit, 10)).fill(null).map((_, i) => ({
    ...mockLeads[i % mockLeads.length],
    email: `lead${i}@example.com`
  }));
}

/**
 * Enrich a lead with additional data
 */
async function enrichLead(email) {
  if (!APOLLO_API_KEY) {
    return null;
  }

  try {
    const response = await axios.post(
      `${APOLLO_BASE_URL}/people/match`,
      { email },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': APOLLO_API_KEY
        }
      }
    );

    return response.data.person;
  } catch (error) {
    console.error('Enrich error:', error.message);
    return null;
  }
}

module.exports = {
  searchLeads,
  enrichLead
};
