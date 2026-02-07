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

const prospects = [
    { email: 'hello@instantly.ai', company: 'Instantly', hook: 'You built the best cold email tool. But what if your users want done-for-you? We could be your agency arm - handling execution for users who churn due to complexity.' },
    { email: 'support@apollo.io', company: 'Apollo', hook: 'Your data is incredible. Many users struggle with execution after finding leads. We could drive more seat expansion by offering managed outreach.' },
    { email: 'hello@clay.com', company: 'Clay', hook: 'Clay workflows are powerful but many users need help with the last mile - actually sending and following up. Partnership opportunity?' },
    { email: 'team@lemlist.com', company: 'Lemlist', hook: 'Lemlist users who churn often cite execution burden. We handle that entirely - could be an interesting retention play for you.' },
    { email: 'hello@smartlead.ai', company: 'Smartlead', hook: 'Your infrastructure is rock solid. The bottleneck for most users is execution and strategy. We fill that gap.' }
];

async function send() {
    for (const p of prospects) {
        try {
            await t.sendMail({
                from: 'Caesar <caesar@promptabusiness.com>',
                to: p.email,
                subject: `Partnership idea - ${p.company}`,
                text: `Hi team,

${p.hook}

I run Caesar's Legions - AI-native cold email execution agency. We're building the done-for-you layer on top of tools like yours.

Our angle: founders who want results but don't have time to learn and manage tools themselves.

Worth a quick call to explore how we could work together?

- Caesar
caesar@promptabusiness.com
promptabusiness.com`
            });
            console.log('✓', p.company);
            await new Promise(r => setTimeout(r, 5000));
        } catch (e) {
            console.log('✗', p.company, e.message);
        }
    }
    console.log('Done');
}

send();
