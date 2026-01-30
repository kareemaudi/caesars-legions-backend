#!/usr/bin/env node

const db = require('../lib/db');
const { searchLeads } = require('../lib/lead-sourcing');
const { generateEmail } = require('../lib/email-generator');
const { sendEmail } = require('../lib/email-sender');

async function runCampaign(clientId, options = {}) {
  const {
    leadLimit = 10,
    sendEmails = false  // Safety: dry-run by default
  } = options;

  console.log('\n🏛️  CAESAR\'S LEGIONS - Campaign Runner\n');
  
  // 1. Get client data
  const client = db.getClient(clientId);
  if (!client) {
    console.error('❌ Client not found');
    return;
  }
  
  console.log(`Client: ${client.name} (${client.company})`);
  console.log(`Target: ${client.target_audience}\n`);
  
  // 2. Create campaign if doesn't exist
  let campaign = db.getActiveCampaign(clientId);
  
  if (!campaign) {
    const result = db.insertCampaign({
      client_id: clientId,
      name: `${client.company} - Campaign 1`,
      status: 'active',
      target_criteria: JSON.stringify({ titles: ['CEO', 'Founder', 'CTO'] })
    });
    campaign = db.getCampaign(result.lastInsertRowid);
    console.log(`✓ Created campaign: ${campaign.name}\n`);
  } else {
    console.log(`✓ Using campaign: ${campaign.name}\n`);
  }
  
  // 3. Source leads
  console.log(`📍 Sourcing ${leadLimit} leads...`);
  const criteria = JSON.parse(campaign.target_criteria);
  const leads = await searchLeads({ ...criteria, limit: leadLimit });
  console.log(`✓ Found ${leads.length} leads\n`);
  
  // 4. Store leads in DB
  leads.forEach(lead => {
    db.insertLead({
      campaign_id: campaign.id,
      email: lead.email,
      first_name: lead.first_name,
      last_name: lead.last_name,
      company: lead.company,
      title: lead.title,
      linkedin_url: lead.linkedin_url || null,
      source: lead.source
    });
  });
  
  // 5. Generate & send emails
  console.log('✍️  Generating personalized emails...\n');
  
  const newLeads = db.getNewLeads(campaign.id, leadLimit);
  
  let sent = 0;
  let errors = 0;
  
  for (const lead of newLeads) {
    try {
      // Generate email
      const email = await generateEmail({
        lead,
        client,
        template: null
      });
      
      console.log(`\n📧 ${lead.first_name} ${lead.last_name} (${lead.company})`);
      console.log(`   Subject: ${email.subject}`);
      console.log(`   Preview: ${email.body.substring(0, 80)}...`);
      
      // Send email (if enabled)
      if (sendEmails) {
        const result = await sendEmail({
          to: lead.email,
          subject: email.subject,
          body: email.body,
          fromEmail: client.email
        });
        
        if (result.success) {
          console.log('   ✓ Sent');
          sent++;
        } else {
          console.log(`   ✗ Failed: ${result.error}`);
          errors++;
        }
      } else {
        console.log('   [DRY RUN - not sent]');
      }
      
      // Log to database
      db.insertEmailSent({
        lead_id: lead.id,
        campaign_id: campaign.id,
        client_id: client.id,
        subject: email.subject,
        body: email.body,
        personalization_data: email.personalization_data
      });
      
      // Update lead status
      db.updateLeadStatus(lead.id, 'contacted');
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`   ✗ Error: ${error.message}`);
      errors++;
    }
  }
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✓ Campaign complete`);
  console.log(`  Emails generated: ${newLeads.length}`);
  if (sendEmails) {
    console.log(`  Sent: ${sent}`);
    console.log(`  Errors: ${errors}`);
  } else {
    console.log(`  DRY RUN (use --send to actually send)`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

// CLI
const args = process.argv.slice(2);
const clientId = parseInt(args[0]);
const sendFlag = args.includes('--send');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 10;

if (!clientId) {
  console.error('\nUsage: node run-campaign.js <client_id> [--send] [--limit=N]\n');
  console.error('Example: node run-campaign.js 1 --send --limit=50\n');
  process.exit(1);
}

runCampaign(clientId, { leadLimit: limit, sendEmails: sendFlag });
