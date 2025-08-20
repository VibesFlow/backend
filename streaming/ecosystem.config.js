module.exports = {
  apps: [
    {
      name: 'vibesflow-streaming',
      script: 'lyria.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Auto-restart configuration
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 4000,
      max_restarts: 10,
      
      // Process management
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Environment
      cwd: '/home/ubuntu/vibesflow-streaming'
    },
    {
      name: 'vibesflow-srs',
      script: 'srs.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      
      // Logging
      log_file: './logs/srs-combined.log',
      out_file: './logs/srs-out.log',
      error_file: './logs/srs-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Auto-restart configuration
      watch: false,
      max_memory_restart: '200M',
      restart_delay: 5000,
      max_restarts: 5,
      
      // Process management
      kill_timeout: 10000,
      
      // Environment
      cwd: '/home/ubuntu/vibesflow-streaming'
    }
  ]
};
