module.exports = {
  apps: [{
    name: '1ai-ads',
    script: 'server.js',
    cwd: __dirname,
    // server.js loads .env via dotenv.config({override:true}) — no need to
    // forward individual vars. Keeping only NODE_ENV so PM2 sets it before
    // the app starts (dotenv does not set NODE_ENV).
    env: {
      NODE_ENV: 'production',
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
