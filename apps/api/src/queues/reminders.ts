import { Queue } from 'bullmq';
import { DateTime } from 'luxon';
import { createRedis } from '../lib/redis';
import { config } from '../config';

/**
 * BullMQ kuyruğu: "randevudan X dakika önce hatırlat" işini gecikmeli (delayed)
 * bir iş olarak Redis'e koyarız. Worker süreci (src/worker.ts) zamanı gelince işler.
 * API süreci çökse/yeniden başlasa bile iş Redis'te durduğu için kaybolmaz.
 */

export const REMINDER_QUEUE = 'reminders';

export interface ReminderJob {
  bookingId: string;
}

export const reminderQueue = new Queue<ReminderJob>(REMINDER_QUEUE, {
  connection: createRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

const jobId = (bookingId: string) => `reminder-${bookingId}`;

export async function scheduleReminder(bookingId: string, startsAt: Date) {
  const remindAt = DateTime.fromJSDate(startsAt).minus({ minutes: config.reminderMinutesBefore });
  const delay = remindAt.diffNow().as('milliseconds');

  // Hatırlatma zamanı geçmişse (ör. 30 dk sonrasına randevu) hemen gönder
  await reminderQueue.add('send-reminder', { bookingId }, { jobId: jobId(bookingId), delay: Math.max(0, delay) });
}

export async function cancelReminder(bookingId: string) {
  const job = await reminderQueue.getJob(jobId(bookingId));
  if (job) await job.remove().catch(() => undefined);
}
