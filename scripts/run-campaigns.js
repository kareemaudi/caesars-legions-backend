#!/usr/bin/env node
/**
 * Caesar's Legions - Daily Campaign Runner
 * Run via cron: node scripts/run-campaigns.js
 * 
 * Processes all active clients and runs their daily campaigns
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env.master') });

const fs = require('fs').promises;
const path = require('path');
const { CampaignEngine } = require('../lib/campaign-engine');

async function loadClients() {
    const clientsDir = path.join(__dirname, '../data/clients');
    
    try {
        const files = await fs.readdir(clientsDir);
        const clients = [];
        
        for (const file of files) {
            if (file.endsWith('.json') && !file.startsWith('.')) {
                const clientPath = path.join(clientsDir, file);
                const client = JSON.parse(await fs.readFile(clientPath, 'utf8'));
                
                // Only process active clients
                if (client.status === 'active' || client.campaign?.status === 'active') {
                    clients.push(client);
                }
            }
        }
        
        return clients;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('No clients directory found');
            return [];
        }
        throw error;
    }
}

async function notifyResults(results) {
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID || '7189807915';
    
    if (!telegramToken) {
        console.log('No Telegram token, skipping notification');
        return;
    }
    
    const summary = results.map(r => 
        `• ${r.client}: ${r.sent} emails (${r.error ? '❌ ' + r.error : '✅'})`
    ).join('\n');
    
    const message = `🏛️ **Daily Campaign Report**

${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}

${summary || 'No active clients'}

Total: ${results.reduce((sum, r) => sum + (r.sent || 0), 0)} emails sent`;

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

async function main() {
    console.log('='.repeat(50));
    console.log(`Caesar's Legions - Campaign Runner`);
    console.log(`Started: ${new Date().toISOString()}`);
    console.log('='.repeat(50));
    
    const clients = await loadClients();
    console.log(`Found ${clients.length} active client(s)`);
    
    if (clients.length === 0) {
        console.log('No active clients to process');
        return;
    }
    
    const results = [];
    
    for (const client of clients) {
        console.log(`\nProcessing: ${client.company?.name || client.id}`);
        
        try {
            const engine = new CampaignEngine({ client });
            const summary = await engine.runDailyCampaign();
            
            results.push({
                client: client.company?.name || client.id,
                sent: summary.sent,
                followups: summary.followups,
                initials: summary.initials
            });
            
        } catch (error) {
            console.error(`Error processing ${client.company?.name}:`, error.message);
            results.push({
                client: client.company?.name || client.id,
                sent: 0,
                error: error.message
            });
        }
    }
    
    // Notify via Telegram
    await notifyResults(results);
    
    console.log('\n' + '='.repeat(50));
    console.log('Campaign run complete');
    console.log('='.repeat(50));
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
