/**
 * Caesar's Legions - Campaign Engine
 * The core product: finds prospects, writes emails, sends, tracks
 * 
 * Usage:
 *   const engine = new CampaignEngine(clientConfig);
 *   await engine.runDailyCampaign();
 */

const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

class CampaignEngine {
    constructor(config) {
        this.config = config;
        this.client = config.client;
        this.dataDir = path.join(__dirname, '../data/clients', this.client.id);
    }

    // ==================== PROSPECT FINDING ====================
    
    /**
     * Find prospects matching client's ICP using Apollo
     * Returns array of prospects with email, name, company, title
     */
    async findProspects(limit = 50) {
        const apolloKey = process.env.APOLLO_API_KEY;
        if (!apolloKey) {
            throw new Error('APOLLO_API_KEY not configured');
        }

        const { icp } = this.client;
        
        // Build Apollo search query
        const searchParams = {
            api_key: apolloKey,
            q_person_title: icp.targetTitles.join(' OR '),
            person_seniorities: ['owner', 'founder', 'c_suite', 'vp', 'director'],
            organization_num_employees_ranges: this.mapCompanySize(icp.targetCompanySize),
            page: 1,
            per_page: limit
        };

        if (icp.targetIndustries?.length > 0) {
            searchParams.organization_industry_tag_ids = icp.targetIndustries;
        }

        try {
            // Remove api_key from body, use header instead
            delete searchParams.api_key;
            
            const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'X-Api-Key': apolloKey
                },
                body: JSON.stringify(searchParams)
            });

            const data = await response.json();
            
            if (!data.people) {
                console.error('Apollo search failed:', data);
                return [];
            }

            // Map to our prospect format
            const prospects = data.people
                .filter(p => p.email) // Only those with emails
                .map(person => ({
                    id: person.id,
                    email: person.email,
                    firstName: person.first_name,
                    lastName: person.last_name,
                    fullName: person.name,
                    title: person.title,
                    company: person.organization?.name,
                    companyDomain: person.organization?.primary_domain,
                    companySize: person.organization?.estimated_num_employees,
                    linkedinUrl: person.linkedin_url,
                    location: person.city,
                    // For personalization
                    headline: person.headline,
                    employmentHistory: person.employment_history?.slice(0, 2)
                }));

            // Save prospects
            await this.saveProspects(prospects);
            
            return prospects;
        } catch (error) {
            console.error('Error finding prospects:', error);
            throw error;
        }
    }

    mapCompanySize(size) {
        const ranges = {
            '1-10': ['1,10'],
            '11-50': ['11,20', '21,50'],
            '51-200': ['51,100', '101,200'],
            '201-1000': ['201,500', '501,1000'],
            '1000+': ['1001,5000', '5001,10000', '10001+']
        };
        return ranges[size] || ['11,50'];
    }

    async saveProspects(prospects) {
        await fs.mkdir(this.dataDir, { recursive: true });
        const filePath = path.join(this.dataDir, 'prospects.json');
        
        // Load existing
        let existing = [];
        try {
            existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
        } catch (e) {}
        
        // Dedupe by email
        const emails = new Set(existing.map(p => p.email));
        const newProspects = prospects.filter(p => !emails.has(p.email));
        
        // Save combined
        await fs.writeFile(filePath, JSON.stringify([...existing, ...newProspects], null, 2));
        
        return newProspects.length;
    }

    // ==================== EMAIL GENERATION ====================

    /**
     * Generate personalized email for a prospect
     * Uses templates + AI personalization
     */
    generateEmail(prospect, sequence = 'initial') {
        const { client } = this;
        const templates = this.getTemplates();
        const template = templates[sequence] || templates.initial;

        // Variable replacement
        let subject = template.subject;
        let body = template.body;

        const vars = {
            firstName: prospect.firstName || 'there',
            company: prospect.company || 'your company',
            title: prospect.title || 'your role',
            senderName: client.email.senderName,
            companyName: client.company.name,
            problemSolved: client.icp.problemSolved,
            uniqueValue: client.icp.uniqueValue || '',
            // Dynamic personalization
            companyMention: this.getCompanyMention(prospect),
            titleHook: this.getTitleHook(prospect)
        };

        for (const [key, value] of Object.entries(vars)) {
            subject = subject.replace(new RegExp(`{{${key}}}`, 'g'), value);
            body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }

        return { subject, body };
    }

    getTemplates() {
        const { settings } = this.client;
        const tone = settings.tone || 'professional';

        // YC-style cold email templates
        return {
            initial: {
                subject: this.getSubjectLine(),
                body: this.getInitialBody(tone)
            },
            followup1: {
                subject: 'Re: {{subject}}',
                body: this.getFollowup1Body(tone)
            },
            followup2: {
                subject: 'Re: {{subject}}',
                body: this.getFollowup2Body(tone)
            },
            breakup: {
                subject: 'Closing the loop',
                body: this.getBreakupBody(tone)
            }
        };
    }

    getSubjectLine() {
        // Pattern interrupt subjects that get opens
        const subjects = [
            '{{firstName}}, quick question',
            '{{company}} + {{companyName}}?',
            'Idea for {{company}}',
            '{{titleHook}}'
        ];
        return subjects[Math.floor(Math.random() * subjects.length)];
    }

    getInitialBody(tone) {
        if (tone === 'direct') {
            return `{{firstName}},

{{companyMention}}

{{problemSolved}}

Worth a 15-min call to see if there's a fit?

{{senderName}}
{{companyName}}`;
        }

        if (tone === 'casual') {
            return `Hey {{firstName}},

{{companyMention}}

Saw you're at {{company}} and thought this might be relevant — {{problemSolved}}

{{uniqueValue}}

Open to a quick chat this week?

{{senderName}}`;
        }

        // Professional (default)
        return `Hi {{firstName}},

{{companyMention}}

I'm reaching out because {{problemSolved}}

{{uniqueValue}}

Would you be open to a brief call to explore if this could help {{company}}?

Best,
{{senderName}}
{{companyName}}`;
    }

    getFollowup1Body(tone) {
        return `{{firstName}},

Following up on my previous email. I know you're busy, but wanted to make sure this didn't get buried.

{{problemSolved}}

Would a 15-minute call work this week?

{{senderName}}`;
    }

    getFollowup2Body(tone) {
        return `{{firstName}},

Last follow-up — I'll assume the timing isn't right if I don't hear back.

If {{problemSolved}} sounds interesting, just reply "interested" and I'll send over some times.

{{senderName}}`;
    }

    getBreakupBody(tone) {
        return `{{firstName}},

I'll close the loop here since I haven't heard back.

If {{companyName}} ever becomes relevant for {{company}}, feel free to reach out.

Best of luck!
{{senderName}}`;
    }

    getCompanyMention(prospect) {
        // Personalization based on what we know
        if (prospect.headline) {
            return `Noticed your background in ${prospect.headline.split(' ').slice(0, 4).join(' ')} — impressive.`;
        }
        if (prospect.company) {
            return `Been following what ${prospect.company} is doing.`;
        }
        return '';
    }

    getTitleHook(prospect) {
        const title = prospect.title?.toLowerCase() || '';
        if (title.includes('ceo') || title.includes('founder')) {
            return `Founder question about ${prospect.company}`;
        }
        if (title.includes('sales') || title.includes('revenue')) {
            return `Pipeline idea for ${prospect.company}`;
        }
        if (title.includes('marketing')) {
            return `Growth idea for ${prospect.company}`;
        }
        return `Quick idea for ${prospect.company}`;
    }

    // ==================== EMAIL SENDING ====================

    /**
     * Send email via client's SMTP
     */
    async sendEmail(prospect, sequence = 'initial') {
        const { email } = this.client;
        
        // Create transporter
        const transporter = nodemailer.createTransport({
            host: email.host,
            port: email.port,
            secure: email.port === 465,
            auth: {
                user: email.user,
                pass: this.decryptPassword(email.pass)
            }
        });

        // Generate email
        const { subject, body } = this.generateEmail(prospect, sequence);

        // Send
        const info = await transporter.sendMail({
            from: `"${email.senderName}" <${email.user}>`,
            to: prospect.email,
            subject,
            text: body,
            html: body.replace(/\n/g, '<br>')
        });

        // Log send
        await this.logSend(prospect, sequence, info.messageId);

        return info;
    }

    decryptPassword(encrypted) {
        // If already decrypted (plain text), return as-is
        if (!encrypted.includes(':')) return encrypted;
        
        // Decrypt using the same method as onboard.js
        const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
        if (!ENCRYPTION_KEY) return encrypted;
        
        const crypto = require('crypto');
        const parts = encrypted.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const encryptedText = Buffer.from(parts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    async logSend(prospect, sequence, messageId) {
        await fs.mkdir(this.dataDir, { recursive: true });
        const logPath = path.join(this.dataDir, 'send-log.jsonl');
        
        const entry = {
            timestamp: new Date().toISOString(),
            prospectEmail: prospect.email,
            prospectName: prospect.fullName,
            company: prospect.company,
            sequence,
            messageId
        };
        
        await fs.appendFile(logPath, JSON.stringify(entry) + '\n');
    }

    // ==================== CAMPAIGN ORCHESTRATION ====================

    /**
     * Run daily campaign:
     * 1. Check for prospects needing follow-ups
     * 2. Find new prospects if needed
     * 3. Send initial emails to new prospects
     * 4. Send follow-ups to existing
     */
    async runDailyCampaign() {
        const { settings } = this.client;
        const dailyLimit = settings.dailyVolume || 50;
        let sentCount = 0;

        console.log(`Running campaign for ${this.client.company.name}, limit: ${dailyLimit}`);

        // 1. Load existing prospects and send log
        const prospects = await this.loadProspects();
        const sendLog = await this.loadSendLog();
        
        // 2. Calculate who needs what
        const needsFollowup = this.getProspectsNeedingFollowup(prospects, sendLog);
        const needsInitial = this.getProspectsNeedingInitial(prospects, sendLog);
        
        // 3. Prioritize follow-ups (higher response rate)
        for (const item of needsFollowup) {
            if (sentCount >= dailyLimit) break;
            
            try {
                await this.sendEmail(item.prospect, item.sequence);
                sentCount++;
                console.log(`Sent ${item.sequence} to ${item.prospect.email}`);
                
                // Rate limit: 1 email per 30 seconds
                await this.sleep(30000);
            } catch (error) {
                console.error(`Failed to send to ${item.prospect.email}:`, error.message);
            }
        }
        
        // 4. Send initial emails with remaining quota
        for (const prospect of needsInitial) {
            if (sentCount >= dailyLimit) break;
            
            try {
                await this.sendEmail(prospect, 'initial');
                sentCount++;
                console.log(`Sent initial to ${prospect.email}`);
                
                // Rate limit
                await this.sleep(30000);
            } catch (error) {
                console.error(`Failed to send to ${prospect.email}:`, error.message);
            }
        }

        // 5. If we need more prospects, find them
        if (needsInitial.length < 20) {
            console.log('Running low on prospects, finding more...');
            await this.findProspects(50);
        }

        // 6. Log daily summary
        const summary = {
            date: new Date().toISOString().split('T')[0],
            sent: sentCount,
            followups: Math.min(needsFollowup.length, sentCount),
            initials: Math.max(0, sentCount - needsFollowup.length)
        };
        
        console.log('Daily campaign complete:', summary);
        return summary;
    }

    async loadProspects() {
        try {
            const filePath = path.join(this.dataDir, 'prospects.json');
            return JSON.parse(await fs.readFile(filePath, 'utf8'));
        } catch (e) {
            return [];
        }
    }

    async loadSendLog() {
        try {
            const logPath = path.join(this.dataDir, 'send-log.jsonl');
            const content = await fs.readFile(logPath, 'utf8');
            return content.trim().split('\n').map(line => JSON.parse(line));
        } catch (e) {
            return [];
        }
    }

    getProspectsNeedingFollowup(prospects, sendLog) {
        const now = Date.now();
        const followupDelays = {
            initial: 3 * 24 * 60 * 60 * 1000,  // 3 days after initial
            followup1: 4 * 24 * 60 * 60 * 1000, // 4 days after followup1
            followup2: 5 * 24 * 60 * 60 * 1000  // 5 days after followup2
        };

        const result = [];

        for (const prospect of prospects) {
            // Get all sends to this prospect
            const sends = sendLog.filter(s => s.prospectEmail === prospect.email);
            if (sends.length === 0) continue;
            
            // Get last send
            const lastSend = sends.sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
            )[0];
            
            const lastSequence = lastSend.sequence;
            const timeSinceLastSend = now - new Date(lastSend.timestamp).getTime();
            
            // Determine next sequence
            let nextSequence = null;
            if (lastSequence === 'initial' && timeSinceLastSend > followupDelays.initial) {
                nextSequence = 'followup1';
            } else if (lastSequence === 'followup1' && timeSinceLastSend > followupDelays.followup1) {
                nextSequence = 'followup2';
            } else if (lastSequence === 'followup2' && timeSinceLastSend > followupDelays.followup2) {
                nextSequence = 'breakup';
            }
            
            if (nextSequence) {
                result.push({ prospect, sequence: nextSequence });
            }
        }

        return result;
    }

    getProspectsNeedingInitial(prospects, sendLog) {
        const sentEmails = new Set(sendLog.map(s => s.prospectEmail));
        return prospects.filter(p => !sentEmails.has(p.email));
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== REPORTING ====================

    /**
     * Generate campaign report
     */
    async generateReport() {
        const sendLog = await this.loadSendLog();
        const prospects = await this.loadProspects();
        
        // Calculate metrics
        const totalSent = sendLog.length;
        const uniqueProspects = new Set(sendLog.map(s => s.prospectEmail)).size;
        const bySequence = sendLog.reduce((acc, s) => {
            acc[s.sequence] = (acc[s.sequence] || 0) + 1;
            return acc;
        }, {});
        
        // Get last 7 days
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const lastWeek = sendLog.filter(s => new Date(s.timestamp) > weekAgo);
        
        return {
            client: this.client.company.name,
            totalProspects: prospects.length,
            totalSent,
            uniqueProspects,
            bySequence,
            lastWeek: {
                sent: lastWeek.length,
                unique: new Set(lastWeek.map(s => s.prospectEmail)).size
            },
            // TODO: Add reply tracking via IMAP
            replies: 'Pending IMAP integration',
            meetings: 'Pending calendar integration'
        };
    }
}

module.exports = { CampaignEngine };
