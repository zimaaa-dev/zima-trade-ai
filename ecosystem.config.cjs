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
    {
      name: 'cf-tunnel',
      script: 'cloudflared',
      args: 'tunnel --url http://127.0.0.1:3000',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 15,
      restart_delay: 4000,
      env: {
        TUNNEL_METRICS: '127.0.0.1:20241',
      },
    },
  ],
};
