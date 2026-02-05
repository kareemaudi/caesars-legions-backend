/**
 * Caesar's Legions - Onboarding API
 * Receives client intake data and kicks off campaign setup
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Encryption for storing credentials
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// Client data structure
class Client {
    constructor(data) {
        this.id = crypto.randomUUID();
        this.createdAt = new Date().toISOString();
        this.status = 'onboarding';
        
        // Business info
        this.company = {
            name: data.companyName,
            website: data.website,
            industry: data.industry,
            size: data.companySize
        };
        
        // ICP
        this.icp = {
            targetTitles: data.targetTitles?.split(',').map(t => t.trim()) || [],
            targetCompanySize: data.targetCompanySize,
            targetIndustries: data.targetIndustries?.split(',').map(t => t.trim()) || [],
            problemSolved: data.problemSolved,
            uniqueValue: data.uniqueValue
        };
        
        // Credentials (encrypted)
        this.email = {
            host: data.smtpHost,
            port: parseInt(data.smtpPort) || 587,
            user: data.smtpUser,
            pass: encrypt(data.smtpPass),
            senderName: data.senderName || data.companyName
        };
        
        // LinkedIn (encrypted if provided)
        this.linkedin = data.linkedinCookie ? {
            cookie: encrypt(data.linkedinCookie),
            enabled: true
        } : { enabled: false };
        
        // Campaign settings
        this.settings = {
            tone: data.tone || 'professional',
            dailyVolume: parseInt(data.dailyVolume) || 50,
            channels: ['email', ...(data.linkedinCookie ? ['linkedin'] : [])]
        };
        
        // Campaign state
        this.campaign = {
            status: 'pending', // pending, researching, drafting, active, paused
            prospectsFound: 0,
            emailsSent: 0,
            linkedinSent: 0,
            replies: 0,
            meetings: 0,
            lastSendDate: null
        };
    }
    
    toJSON() {
        return {
            id: this.id,
            createdAt: this.createdAt,
            status: this.status,
            company: this.company,
            icp: this.icp,
            email: {
                host: this.email.host,
                port: this.email.port,
                user: this.email.user,
                // Don't expose password
                senderName: this.email.senderName
            },
            linkedin: {
                enabled: this.linkedin.enabled
            },
            settings: this.settings,
            campaign: this.campaign
        };
    }
}

// Store client data
async function saveClient(client) {
    const clientsDir = path.join(__dirname, '../data/clients');
    await fs.mkdir(clientsDir, { recursive: true });
    
    const filePath = path.join(clientsDir, `${client.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(client, null, 2));
    
    return client.id;
}

// Send notification to Kareem
async function notifyNewClient(client) {
    // Send Telegram notification
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID || '7189807915';
    
    if (telegramToken) {
        const message = `🏛️ **New Client Onboarded!**

**Company:** ${client.company.name}
**Website:** ${client.website}
**Industry:** ${client.industry}

**Target:** ${client.icp.targetTitles.join(', ')}
**At:** ${client.icp.targetCompanySize} companies

**Channels:** ${client.settings.channels.join(' + ')}
**Volume:** ${client.settings.dailyVolume}/day

**Client ID:** \`${client.id}\`

Next: Research prospects → Draft sequences → Launch 🚀`;

        try {
            await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: telegramChatId,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });
        } catch (e) {
            console.error('Failed to send Telegram notification:', e);
        }
    }
}

// Verify SMTP credentials work
async function verifyEmailCredentials(emailConfig) {
    try {
        const transporter = nodemailer.createTransport({
            host: emailConfig.host,
            port: emailConfig.port,
            secure: emailConfig.port === 465,
            auth: {
                user: emailConfig.user,
                pass: decrypt(emailConfig.pass)
            }
        });
        
        await transporter.verify();
        return { valid: true };
    } catch (error) {
        return { valid: false, error: error.message };
    }
}

// Main handler
async function handleOnboarding(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    
    try {
        const data = req.body;
        
        // Validate required fields
        const required = ['companyName', 'website', 'industry', 'targetTitles', 'targetCompanySize', 'problemSolved', 'smtpHost', 'smtpPort', 'smtpUser', 'smtpPass'];
        const missing = required.filter(field => !data[field]);
        
        if (missing.length > 0) {
            res.status(400).json({ 
                error: 'Missing required fields', 
                fields: missing 
            });
            return;
        }
        
        // Create client
        const client = new Client(data);
        
        // Verify email credentials
        const emailVerification = await verifyEmailCredentials(client.email);
        if (!emailVerification.valid) {
            res.status(400).json({
                error: 'Invalid email credentials',
                details: emailVerification.error
            });
            return;
        }
        
        // Save client
        await saveClient(client);
        
        // Notify team
        await notifyNewClient(client);
        
        // Return success
        res.status(200).json({
            success: true,
            clientId: client.id,
            message: 'Onboarding complete! We\'ll start researching your prospects within 24 hours.',
            nextSteps: [
                'We research and build your prospect list (24-48 hours)',
                'We craft personalized sequences and send for your approval',
                'Campaigns go live with weekly reports'
            ]
        });
        
    } catch (error) {
        console.error('Onboarding error:', error);
        res.status(500).json({ 
            error: 'Something went wrong. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

module.exports = { handleOnboarding, Client, saveClient, encrypt, decrypt };
