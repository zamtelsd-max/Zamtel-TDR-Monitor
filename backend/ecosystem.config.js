module.exports = {
  apps: [{
    name: 'tdr-backend-local',
    script: 'dist/index.js',
    cwd: '/home/work/.openclaw/workspace/zamtel-tdr-monitor/backend',
    instances: 1,
    autorestart: true,
    watch: false,
    restart_delay: 3000,
    max_restarts: 20,
    min_uptime: '5s',
    output: '/tmp/tdr-backend.out',
    error: '/tmp/tdr-backend.err',
    env: {
      NODE_ENV: 'production',
      PORT: '8082'
    }
  }]
};
