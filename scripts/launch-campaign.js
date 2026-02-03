#!/usr/bin/env node
/**
 * Campaign Launcher — Caesar's Legions
 * 
 * Generates a full campaign from template + lead list.
 * 
 * Usage:
 *   node scripts/launch-campaign.js --template saas-founder --leads leads.json
 *   node scripts/launch-campaign.js --template agency-owner --leads leads.csv
 * 
 * Or generate for a single lead:
 *   node scripts/launch-campaign.js --template b2b-services --email test@example.com --name "John Smith" --company "Acme Inc"
 */

const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const EmailGenerator = require('../lib/email-generator');

// ============================================================================
// CONFIGURATION
// ============================================================================

const TEMPLATES_DIR = path.join(__dirname, '..', 'data', 'campaigns', 'templates');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'campaigns', 'generated');

// ============================================================================
// HELPERS
// ============================================================================

async function loadTemplate(templateName) {
  const filePath = path.join(TEMPLATES_DIR, `${templateName}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Template not found: ${templateName}. Available: saas-founder, agency-owner, b2b-services`);
  }
}

async function loadLeads(leadsPath) {
  const content = await fs.readFile(leadsPath, 'utf8');
  
  if (leadsPath.endsWith('.json')) {
    return JSON.parse(content);
  }
  
  if (leadsPath.endsWith('.csv')) {
    // Simple CSV parsing
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const lead = {};
      headers.forEach((h, i) => {
        lead[h] = values[i] || '';
      });
      return lead;
    });
  }
  
  throw new Error('Leads file must be .json or .csv');
}

function interpolate(template, data) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return data[key] || match;
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function generateCampaign(options) {
  const { template, leads, outputPath } = options;
  
  console.log('\n🏛️ CAESAR\'S LEGIONS — Campaign Generator\n');
  
  // Load template
  console.log(`Loading template: ${template}`);
  const templateData = await loadTemplate(template);
  console.log(`  → ${templateData.name}`);
  console.log(`  → ${templateData.sequence.length}-step sequence`);
  
  // Initialize email generator
  const generator = new EmailGenerator();
  
  // Process each lead
  const results = [];
  
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const firstName = lead.firstName || lead.first_name || lead.name?.split(' ')[0] || 'there';
    const company = lead.company || lead.organization || 'your company';
    
    console.log(`\nProcessing ${i + 1}/${leads.length}: ${firstName} at ${company}`);
    
    const campaignEmails = [];
    
    for (const step of templateData.sequence) {
      // Use template body as base, then optionally enhance with AI
      const baseBody = interpolate(step.body_template, {
        firstName,
        company,
        industry: lead.industry || templateData.target_persona.company_type,
        pain: lead.pain || ''
      });
      
      // Pick subject variant randomly
      const subjectVariants = step.subject_variants.map(s => 
        interpolate(s, { firstName, company })
      );
      const subject = subjectVariants[Math.floor(Math.random() * subjectVariants.length)];
      
      campaignEmails.push({
        step: step.step,
        type: step.type,
        day_offset: step.day_offset,
        subject,
        subject_variants: subjectVariants,
        body: baseBody,
        to: lead.email,
        lead: {
          firstName,
          lastName: lead.lastName || lead.last_name || '',
          company,
          email: lead.email,
          title: lead.title || ''
        },
        status: 'ready',
        created_at: new Date().toISOString()
      });
      
      console.log(`  ✓ Step ${step.step}: ${step.type}`);
    }
    
    results.push({
      lead_email: lead.email,
      lead_name: `${firstName} ${lead.lastName || ''}`.trim(),
      company,
      sequence: campaignEmails
    });
  }
  
  // Save output
  const outputFilePath = outputPath || path.join(
    OUTPUT_DIR, 
    `campaign_${template}_${Date.now()}.json`
  );
  
  await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
  
  const output = {
    template: templateData.template_id,
    template_name: templateData.name,
    generated_at: new Date().toISOString(),
    total_leads: results.length,
    total_emails: results.length * templateData.sequence.length,
    status: 'ready_to_send',
    campaigns: results
  };
  
  await fs.writeFile(outputFilePath, JSON.stringify(output, null, 2));
  
  console.log('\n✅ Campaign Generated!');
  console.log(`   Leads: ${results.length}`);
  console.log(`   Emails: ${results.length * templateData.sequence.length}`);
  console.log(`   Output: ${outputFilePath}`);
  
  return output;
}

