/**
 * Dashboard API - Client-facing metrics and activity feed
 * Provides real-time campaign performance data to client dashboard
 */

const db = require('./db');

/**
 * Get dashboard data for a specific client
 * @param {string} clientId - Client identifier
 * @returns {Object} Dashboard data including metrics, activity, and replies
 */
async function getDashboardData(clientId) {
    try {
        // Get client info
        const client = await db.get(
            'SELECT * FROM clients WHERE id = ?',
            [clientId]
        );

        if (!client) {
            throw new Error(`Client not found: ${clientId}`);
        }

        // Get metrics
        const metrics = await getClientMetrics(clientId);

        // Get recent activity
        const activity = await getRecentActivity(clientId);

        // Get recent replies
        const replies = await getRecentReplies(clientId);

        // Get chart data (7-day email volume)
        const chartData = await getChartData(clientId);

        return {
            client: {
                name: client.company_name || client.contact_name,
                startDate: client.created_at
            },
            metrics,
            activity,
            replies,
            chartData
        };
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        throw error;
    }
}

/**
 * Calculate client metrics
 */
async function getClientMetrics(clientId) {
    // Get total emails sent
    const emailsSent = await db.get(
        `SELECT COUNT(*) as count 
         FROM emails 
         WHERE client_id = ?`,
        [clientId]
    );

    // Get emails sent this week
    const emailsThisWeek = await db.get(
        `SELECT COUNT(*) as count 
         FROM emails 
         WHERE client_id = ? 
         AND created_at >= datetime('now', '-7 days')`,
        [clientId]
    );

    // Get emails sent last week
    const emailsLastWeek = await db.get(
        `SELECT COUNT(*) as count 
         FROM emails 
         WHERE client_id = ? 
         AND created_at >= datetime('now', '-14 days')
         AND created_at < datetime('now', '-7 days')`,
        [clientId]
    );

    // Calculate open rate
    const opens = await db.get(
        `SELECT COUNT(*) as count 
         FROM email_events 
         WHERE client_id = ? 
         AND event_type = 'opened'`,
        [clientId]
    );

    const openRate = emailsSent.count > 0 
        ? Math.round((opens.count / emailsSent.count) * 100) 
        : 0;

    // Calculate reply rate
    const replies = await db.get(
        `SELECT COUNT(*) as count 
         FROM email_events 
         WHERE client_id = ? 
         AND event_type = 'replied'`,
        [clientId]
    );

    const replyRate = emailsSent.count > 0 
        ? Math.round((replies.count / emailsSent.count) * 100) 
        : 0;

    // Get positive replies (sentiment > 0.5)
    const positiveReplies = await db.get(
        `SELECT COUNT(*) as count 
         FROM email_events 
         WHERE client_id = ? 
         AND event_type = 'replied'
         AND sentiment > 0.5`,
        [clientId]
    );

    // Get meetings booked (from reply sentiment analysis)
    const meetingsBooked = await db.get(
        `SELECT COUNT(*) as count 
         FROM email_events 
         WHERE client_id = ? 
         AND event_type = 'replied'
         AND (
             reply_content LIKE '%schedule%' 
             OR reply_content LIKE '%meeting%'
             OR reply_content LIKE '%call%'
             OR reply_content LIKE '%demo%'
         )`,
        [clientId]
    );

    return {
        emailsSent: emailsSent.count,
        emailsSentChange: emailsThisWeek.count - emailsLastWeek.count,
        openRate,
        replyRate,
        positiveReplies: positiveReplies.count,
        meetingsBooked: meetingsBooked.count
    };
}

/**
 * Get recent activity timeline
 */
