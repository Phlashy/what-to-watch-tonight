module.exports = {
  apps: [{
    name: 'movie-night',
    script: 'server/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    watch: false,
    max_memory_restart: '200M',
    kill_timeout: 5000,
  }],
};
