module.exports = {
  apps: [{
    name: '1ai-ads',
    script: 'server.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: 3456
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M'
  }]
};
