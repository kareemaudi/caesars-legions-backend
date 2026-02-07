const nodemailer = require('nodemailer');

const t = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 587,
    secure: false,
    auth: {
        user: 'caesar@promptabusiness.com',
        pass: '!7moyre#4etABw'
    }
});

// Fresh prospects - B2B SaaS that need outbound
const prospects = [
    { email: 'hello@pipedrive.com', company: 'Pipedrive', hook: 'Your users need pipeline. We fill it. Multi-channel outbound done-for-you for Pipedrive customers?' },
    { email: 'hello@close.com', company: 'Close', hook: 'Close users are sales-focused. They need more leads in the CRM. Partnership to offer managed outbound?' },
    { email: 'team@attio.com', company: 'Attio', hook: 'Attio is beautiful. But users still need leads. We could be your outbound arm.' },
    { email: 'hello@folk.app', company: 'Folk', hook: 'CRM is solved. Lead gen is the bottleneck. Multi-channel outbound partnership?' },
    { email: 'team@copper.com', company: 'Copper', hook: 'Google-native CRM needs Google-native leads. We do multi-channel outbound that fills Copper.' },
    { email: 'hello@salesflare.com', company: 'Salesflare', hook: 'Automation CRM + automated outbound = perfect match. Partnership?' },
    { email: 'team@freshsales.io', company: 'Freshsales', hook: 'Freshworks users need fresh leads. We do multi-channel outbound at scale.' },
    { email: 'hello@streak.com', company: 'Streak', hook: 'Gmail CRM users live in inbox. We fill that inbox with qualified replies.' },
    { email: 'sales@zendesk.com', company: 'Zendesk Sell', hook: 'Support teams become sales teams. They need pipeline. Multi-channel outbound?' },
    { email: 'hello@hubspot.com', company: 'HubSpot', hook: 'HubSpot ecosystem is massive. Done-for-you outbound for HubSpot users who want results not tools.' }
];

async function send() {
    let sent = 0;
    for (const p of prospects) {
        try {
            await t.sendMail({
                from: 'Caesar <caesar@promptabusiness.com>',
                to: p.email,
                subject: `${p.company} + Caesar's Legions?`,
                text: `Hi team,

${p.hook}

I run Caesar's Legions - multi-channel outbound execution. Email + LinkedIn + social, all coordinated.

Your users get the tool. We deliver the results. 

Worth exploring?

- Caesar
caesar@promptabusiness.com
promptabusiness.com`
            });
            console.log('✓', p.company);
            sent++;
            await new Promise(r => setTimeout(r, 8000));
        } catch (e) {
            console.log('✗', p.company, e.message);
        }
    }
    console.log('Done:', sent, 'sent');
}

send();
