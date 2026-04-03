module.exports = {
  apps: [{
    name: 'adforge',
    script: 'server.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      JWT_SECRET: 'adforge-prod-secret-change-this'
    },
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '256M'
  }]
};
