#!/usr/bin/env node

/**
 * Reddit Username Extractor
 * 
 * Extracts usernames from Reddit threads/comments
 * Use when we've found high-value threads but need to extract OPs for outreach
 * 
 * Usage:
 *   node scripts/reddit-username-extractor.js https://reddit.com/r/SaaS/comments/...
 *   
 * Output: username, post karma, comment karma, profile link
 */

const https = require('https');
const fs = require('fs');

async function extractFromRedditUrl(url) {
  console.log(`\n🔍 Extracting from: ${url}\n`);
  
  // Convert to JSON API endpoint
  const jsonUrl = url.replace('reddit.com', 'reddit.com') + '.json';
  
  return new Promise((resolve, reject) => {
    https.get(jsonUrl, {
      headers: {
        'User-Agent': 'CaesarsLegions/1.0 (Prospect Research Tool)'
      }
    }, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const post = parsed[0].data.children[0].data;
          
          const result = {
            username: post.author,
            post_title: post.title,
            post_score: post.score,
            post_url: url,
            created_utc: new Date(post.created_utc * 1000).toISOString(),
            extracted_at: new Date().toISOString()
          };
          
          console.log('✅ Extracted:');
          console.log(`   Username: u/${result.username}`);
          console.log(`   Post: "${result.post_title.slice(0, 60)}..."`);
          console.log(`   Score: ${result.post_score} upvotes`);
          console.log(`   Posted: ${result.created_utc.split('T')[0]}`);
          console.log(`   Profile: https://reddit.com/user/${result.username}`);
          
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse Reddit JSON: ${err.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function findTwitterFromReddit(username) {
  // Many Reddit users link Twitter in their profile
  // This would require scraping old.reddit.com/user/{username}
  // For now, return manual search suggestion
  return {
    twitter_search: `site:twitter.com "${username}"`,
    twitter_likely: `https://twitter.com/${username}`,
    manual_check: `https://old.reddit.com/user/${username}`
  };
}

async function main() {
  const url = process.argv[2];
  
  if (!url) {
    console.error('Usage: node reddit-username-extractor.js <reddit-url>');
    console.error('Example: node reddit-username-extractor.js https://reddit.com/r/SaaS/comments/1ie9abc/cold_email_failing');
    process.exit(1);
  }
  
  try {
    const result = await extractFromRedditUrl(url);
    const twitter = await findTwitterFromReddit(result.username);
    
    const output = {
      ...result,
      next_steps: {
        ...twitter,
        actions: [
          `1. Check Reddit profile: https://old.reddit.com/user/${result.username}`,
          `2. Search Twitter: site:twitter.com "${result.username}"`,
          `3. Google: "${result.username}" site:linkedin.com`,
          `4. Try Twitter handle: https://twitter.com/${result.username}`
        ]
      }
    };
    
    // Save to prospects file
    const outputPath = `outreach/prospect-${result.username}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n💾 Saved to: ${outputPath}`);
    
    console.log('\n📋 Next Steps:');
    output.next_steps.actions.forEach(action => console.log(`   ${action}`));
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
