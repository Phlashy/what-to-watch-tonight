module.exports = {
  apps: [
    {
      // Second instances (e.g. the Montreal family's copy) set WTWT_PM2_NAME in
      // their checkout's .env; scripts/deploy.sh exports it before calling pm2.
      // (PORT here is just a default — the server's dotenv override means the
      // checkout's .env PORT wins.)
      name: process.env.WTWT_PM2_NAME || 'movie-night',
      script: 'server/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      watch: false,
      max_memory_restart: '200M',
      kill_timeout: 5000,
    },
  ],
};