// ============================================================================
// AI-ENHANCED GENERATION
// ============================================================================

async function generateWithAI(options) {
  const { template, lead } = options;
  
  console.log('\n🏛️ CAESAR\'S LEGIONS — AI Campaign Generator\n');
  
  const templateData = await loadTemplate(template);
  const generator = new EmailGenerator();
  
  const firstName = lead.firstName || lead.name?.split(' ')[0] || 'there';
  const company = lead.company || 'your company';
  
  console.log(`Generating AI-personalized sequence for ${firstName} at ${company}...`);
  
  // Use the email generator's sequence generation
  const prospect = {
    firstName,
    name: lead.name || firstName,
    company,
    title: lead.title || '',
    industry: lead.industry || templateData.target_persona.company_type,
    pain: lead.pain || templateData.target_persona.pain_signals[0]
  };
  
  const campaignConfig = {
    offer: `Done-for-you cold email outreach that books qualified meetings.
- 100 personalized emails/week
- AI-written, human-reviewed  
- We handle data, copy, and infrastructure
- $497/mo founder pricing`,
    socialProof: `- 40%+ average open rates
- 10%+ reply rates
- Clients typically book 5-10 meetings/month`,
    senderName: 'Caesar',
    senderTitle: 'Founder, Caesar\'s Legions'
  };
  
  const sequence = await generator.generateSequence(prospect, campaignConfig, {
    sequenceLength: templateData.sequence.length
  });
  
  console.log('\n=== GENERATED SEQUENCE ===\n');
  
  for (const email of sequence) {
    console.log(`--- Step ${email.step} (${email.type}, Day +${email.dayOffset}) ---`);
    console.log(`Subject: ${email.subject}`);
    console.log(`Framework: ${email.framework}`);
    console.log(`Words: ${email.wordCount}`);
    console.log(`\n${email.body}\n`);
  }
  
  return {
    lead,
    sequence,
    generated_at: new Date().toISOString()
  };
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.replace('--', '');
      // Check if next arg is a value or another flag
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        options[key] = nextArg;
        i++; // Skip the value
      } else {
        options[key] = true; // Flag without value
      }
    }
  }
  
  if (!options.template) {
    console.log(`
🏛️ CAESAR'S LEGIONS — Campaign Launcher

Usage:
  node launch-campaign.js --template <name> --leads <file>
  node launch-campaign.js --template <name> --email <email> --name <name> --company <company>
  node launch-campaign.js --template <name> --ai --email <email> --name <name> --company <company>

Templates:
  - saas-founder    : B2B SaaS founders struggling with outbound
  - agency-owner    : Agency owners (white-label opportunity)
  - b2b-services    : B2B service companies needing leads

Options:
  --template <name>   Required. Template to use.
  --leads <file>      Path to leads file (.json or .csv)
  --email <email>     Single lead email
  --name <name>       Single lead name
  --company <company> Single lead company
  --ai                Use AI to generate (more personalized, slower)
  --output <path>     Output file path

Examples:
  node launch-campaign.js --template saas-founder --leads ./my-leads.csv
  node launch-campaign.js --template agency-owner --ai --email john@agency.com --name "John Smith" --company "GrowthAgency"
    `);
    process.exit(0);
  }
  
  try {
    if (options.ai && options.email) {
      // AI-generated single lead
      await generateWithAI({
        template: options.template,
        lead: {
          email: options.email,
          firstName: options.name?.split(' ')[0],
          name: options.name,
          company: options.company,
          title: options.title,
          industry: options.industry,
          pain: options.pain
        }
      });
    } else if (options.leads) {
      // Batch from file
      const leads = await loadLeads(options.leads);
      await generateCampaign({
        template: options.template,
        leads,
        outputPath: options.output
      });
    } else if (options.email) {
      // Single lead (template-based)
      await generateCampaign({
        template: options.template,
        leads: [{
          email: options.email,
          firstName: options.name?.split(' ')[0],
          name: options.name,
          company: options.company,
          title: options.title,
          industry: options.industry
        }],
        outputPath: options.output
      });
    } else {
      console.error('Error: Provide either --leads <file> or --email <email>');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
