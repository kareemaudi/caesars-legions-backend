#!/usr/bin/env node
/**
 * Send a batch of cold emails NOW
 * SMTP: caesar@promptabusiness.com
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 587,
    secure: false,
    auth: {
        user: 'caesar@promptabusiness.com',
        pass: '!7moyre#4etABw'
    }
});

// Prospects to contact - B2B SaaS founders who need outbound
const prospects = [
    {
        email: 'founders@truecoach.co',
        firstName: 'Team',
        company: 'TrueCoach',
        hook: 'Saw you hit 10K customers - impressive scale. Curious how you\'re handling outbound to fitness businesses beyond word-of-mouth?'
    },
    {
        email: 'hello@billdr.co', 
        firstName: 'Team',
        company: 'Billdr',
        hook: 'Construction software is a tough sell - long cycles, skeptical buyers. Curious if you\'ve tried multi-channel outbound (email + LinkedIn together)?'
    },
    {
        email: 'contact@kime.ai',
        firstName: 'Team', 
        company: 'KIME',
        hook: 'AI meeting prep is hot right now. How are you reaching sales teams who haven\'t heard of you yet?'
    },
    {
        email: 'team@dealroom.co',
        firstName: 'Team',
        company: 'Dealroom',
        hook: 'You have the data that VCs and corporates need. Curious how you\'re doing outbound to enterprise buyers?'
    },
    {
        email: 'hello@gridline.io',
        firstName: 'Team',
        company: 'Gridline',
        hook: 'Alternative investments are complex to sell. Multi-channel outbound (email + LinkedIn + events) could accelerate your pipeline.'
    }
];

const generateEmail = (prospect) => ({
    from: 'Caesar <caesar@promptabusiness.com>',
    to: prospect.email,
    subject: `${prospect.company} + multi-channel outbound?`,
    text: `Hi ${prospect.firstName},

${prospect.hook}

I run Caesar's Legions - we help B2B companies book more meetings through coordinated multi-channel outbound. Email + LinkedIn + social, all working together.

The data: multi-channel gets 3x more replies than email alone. We've built the infrastructure to orchestrate it properly.

Worth a 15-min call to see if there's a fit?

- Caesar
P.S. First 20 clients lock in founding pricing ($497/mo vs $997 later). Live dashboard so you see exactly what's happening.`,
    html: `<p>Hi ${prospect.firstName},</p>
<p>${prospect.hook}</p>
<p>I run Caesar's Legions - we help B2B companies book more meetings through coordinated multi-channel outbound. Email + LinkedIn + social, all working together.</p>
<p>The data: multi-channel gets 3x more replies than email alone. We've built the infrastructure to orchestrate it properly.</p>
<p>Worth a 15-min call to see if there's a fit?</p>
<p>- Caesar</p>
<p><small>P.S. First 20 clients lock in founding pricing ($497/mo vs $997 later). Live dashboard so you see exactly what's happening.</small></p>`
});

async function sendBatch() {
    console.log('Sending batch of', prospects.length, 'emails...\n');
    
    let sent = 0;
    let failed = 0;
    
    for (const prospect of prospects) {
        try {
            const email = generateEmail(prospect);
            const info = await transporter.sendMail(email);
            console.log(`✓ Sent to ${prospect.company} (${prospect.email})`);
            sent++;
            
            // Rate limit: 10 seconds between emails
            await new Promise(r => setTimeout(r, 10000));
        } catch (error) {
            console.log(`✗ Failed ${prospect.company}: ${error.message}`);
            failed++;
        }
    }
    
    console.log(`\nDone: ${sent} sent, ${failed} failed`);
}

sendBatch();
