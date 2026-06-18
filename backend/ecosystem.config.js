/**
 * PM2 Ecosystem Config — ISOMAC
 *
 * TWO APPS:
 *   isomac-api  — Express HTTP server, cluster mode (all CPU cores)
 *   isomac-cron — Cron jobs only, single fork process (NEVER cluster)
 *
 * The cron app is intentionally isolated so alert + backup jobs fire
 * exactly once per schedule, regardless of how many API workers are running.
 *
 * Usage:
 *   Production:  pm2 start ecosystem.config.js --env production
 *   Development: pm2 start ecosystem.config.js --env development
 *   Logs:        pm2 logs
 *   Monitor:     pm2 monit
 *   Save:        pm2 save
 *   Startup:     pm2 startup
 */
module.exports = {
  apps: [
    // ── API Server ────────────────────────────────────────────────────────────
    {
      name: 'isomac-api',
      script: 'server.js',
      cwd: __dirname,

      instances: 'max',
      exec_mode: 'cluster',

      autorestart:        true,
      watch:              false,
      max_memory_restart: '512M',
      restart_delay:      2000,
      max_restarts:       10,
      min_uptime:         '10s',

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file:  './logs/api-error.log',
      out_file:    './logs/api-out.log',
      merge_logs:  true,

      env_production: {
        NODE_ENV: 'production',
        PORT:     5000,
        ROLE:     'api',
      },
      env_development: {
        NODE_ENV:  'development',
        PORT:      5000,
        ROLE:      'api',
        instances: 1,
        exec_mode: 'fork',
      },
    },

    // ── Cron Worker ───────────────────────────────────────────────────────────
    // MUST stay instances: 1, exec_mode: 'fork' — never change this.
    // Cluster mode would run N copies of every cron job.
    {
      name: 'isomac-cron',
      script: 'cron.js',
      cwd: __dirname,

      instances: 1,
      exec_mode: 'fork',

      autorestart:        true,
      watch:              false,
      max_memory_restart: '256M',
      restart_delay:      5000,
      max_restarts:       10,
      min_uptime:         '10s',

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file:  './logs/cron-error.log',
      out_file:    './logs/cron-out.log',
      merge_logs:  false,

      env_production: {
        NODE_ENV: 'production',
        ROLE:     'cron',
      },
      env_development: {
        NODE_ENV: 'development',
        ROLE:     'cron',
      },
    },
  ],
};
