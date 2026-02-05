#!/usr/bin/env node
/**
 * Apollo Lead Search — Caesar's Legions
 * 
 * Searches Apollo.io for qualified B2B leads and saves them
 * in a format ready for launch-campaign.js
 * 
 * Usage:
 *   node scripts/apollo-search.js --query "SaaS founder" --limit 20
 *   node scripts/apollo-search.js --persona saas-founder --limit 20
 */

const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '..', 'leads');

// ============================================================================
// PERSONA PRESETS
// ============================================================================

const PERSONAS = {
  'saas-founder': {
    titles: ['Founder', 'CEO', 'Co-founder'],
    industries: ['Technology', 'Software'],
    companySize: { min: 2, max: 100 },
    keywords: ['SaaS', 'B2B', 'outbound', 'sales']
  },
  'agency-owner': {
    titles: ['Owner', 'Founder', 'CEO', 'Managing Director'],
    industries: ['Marketing', 'Advertising', 'Consulting'],
    companySize: { min: 2, max: 50 },
    keywords: ['agency', 'growth', 'clients', 'outreach']
  },
  'b2b-services': {
    titles: ['Founder', 'CEO', 'Owner', 'Director'],
    industries: ['Consulting', 'Professional Services', 'Business Services'],
    companySize: { min: 3, max: 200 },
    keywords: ['B2B', 'services', 'clients', 'pipeline']
  }
};

// ============================================================================
// APOLLO API CLIENT
// ============================================================================

async function apolloSearch(filters) {
  const url = 'https://api.apollo.io/v1/people/search';
  
  const body = {
    page: 1,
    per_page: filters.limit || 25
  };

  // Title filter
  if (filters.titles && filters.titles.length > 0) {
    body.title_predicates = filters.titles.map(t => ({
      predicate_type: 'contains_any_of',
      value: [t]
    }));
  }

  // Industry filter  
  if (filters.industries && filters.industries.length > 0) {
    body.organization_industry_predicates = [{
      predicate_type: 'contains_any_of',
      value: filters.industries
    }];
  }

  // Company size filter
  if (filters.companySize) {
    if (filters.companySize.min) {
      body.organization_num_employees_predicates = body.organization_num_employees_predicates || [];
      body.organization_num_employees_predicates.push({
        predicate_type: 'gte',
        value: filters.companySize.min
      });
    }
    if (filters.companySize.max) {
      body.organization_num_employees_predicates = body.organization_num_employees_predicates || [];
      body.organization_num_employees_predicates.push({
        predicate_type: 'lte',
        value: filters.companySize.max
      });
    }
  }

  // Country filter — English-speaking markets
  body.country_predicates = [{
    predicate_type: 'contains_any_of',
    value: ['United States', 'United Kingdom', 'Canada', 'Australia']
  }];

  console.log('  → Calling Apollo API...');
  console.log(`  → Filters: ${JSON.stringify({ titles: filters.titles, industries: filters.industries, companySize: filters.companySize })}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': APOLLO_API_KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Apollo API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data;
}

// ============================================================================
// LEAD FORMATTING
// ============================================================================

function formatLead(person) {
  if (!person || !person.email) return null;

  return {
    email: person.email,
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
    title: person.title || '',
    company: person.organization?.name || '',
    companySize: person.organization?.employee_count || 0,
    industry: person.organization?.industry || '',
    website: person.organization?.website_url || '',
    linkedinUrl: person.linkedin_url || '',
    city: person.city || '',
    country: person.country || '',
    // For personalization
    companyDescription: person.organization?.short_description || '',
    twitterHandle: person.twitter_handle || null,
    companyFoundedYear: person.organization?.founded_year || null
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace('--', '');
      const next = args[i + 1];
      if (next && !next.startsWith('--')) { options[key] = next; i++; }
      else { options[key] = true; }
    }
  }

  console.log('\n🏛️  CAESAR\'S LEGIONS — Apollo Lead Search');
  console.log('==========================================\n');

  if (!APOLLO_API_KEY) {
    console.error('❌ APOLLO_API_KEY not set in .env');
    process.exit(1);
  }

  // Determine persona/filters
  const personaName = options.persona || 'saas-founder';
  const persona = PERSONAS[personaName];
  if (!persona) {
    console.error(`❌ Unknown persona: ${personaName}. Available: ${Object.keys(PERSONAS).join(', ')}`);
    process.exit(1);
  }

  const limit = parseInt(options.limit || '20');
  console.log(`📋 Persona: ${personaName}`);
  console.log(`📋 Target count: ${limit}\n`);

  try {
    // Search Apollo
    const result = await apolloSearch({
      ...persona,
      limit: limit + 10 // Request extra to filter out bad ones
    });

    console.log(`\n📊 Apollo returned: ${result.people ? result.people.length : 0} people`);
    console.log(`   Total in dataset: ${result.pagination?.total_count || 'unknown'}`);

    if (!result.people || result.people.length === 0) {
      console.log('\n⚠️  No results. Try a broader search.');
      process.exit(0);
    }

    // Format and filter leads
    let leads = result.people
      .map(formatLead)
      .filter(l => l !== null)
      .filter(l => l.email && l.firstName && l.company) // Must have essentials
      .filter(l => !l.email.includes('gmail.com') && !l.email.includes('yahoo.com') && !l.email.includes('hotmail.com')) // Business email only
      .slice(0, limit);

    console.log(`✅ Qualified leads: ${leads.length}`);

    if (leads.length === 0) {
      console.log('\n⚠️  All leads filtered out. Relaxing filters...');
      // Retry without personal email filter
      leads = result.people
        .map(formatLead)
        .filter(l => l !== null && l.email && l.firstName)
        .slice(0, limit);
      console.log(`   Relaxed filter result: ${leads.length} leads`);
    }

    // Save leads
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const timestamp = new Date().toISOString().split('T')[0];
    const outputPath = path.join(OUTPUT_DIR, `batch-apollo-${personaName}-${timestamp}.json`);
    await fs.writeFile(outputPath, JSON.stringify(leads, null, 2));

    console.log(`\n💾 Saved to: ${outputPath}`);

    // Print lead summary
    console.log('\n🎯 LEADS GENERATED:\n');
    leads.forEach((lead, i) => {
      console.log(`  ${i + 1}. ${lead.name} — ${lead.title} @ ${lead.company}`);
      console.log(`     📧 ${lead.email}`);
      if (lead.companySize) console.log(`     👥 ${lead.companySize} employees`);
      if (lead.industry) console.log(`     🏢 ${lead.industry}`);
      console.log('');
    });

    // Print next step
    console.log('─'.repeat(50));
    console.log(`\n📌 NEXT: Run campaign on these leads:`);
    console.log(`   node scripts/launch-campaign.js --template ${personaName} --leads "${outputPath}"\n`);

    console.log('🏛️  Veni. Vidi. Vici.\n');

    return { leads, outputPath };

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('401') || error.message.includes('unauthorized')) {
      console.error('   → Check your APOLLO_API_KEY in .env');
    }
    process.exit(1);
  }
}

main();
