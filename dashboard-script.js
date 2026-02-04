// Configuration
const API_ENDPOINT = '/api/metrics'; // Will try Railway API first
const STATIC_FALLBACK = '/api/metrics.json'; // Static fallback for GitHub Pages
const REFRESH_INTERVAL = 30000; // 30 seconds

// Chart instance
let revenueChart = null;

// Load metrics from API with static fallback
async function loadMetrics() {
  try {
    // Try API first
    let response = await fetch(API_ENDPOINT).catch(() => null);
    
    // If API fails, try static fallback
    if (!response || !response.ok) {
      console.log('API unavailable, trying static fallback...');
      response = await fetch(STATIC_FALLBACK);
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Hide loading, show dashboard
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    
    // Update metrics
    updateMetrics(data);
    updateChart(data);
    
  } catch (error) {
    console.error('Failed to load metrics:', error);
    showError(error.message);
  }
}

// Update metric cards
function updateMetrics(data) {
  // Revenue
  const mrr = data.revenue?.mrr || 0;
  document.getElementById('mrr').textContent = `$${mrr.toLocaleString()}`;
  
  if (data.revenue?.mrrChange !== undefined) {
    const change = data.revenue.mrrChange;
    const changeEl = document.getElementById('mrr-change');
    changeEl.textContent = `${change > 0 ? '+' : ''}${change}% this month`;
    changeEl.className = `metric-change ${change > 0 ? 'positive' : change < 0 ? 'negative' : ''}`;
  }
  
  // Clients
  const clients = data.revenue?.clients || 0;
  document.getElementById('clients').textContent = clients;
  
  if (data.revenue?.clientsChange !== undefined) {
    const change = data.revenue.clientsChange;
    const changeEl = document.getElementById('clients-change');
    changeEl.textContent = `${change > 0 ? '+' : ''}${change} this month`;
    changeEl.className = `metric-change ${change > 0 ? 'positive' : ''}`;
  }
  
  // Features
  const features = data.product?.features_shipped_week || 0;
  document.getElementById('features').textContent = features;
  
  // Tests
  const tests = data.product?.tests_passing || '0/0';
  document.getElementById('tests').textContent = tests;
  
  // Timestamp
  const timestamp = new Date(data.timestamp || Date.now());
  document.getElementById('timestamp').textContent = timestamp.toLocaleString();
}

// Update revenue chart
function updateChart(data) {
  const ctx = document.getElementById('revenueChart');
  
  const labels = data.history?.labels || ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
  const values = data.history?.values || [0, 0, 0, data.revenue?.mrr || 0];
  
  if (revenueChart) {
    // Update existing chart
    revenueChart.data.labels = labels;
    revenueChart.data.datasets[0].data = values;
    revenueChart.update();
  } else {
    // Create new chart
    revenueChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'MRR ($)',
          data: values,
          borderColor: '#d97706',
          backgroundColor: 'rgba(217, 119, 6, 0.1)',
          tension: 0.4,
          fill: true,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#fbbf24'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              },
              color: '#a3a3a3'
            },
            grid: {
              color: '#333'
            }
          },
          x: {
            ticks: {
              color: '#a3a3a3'
            },
            grid: {
              color: '#333'
            }
          }
        }
      }
    });
  }
}

// Show error message
function showError(message) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('dashboard').style.display = 'none';
  
  const errorEl = document.getElementById('error');
  errorEl.textContent = `Error loading metrics: ${message}`;
  errorEl.style.display = 'block';
}

// Initialize dashboard
async function init() {
  await loadMetrics();
  
  // Auto-refresh every 30 seconds
  setInterval(loadMetrics, REFRESH_INTERVAL);
}

// Start on page load
init();
