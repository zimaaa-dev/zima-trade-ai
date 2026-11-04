module.exports = {
  apps: [
    {
      name: 'zima-core',
      script: 'npm',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2500M',
      node_args: '--max-old-space-size=2048',
      env: {
        PORT: 3000,
        NODE_ENV: 'production',
      },
    },
  ],
};
