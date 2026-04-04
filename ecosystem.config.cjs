module.exports = {
  apps: [{
    name: 'adforge',
    script: 'server.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      JWT_SECRET: 'adforge-prod-secret-change-this',
      FB_SYSTEM_TOKEN: 'EAAKA2OT1FroBRAdrbxz3VZC5BYLBX43kBN98WbxiYHD4obfzXtrDjUjhBtiLYNG0oHThqu00NcfZCFiAZBl0Hxgo66lZBZCT2ZB7Re7XNH9qHIjTGktXZBqxnQeZBmZCT8wEBZAFq8FTzyyK1RPerrwkZC2fUSQkkKoST1DQp2cNbwFYvpn85ai6T1ZC9wCpq7ZC4B4TKTwZDZD'
    },
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '256M'
  }]
};
