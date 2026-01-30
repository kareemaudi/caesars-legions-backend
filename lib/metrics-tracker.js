// Metrics Tracker - Track campaign performance over time
// Logs daily/hourly metrics for trend analysis

const fs = require('fs');
const path = require('path');

const METRICS_DIR = path.join(__dirname, '../data/metrics');

/**
 * Ensure metrics directory exists
 */
function ensureMetricsDir() {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
}

/**
 * Log metrics snapshot
 * @param {number} clientId - Client ID
 * @param {object} metrics - Metrics to log
 */
function logMetrics(clientId, metrics) {
  ensureMetricsDir();
  
  const timestamp = new Date().toISOString();
  const date = timestamp.split('T')[0]; // YYYY-MM-DD
  
  const logEntry = {
    timestamp,
    clientId,
    ...metrics
  };
  
  // Append to daily log file
  const logFile = path.join(METRICS_DIR, `client-${clientId}-${date}.jsonl`);
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  
  // Also append to all-time log
  const allTimeFile = path.join(METRICS_DIR, `client-${clientId}-all.jsonl`);
  fs.appendFileSync(allTimeFile, JSON.stringify(logEntry) + '\n');
  
  return logEntry;
}

/**
 * Get metrics for a specific date range
 * @param {number} clientId - Client ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date (default: today)
 */
function getMetrics(clientId, startDate, endDate = new Date()) {
  ensureMetricsDir();
  
  const allTimeFile = path.join(METRICS_DIR, `client-${clientId}-all.jsonl`);
  
  if (!fs.existsSync(allTimeFile)) {
    return [];
  }
  
  const lines = fs.readFileSync(allTimeFile, 'utf-8').trim().split('\n');
  const metrics = lines
    .filter(line => line.trim())
    .map(line => JSON.parse(line))
    .filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= startDate && entryDate <= endDate;
    });
  
  return metrics;
}

/**
 * Get latest metrics snapshot
 * @param {number} clientId - Client ID
 */
function getLatestMetrics(clientId) {
  ensureMetricsDir();
  
  const allTimeFile = path.join(METRICS_DIR, `client-${clientId}-all.jsonl`);
  
  if (!fs.existsSync(allTimeFile)) {
    return null;
  }
  
  const lines = fs.readFileSync(allTimeFile, 'utf-8').trim().split('\n');
  if (lines.length === 0 || !lines[lines.length - 1].trim()) {
    return null;
  }
  
  return JSON.parse(lines[lines.length - 1]);
}

/**
 * Calculate metrics trends (day-over-day, week-over-week)
 * @param {number} clientId - Client ID
 */
function calculateTrends(clientId) {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const todayMetrics = getMetrics(clientId, yesterday, now);
  const weekMetrics = getMetrics(clientId, lastWeek, now);
  
  if (todayMetrics.length === 0) {
    return null;
  }
  
  // Latest metrics
  const latest = todayMetrics[todayMetrics.length - 1];
  
  // Yesterday's metrics (for comparison)
  const yesterdayEnd = new Date(yesterday.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayMetrics = getMetrics(clientId, yesterdayEnd, yesterday);
  const dayAgo = yesterdayMetrics.length > 0 ? yesterdayMetrics[yesterdayMetrics.length - 1] : null;
  
  // Week ago metrics (for comparison)
  const weekAgoEnd = new Date(lastWeek.getTime() - 24 * 60 * 60 * 1000);
  const weekAgoMetrics = getMetrics(clientId, weekAgoEnd, lastWeek);
  const weekAgo = weekAgoMetrics.length > 0 ? weekAgoMetrics[weekAgoMetrics.length - 1] : null;
  
  // Calculate changes
  const trends = {
    current: latest,
    dayOverDay: dayAgo ? {
      emailsSent: latest.emailsSent - dayAgo.emailsSent,
      openRate: ((latest.openRate || 0) - (dayAgo.openRate || 0)).toFixed(2),
      replyRate: ((latest.replyRate || 0) - (dayAgo.replyRate || 0)).toFixed(2)
    } : null,
    weekOverWeek: weekAgo ? {
      emailsSent: latest.emailsSent - weekAgo.emailsSent,
      openRate: ((latest.openRate || 0) - (weekAgo.openRate || 0)).toFixed(2),
      replyRate: ((latest.replyRate || 0) - (weekAgo.replyRate || 0)).toFixed(2)
    } : null
  };
  
  return trends;
}

/**
 * Get summary stats for a time period
 * @param {number} clientId - Client ID
 * @param {number} days - Number of days to look back (default: 7)
 */
function getSummaryStats(clientId, days = 7) {
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  
  const metrics = getMetrics(clientId, startDate, now);
  
  if (metrics.length === 0) {
    return null;
  }
  
  const latest = metrics[metrics.length - 1];
  const oldest = metrics[0];
  
  return {
    period: `${days} days`,
    startDate: oldest.timestamp,
    endDate: latest.timestamp,
    dataPoints: metrics.length,
    totals: {
      emailsSent: latest.emailsSent - (oldest.emailsSent || 0),
      opens: latest.opens - (oldest.opens || 0),
      replies: latest.replies - (oldest.replies || 0)
    },
    averages: {
      openRate: (metrics.reduce((sum, m) => sum + (m.openRate || 0), 0) / metrics.length).toFixed(2),
      replyRate: (metrics.reduce((sum, m) => sum + (m.replyRate || 0), 0) / metrics.length).toFixed(2)
    }
  };
}

module.exports = {
  logMetrics,
  getMetrics,
  getLatestMetrics,
  calculateTrends,
  getSummaryStats
};

// Example usage:
if (require.main === module) {
  console.log('📊 Metrics Tracker\n');
  
  // Example: Log metrics
  const testMetrics = {
    emailsSent: 100,
    opens: 40,
    replies: 8,
    openRate: 40.0,
    replyRate: 8.0
  };
  
  logMetrics(1, testMetrics);
  console.log('✅ Logged metrics for client 1\n');
  
  // Example: Get trends
  const trends = calculateTrends(1);
  if (trends) {
    console.log('📈 Trends:');
    console.log(JSON.stringify(trends, null, 2));
  } else {
    console.log('⏳ Not enough data for trends yet');
  }
}
