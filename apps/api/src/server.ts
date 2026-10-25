import http from 'node:http';
import { config } from './config';
import { createApp } from './app';
import { attachWebSocket } from './realtime/ws';
import { startSubscriber } from './realtime/events';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

async function main() {
  await startSubscriber();

  const app = createApp();
  const server = http.createServer(app);
  const wss = attachWebSocket(server);

  server.listen(config.port, () => {
    console.log(`🚀 API http://localhost:${config.port}  (WebSocket: /ws)`);
  });

  // PM2 yeniden başlatırken SIGINT/SIGTERM gönderir: bağlantıları düzgün kapat
  const shutdown = async (signal: string) => {
    console.log(`${signal} alındı, kapatılıyor...`);
    wss.close();
    server.close();
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
