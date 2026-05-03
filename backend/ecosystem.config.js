module.exports = {
  apps: [{
    name: 'tdr-backend-local',
    script: 'dist/index.js',
    cwd: '/home/work/.openclaw/workspace/zamtel-tdr-monitor/backend',
    instances: 2,           // use both CPUs
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    restart_delay: 2000,    // 2s between restarts (was 3s)
    max_restarts: 30,
    min_uptime: '5s',
    max_memory_restart: '300M',   // auto-restart if process leaks past 300MB
    kill_timeout: 5000,     // give in-flight requests 5s to drain on restart
    listen_timeout: 8000,   // wait up to 8s for new worker to be ready
    output: '/tmp/tdr-backend.out',
    error: '/tmp/tdr-backend.err',
    env: {
      NODE_ENV: 'production',
      PORT: '8082',
      UV_THREADPOOL_SIZE: '16',   // more threads for crypto/bcrypt under load
    }
  }]
};
