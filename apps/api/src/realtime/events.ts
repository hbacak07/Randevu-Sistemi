import { EventEmitter } from 'node:events';
import { redis, createRedis } from '../lib/redis';

/**
 * Gerçek zamanlı olaylar Redis Pub/Sub üzerinden dağıtılır.
 *
 * Neden doğrudan bellekte değil? PM2 ile API'yi birden fazla süreçte (cluster)
 * çalıştırdığında, bir kullanıcının SSE bağlantısı 1. süreçte, rezervasyonu
 * oluşturan istek 2. süreçte olabilir. Redis tüm süreçlere olayı ulaştırır.
 * Worker süreci de (hatırlatmalar) aynı yolla bildirim gönderir.
 *
 *   user:<userId>        → o kullanıcıya bildirim (SSE ile iletilir)
 *   slots:<providerId>   → hizmet verenin müsaitliği değişti (WebSocket ile iletilir)
 */

export type NotificationType = 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED' | 'NEW_BOOKING' | 'REMINDER';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  bookingId?: string;
  createdAt: string;
}

export interface SlotsChangedEvent {
  providerId: string;
  /** Etkilenen gün, hizmet verenin zaman diliminde (YYYY-MM-DD) */
  date: string;
}

export async function notifyUser(userId: string, n: Omit<Notification, 'id' | 'createdAt'>) {
  const payload: Notification = {
    ...n,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await redis.publish(`user:${userId}`, JSON.stringify(payload));
}

export async function publishSlotsChanged(e: SlotsChangedEvent) {
  await redis.publish(`slots:${e.providerId}`, JSON.stringify(e));
}

/**
 * Bu süreç içinde dinlemek için yerel bir EventEmitter.
 * Redis'e tek bir abonelik açılır, gelen mesajlar buradan dağıtılır:
 *   bus.on('user', (userId, notification) => ...)
 *   bus.on('slots', (event) => ...)
 */
export const bus = new EventEmitter();
bus.setMaxListeners(0);

let started = false;

export async function startSubscriber() {
  if (started) return;
  started = true;

  const sub = createRedis();
  await sub.psubscribe('user:*', 'slots:*');

  sub.on('pmessage', (_pattern, channel, message) => {
    try {
      const data = JSON.parse(message);
      if (channel.startsWith('user:')) {
        bus.emit('user', channel.slice('user:'.length), data as Notification);
      } else if (channel.startsWith('slots:')) {
        bus.emit('slots', data as SlotsChangedEvent);
      }
    } catch (err) {
      console.error('Pub/Sub mesajı çözümlenemedi:', err);
    }
  });
}
