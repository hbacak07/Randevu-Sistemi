import { Request, Response, Router } from 'express';
import { verifyToken } from '../lib/jwt';
import { bus, Notification } from './events';

/**
 * SSE (Server-Sent Events): sunucudan tarayıcıya TEK YÖNLÜ canlı akış.
 * Kişisel bildirimler (rezervasyon onayı, iptal, hatırlatma) için idealdir:
 * tarayıcı otomatik yeniden bağlanır, düz HTTP olduğu için Nginx'ten kolay geçer.
 *
 * Tarayıcıdaki EventSource özel başlık gönderemediği için token query'den alınır:
 *   GET /api/notifications/stream?token=<jwt>
 */

const clients = new Map<string, Set<Response>>();

bus.on('user', (userId: string, n: Notification) => {
  const set = clients.get(userId);
  if (!set) return;
  const frame = `event: notification\ndata: ${JSON.stringify(n)}\n\n`;
  for (const res of set) res.write(frame);
});

export const sseRouter = Router();

sseRouter.get('/stream', (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  let userId: string;
  try {
    userId = verifyToken(token).sub;
  } catch {
    return res.status(401).json({ error: 'Geçersiz token' });
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx'in yanıtı tamponlamasını engeller
  });
  res.flushHeaders();
  res.write(`event: ready\ndata: {}\n\n`);

  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);

  // Proxy'ler boşta kalan bağlantıyı kesmesin diye düzenli yorum satırı gönder
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const set = clients.get(userId);
    set?.delete(res);
    if (set && set.size === 0) clients.delete(userId);
  });
});
