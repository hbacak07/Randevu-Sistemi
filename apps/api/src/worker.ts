import './config';
import { Worker } from 'bullmq';
import { DateTime } from 'luxon';
import { BookingStatus } from '@prisma/client';
import { prisma } from './lib/prisma';
import { createRedis, redis } from './lib/redis';
import { REMINDER_QUEUE, ReminderJob } from './queues/reminders';
import { notifyUser } from './realtime/events';

/**
 * Arka plan işçisi — API'den AYRI bir süreç olarak çalışır (PM2'de ayrı uygulama).
 * Ağır/zamanlanmış işler burada yapılır, böylece API istekleri yavaşlamaz.
 */
const worker = new Worker<ReminderJob>(
  REMINDER_QUEUE,
  async (job) => {
    const booking = await prisma.booking.findUnique({
      where: { id: job.data.bookingId },
      include: {
        service: { select: { name: true } },
        provider: { select: { name: true, timezone: true } },
        customer: { select: { name: true, email: true } },
      },
    });

    // Randevu silinmiş/iptal edilmişse sessizce geç
    if (!booking || booking.status !== BookingStatus.CONFIRMED) return { skipped: true };

    const when = DateTime.fromJSDate(booking.startsAt)
      .setZone(booking.provider.timezone)
      .setLocale('tr')
      .toFormat('d MMMM HH:mm');

    await notifyUser(booking.customerId, {
      type: 'REMINDER',
      title: 'Randevu hatırlatması',
      message: `${booking.service.name} randevunuz ${when}'de, ${booking.provider.name} ile.`,
      bookingId: booking.id,
    });

    // Gerçek projede burada e-posta/SMS servisi çağrılır (Nodemailer, SES, Twilio...)
    console.log(`📧 [E-posta simülasyonu] ${booking.customer.email} → ${booking.service.name}, ${when}`);
    return { sent: true };
  },
  { connection: createRedis(), concurrency: 5 },
);

worker.on('ready', () => console.log('👷 Worker hazır, "reminders" kuyruğu dinleniyor'));
worker.on('completed', (job, result) => console.log(`✔ İş ${job.id} tamamlandı`, result));
worker.on('failed', (job, err) => console.error(`✖ İş ${job?.id} başarısız:`, err.message));

const shutdown = async () => {
  await worker.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
