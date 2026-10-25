import { BookingStatus, Prisma, PrismaClient } from '@prisma/client';
import { DateTime, IANAZone } from 'luxon';
import { prisma as defaultPrisma } from '../lib/prisma';
import { notFound } from '../lib/errors';

type Db = PrismaClient | Prisma.TransactionClient;

export interface Slot {
  /** UTC ISO */
  startsAt: string;
  endsAt: string;
  /** Hizmet verenin saatinde "HH:mm" */
  label: string;
  available: boolean;
}

export interface Availability {
  providerId: string;
  serviceId: string;
  date: string;
  timezone: string;
  slots: Slot[];
}

export const isValidTimezone = (tz: string) => IANAZone.isValidZone(tz);

/**
 * Bir hizmet verenin belirli bir gündeki boş/dolu slotlarını hesaplar.
 *
 * Luxon'un burada neden önemli olduğu: çalışma saatleri hizmet verenin YEREL
 * saatiyle ("09:00 Europe/Istanbul") tanımlı, rezervasyonlar ise veritabanında UTC.
 * Kullanıcı farklı bir zaman diliminde olsa bile doğru slotu göstermek için
 * yerel saati UTC'ye dönüştürürüz. Yaz saati geçişlerini Luxon kendisi halleder.
 *
 * @param date hizmet verenin zaman dilimindeki gün, "YYYY-MM-DD"
 */
export async function getAvailability(
  params: { providerId: string; serviceId: string; date: string },
  db: Db = defaultPrisma,
): Promise<Availability> {
  const service = await db.service.findFirst({
    where: { id: params.serviceId, providerId: params.providerId },
    include: { provider: { select: { timezone: true } } },
  });
  if (!service) throw notFound('Hizmet bulunamadı');

  const tz = service.provider.timezone;
  const day = DateTime.fromISO(params.date, { zone: tz }).startOf('day');
  if (!day.isValid) throw notFound('Geçersiz tarih');

  const base: Availability = {
    providerId: params.providerId,
    serviceId: params.serviceId,
    date: day.toISODate()!,
    timezone: tz,
    slots: [],
  };

  const wh = await db.workingHour.findUnique({
    where: { providerId_weekday: { providerId: params.providerId, weekday: day.weekday } },
  });
  if (!wh) return base; // o gün kapalı

  const [sh, sm] = wh.startTime.split(':').map(Number);
  const [eh, em] = wh.endTime.split(':').map(Number);
  const open = day.set({ hour: sh, minute: sm });
  const close = day.set({ hour: eh, minute: em });

  const bookings = await db.booking.findMany({
    where: {
      providerId: params.providerId,
      status: BookingStatus.CONFIRMED,
      startsAt: { lt: close.toJSDate() },
      endsAt: { gt: open.toJSDate() },
    },
    select: { startsAt: true, endsAt: true },
  });

  const now = DateTime.now();
  const step = { minutes: service.durationMin };

  for (let start = open; start.plus(step) <= close; start = start.plus(step)) {
    const end = start.plus(step);
    const overlaps = bookings.some(
      (b) => b.startsAt < end.toJSDate() && b.endsAt > start.toJSDate(),
    );
    base.slots.push({
      startsAt: start.toUTC().toISO()!,
      endsAt: end.toUTC().toISO()!,
      label: start.toFormat('HH:mm'),
      available: !overlaps && start > now,
    });
  }

  return base;
}
