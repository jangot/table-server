// ecosystem.config.cjs
// Copy to your deployment directory and adjust paths/env. Do not commit secrets.
// Run: pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: 'table-server',
      script: 'dist/index.js',
      cwd: '/path/to/table-server',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        // CHROME_PATH, OBS_PATH, IDLE_PORT, IDLE_VIEWS_PATH, LOG_LEVEL, etc.
        // Set here or via .env in cwd (app loads dotenv). Do not store secrets in repo.
      },
      // App loads .env from cwd via dotenv; set cwd to project root. For secrets, use .env (in .gitignore) or set env here.
      // env_file: '.env',  // not a standard PM2 option; rely on app's dotenv loading from cwd
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
    },
  ],
};
