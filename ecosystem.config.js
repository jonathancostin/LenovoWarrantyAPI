// PM2 Configuration for Lenovo Warranty API
module.exports = {
  apps: [{
    name: 'lenovo-warranty-api',
    script: './server-simple.js',

    // Instances - set to 1 for single instance, or 'max' to use all CPU cores
    instances: 1,

    // Auto restart settings
    autorestart: true,
    watch: false, // Set to true in development if you want auto-reload on file changes
    max_memory_restart: '500M',

    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      ALLOWED_ORIGIN: 'https://streamwest.lol'
    },

    // Environment specific settings
    env_development: {
      NODE_ENV: 'development',
      PORT: 3001,
      ALLOWED_ORIGIN: 'http://localhost:3000'
    },

    // Logging configuration
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,

    // Advanced options
    min_uptime: '10s', // Minimum uptime before considered successfully started
    listen_timeout: 3000, // Time in ms before forcing a reload if app doesn't listen
    kill_timeout: 5000, // Time in ms before sending final SIGKILL signal

    // Graceful shutdown
    shutdown_with_message: true,
    wait_ready: true,

    // Monitoring
    max_restarts: 10,
    restart_delay: 4000
  }]
};