async function getRecentActivity(clientId, limit = 10) {
    const events = await db.all(
        `SELECT 
            event_type,
            created_at as timestamp,
            recipient_email,
            reply_content
         FROM email_events 
         WHERE client_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [clientId, limit]
    );

    return events.map(event => {
        let text = '';
        
        switch(event.event_type) {
            case 'sent':
                text = `Email sent to <strong>${maskEmail(event.recipient_email)}</strong>`;
                break;
            case 'opened':
                text = `<strong>${maskEmail(event.recipient_email)}</strong> opened your email 👀`;
                break;
            case 'clicked':
                text = `<strong>${maskEmail(event.recipient_email)}</strong> clicked a link 🔗`;
                break;
            case 'replied':
                const sentiment = analyzeSentimentQuick(event.reply_content);
                const emoji = sentiment === 'positive' ? '🎉' : sentiment === 'neutral' ? '💬' : '📧';
                text = `New reply from <strong>${maskEmail(event.recipient_email)}</strong> ${emoji}`;
                break;
            case 'bounced':
                text = `Email to <strong>${maskEmail(event.recipient_email)}</strong> bounced ⚠️`;
                break;
            default:
                text = `Event: ${event.event_type} for <strong>${maskEmail(event.recipient_email)}</strong>`;
        }

        return {
            timestamp: event.timestamp,
            text
        };
    });
}

/**
 * Get recent replies
 */
async function getRecentReplies(clientId, limit = 5) {
    const replies = await db.all(
        `SELECT 
            ee.recipient_email,
            ee.created_at as timestamp,
            ee.reply_content,
            e.subject
         FROM email_events ee
         JOIN emails e ON ee.email_id = e.id
         WHERE ee.client_id = ? 
         AND ee.event_type = 'replied'
         ORDER BY ee.created_at DESC 
         LIMIT ?`,
        [clientId, limit]
    );

    return replies.map(reply => ({
        from: extractNameFromEmail(reply.recipient_email),
        timestamp: reply.timestamp,
        subject: reply.subject,
        body: truncate(reply.reply_content, 200)
    }));
}

/**
 * Get 7-day chart data (email volume)
 */
async function getChartData(clientId) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const chartData = [];

    for (let i = 6; i >= 0; i--) {
        const dayStart = new Date();
        dayStart.setDate(dayStart.getDate() - i);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const count = await db.get(
            `SELECT COUNT(*) as count 
             FROM emails 
             WHERE client_id = ? 
             AND created_at >= ? 
             AND created_at <= ?`,
            [clientId, dayStart.toISOString(), dayEnd.toISOString()]
        );

        chartData.push({
            label: days[dayStart.getDay()],
            value: count.count
        });
    }

    return chartData;
}

/**
 * Helper: Mask email for privacy (show first letter + domain)
 * Example: john.doe@example.com -> j***@example.com
 */
function maskEmail(email) {
    if (!email) return 'Unknown';
    const [local, domain] = email.split('@');
    if (!domain) return email;
    return `${local[0]}***@${domain}`;
}

/**
 * Helper: Extract company/name from email
 * Example: john.doe@acmecorp.com -> Acme Corp
 */
function extractNameFromEmail(email) {
    if (!email) return 'Unknown';
    const [local, domain] = email.split('@');
    if (!domain) return email;
    
    // Try to get company name from domain
    const company = domain.split('.')[0];
    return company.charAt(0).toUpperCase() + company.slice(1);
}

/**
 * Helper: Quick sentiment analysis
 */
function analyzeSentimentQuick(text) {
    if (!text) return 'neutral';
    
    const positive = ['interested', 'yes', 'schedule', 'meeting', 'call', 'demo', 'sounds good', 'let\'s', 'thanks'];
    const negative = ['not interested', 'no thanks', 'remove', 'unsubscribe', 'stop'];
    
    const lowerText = text.toLowerCase();
    
    if (positive.some(word => lowerText.includes(word))) return 'positive';
    if (negative.some(word => lowerText.includes(word))) return 'negative';
    
    return 'neutral';
}

/**
 * Helper: Truncate text
 */
function truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

module.exports = {
    getDashboardData,
    getClientMetrics,
    getRecentActivity,
    getRecentReplies,
    getChartData
};
