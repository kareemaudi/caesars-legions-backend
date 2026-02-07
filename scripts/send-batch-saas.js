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

// B2B SaaS founders who need outbound
const prospects = [
    { email: 'founders@notion.so', company: 'Notion', hook: 'Notion is the workspace. But your sales team still needs pipeline. Multi-channel outbound fills it.' },
    { email: 'hello@linear.app', company: 'Linear', hook: 'Linear is beautiful for building. We help you sell what you build - multi-channel outbound that books demos.' },
    { email: 'team@vercel.com', company: 'Vercel', hook: 'Vercel deploys the future. We help you reach the developers who should be using it.' },
    { email: 'hello@retool.com', company: 'Retool', hook: 'Internal tools are a hard sell. Multi-channel outbound (email + LinkedIn) reaches the right ops leaders.' },
    { email: 'team@airtable.com', company: 'Airtable', hook: 'No-code is competitive. Multi-channel outbound helps you reach ops teams before Notion/Coda do.' },
    { email: 'founders@loom.com', company: 'Loom', hook: 'Async video is growing. Outbound to sales teams who should be using Loom instead of meetings.' },
    { email: 'hello@figma.com', company: 'Figma', hook: 'Design is collaborative. Outbound to enterprise design teams who are still on legacy tools.' },
    { email: 'team@webflow.com', company: 'Webflow', hook: 'No-code websites are the future. Outbound to agencies still hand-coding everything.' },
    { email: 'hello@zapier.com', company: 'Zapier', hook: 'Automation saves time. Outbound to ops teams drowning in manual processes.' },
    { email: 'founders@calendly.com', company: 'Calendly', hook: 'Scheduling is solved. But your users still need to fill their calendars. Multi-channel outbound does that.' }
];

async function send() {
    let sent = 0;
    for (const p of prospects) {
        try {
            await t.sendMail({
                from: 'Caesar <caesar@promptabusiness.com>',
                to: p.email,
                subject: `${p.company} + multi-channel outbound?`,
                text: `Hi team,

${p.hook}

I run Caesar's Legions - we coordinate email + LinkedIn + social into campaigns that book meetings. 3x more replies than email alone.

Our clients see results in 30 days or money back.

Worth exploring for ${p.company}'s growth?

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
