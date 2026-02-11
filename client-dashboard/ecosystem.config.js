module.exports = {
  apps: [{
    name: 'prompta-dashboard',
    script: 'server.js',
    cwd: __dirname,
    env: {
      DASHBOARD_PORT: 3100
    },
    autorestart: true,
    max_restarts: 10
  }]
};
