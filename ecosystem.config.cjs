module.exports = {
  apps: [{
    name: '1ai-ads',
    script: 'server.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      JWT_SECRET: process.env.JWT_SECRET,
      FB_SYSTEM_TOKEN: process.env.FB_SYSTEM_TOKEN
    },
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    cron_restart: '0 4 * * *',
    max_restarts: 10,
    restart_delay: 5000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    merge_logs: true
  }]
};
