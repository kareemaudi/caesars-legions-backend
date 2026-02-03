#!/usr/bin/env node
/**
 * Apollo.io lead search with proper authentication
 */

const axios = require('axios');
require('dotenv').config();

async function searchLeads() {
  try {
    const response = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        person_titles: ['Founder', 'CEO', 'CRO'],
        organization_num_employees_ranges: ['11,50', '51,200'],
        person_locations: ['United States'],
        page: 1,
        per_page: 10
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.APOLLO_API_KEY
        }
      }
    );

    console.log('✅ Apollo search successful');
    console.log(`Found ${response.data.people?.length || 0} leads`);
    console.log('');

    if (response.data.people) {
      response.data.people.forEach((person, i) => {
        console.log(`${i + 1}. ${person.name}`);
        console.log(`   ${person.title} at ${person.organization?.name}`);
        console.log(`   Email: ${person.email || 'N/A'}`);
        console.log('');
      });
    }

    return response.data;
  } catch (error) {
    console.error('❌ Apollo API error:', error.response?.data || error.message);
    throw error;
  }
}

// Run
searchLeads().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
