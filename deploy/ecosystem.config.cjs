/**
 * PM2 yapılandırması
 *
 *   npm run build
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save && pm2 startup      # sunucu yeniden başlayınca otomatik açılsın
 *
 * API "cluster" modunda CPU sayısı kadar süreçle çalışır. SSE/WebSocket olayları
 * Redis Pub/Sub ile dağıtıldığı için hangi süreçte olursa olsun herkes bildirimi alır.
 * Worker tek süreç yeterli (BullMQ zaten aynı işi iki kez vermez).
 */
const path = require('node:path');
const apiDir = path.join(__dirname, '..', 'apps', 'api');

module.exports = {
  apps: [
    {
      name: 'randevu-api',
      cwd: apiDir,
      script: 'dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
      kill_timeout: 5000,
    },
    {
      name: 'randevu-worker',
      cwd: apiDir,
      script: 'dist/worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '200M',
    },
  ],
};
