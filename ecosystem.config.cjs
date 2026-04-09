module.exports = {
  apps: [{
    name: 'adforge',
    script: 'server.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: 5173,
      JWT_SECRET: process.env.JWT_SECRET,
      FB_SYSTEM_TOKEN: process.env.FB_SYSTEM_TOKEN
    },
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '256M'
  }]
};
