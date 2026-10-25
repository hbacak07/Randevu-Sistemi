import Redis from 'ioredis';
import { config } from '../config';

/**
 * BullMQ, bağlantı için `maxRetriesPerRequest: null` ister.
 * Pub/Sub için ayrı bağlantı gerekir: bir Redis bağlantısı SUBSCRIBE moduna
 * girdiğinde başka komut çalıştıramaz.
 */
export function createRedis(): Redis {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}

/** Genel amaçlı komutlar ve PUBLISH için paylaşılan bağlantı */
export const redis = createRedis();
