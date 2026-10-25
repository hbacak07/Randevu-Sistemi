import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { authRouter } from './modules/auth/auth.routes';
import { providersRouter } from './modules/providers/providers.routes';
import { providerAdminRouter } from './modules/provider-admin/provider-admin.routes';
import { bookingsRouter } from './modules/bookings/bookings.routes';
import { sseRouter } from './realtime/sse';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // Nginx arkasında gerçek istemci IP'si için
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redis.ping();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded' });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/providers', providersRouter);
  app.use('/api/provider', providerAdminRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/notifications', sseRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
