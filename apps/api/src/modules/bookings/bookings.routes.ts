import { Router } from 'express';
import Joi from 'joi';
import { DateTime } from 'luxon';
import { BookingStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { validate } from '../../middleware/validate';
import { requireAuth, requireRole } from '../../middleware/auth';
import { getAvailability } from '../../services/availability';
import { cancelReminder, scheduleReminder } from '../../queues/reminders';
import { notifyUser, publishSlotsChanged } from '../../realtime/events';

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

const bookingInclude = {
  service: { select: { id: true, name: true, durationMin: true, priceCents: true } },
  provider: { select: { id: true, name: true, timezone: true } },
  customer: { select: { id: true, name: true, email: true } },
} as const;

const fmt = (d: Date, tz: string) =>
  DateTime.fromJSDate(d).setZone(tz).setLocale('tr').toFormat('d MMMM yyyy, cccc HH:mm');

const createSchema = Joi.object({
  serviceId: Joi.string().max(64).required(),
  startsAt: Joi.date().iso().required(),
});

/**
 * POST /api/bookings — rezervasyon oluştur
 *
 * Çifte rezervasyonu önlemek için: işlem (transaction) içinde hizmet veren başına
 * bir PostgreSQL advisory lock alırız. Aynı hizmet verene aynı anda gelen iki istek
 * sıraya girer; ikincisi kilidi aldığında slotun dolduğunu görür ve 409 döner.
 */
bookingsRouter.post(
  '/',
  requireRole(Role.CUSTOMER),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { serviceId, startsAt } = res.locals.body as { serviceId: string; startsAt: Date };
    const customerId = req.user!.sub;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { provider: { select: { id: true, timezone: true } } },
    });
    if (!service) throw notFound('Hizmet bulunamadı');

    const tz = service.provider.timezone;
    const start = DateTime.fromJSDate(startsAt).setZone(tz);
    const date = start.toISODate()!;

    const booking = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${service.providerId}))`;

      // Slotu sunucuda yeniden hesapla: istemcinin gönderdiğine körü körüne güvenme
      const availability = await getAvailability({ providerId: service.providerId, serviceId, date }, tx);
      // equals() saat dilimini de karşılaştırır; biz yalnızca aynı ana bakıyoruz
      const slot = availability.slots.find((s) => DateTime.fromISO(s.startsAt).toMillis() === start.toMillis());

      if (!slot) throw badRequest('Bu saat çalışma saatleri dışında veya geçersiz');
      if (!slot.available) throw conflict('Bu saat az önce doldu, lütfen başka bir saat seçin');

      return tx.booking.create({
        data: {
          serviceId,
          customerId,
          providerId: service.providerId,
          startsAt: new Date(slot.startsAt),
          endsAt: new Date(slot.endsAt),
        },
        include: bookingInclude,
      });
    });

    // İşlem başarıyla bittikten SONRA yan etkiler: kuyruk + bildirimler
    await Promise.all([
      scheduleReminder(booking.id, booking.startsAt),
      publishSlotsChanged({ providerId: booking.providerId, date }),
      notifyUser(customerId, {
        type: 'BOOKING_CONFIRMED',
        title: 'Randevunuz onaylandı',
        message: `${booking.service.name} — ${booking.provider.name}, ${fmt(booking.startsAt, tz)}`,
        bookingId: booking.id,
      }),
      notifyUser(booking.providerId, {
        type: 'NEW_BOOKING',
        title: 'Yeni randevu',
        message: `${booking.customer.name} • ${booking.service.name}, ${fmt(booking.startsAt, tz)}`,
        bookingId: booking.id,
      }),
    ]);

    res.status(201).json(booking);
  }),
);

const listQuery = Joi.object({
  scope: Joi.string().valid('upcoming', 'past', 'all').default('upcoming'),
});

/** GET /api/bookings/me — müşteriyse kendi randevuları, hizmet verense kendisine alınanlar */
bookingsRouter.get(
  '/me',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { scope } = res.locals.query;
    const now = new Date();
    const who = req.user!.role === Role.PROVIDER ? { providerId: req.user!.sub } : { customerId: req.user!.sub };

    const bookings = await prisma.booking.findMany({
      where: {
        ...who,
        ...(scope === 'upcoming' && { startsAt: { gte: now } }),
        ...(scope === 'past' && { startsAt: { lt: now } }),
      },
      include: bookingInclude,
      orderBy: { startsAt: scope === 'past' ? 'desc' : 'asc' },
      take: 100,
    });
    res.json(bookings);
  }),
);

const idParams = Joi.object({ id: Joi.string().max(64).required() });

/** POST /api/bookings/:id/cancel — müşteri veya hizmet veren iptal edebilir */
bookingsRouter.post(
  '/:id/cancel',
  validate(idParams, 'params'),
  asyncHandler(async (req, res) => {
    const booking = await prisma.booking.findUnique({
      where: { id: res.locals.params.id },
      include: bookingInclude,
    });
    if (!booking) throw notFound('Randevu bulunamadı');

    const userId = req.user!.sub;
    if (booking.customerId !== userId && booking.providerId !== userId) throw forbidden();
    if (booking.status === BookingStatus.CANCELLED) throw badRequest('Randevu zaten iptal edilmiş');
    if (booking.startsAt < new Date()) throw badRequest('Geçmiş randevu iptal edilemez');

    // Koşullu güncelleme: aynı anda gelen iki iptal isteğinden yalnızca biri başarılı olur
    const { count } = await prisma.booking.updateMany({
      where: { id: booking.id, status: BookingStatus.CONFIRMED },
      data: { status: BookingStatus.CANCELLED },
    });
    if (count === 0) throw badRequest('Randevu zaten iptal edilmiş');

    const updated = { ...booking, status: BookingStatus.CANCELLED };

    const tz = booking.provider.timezone;
    const cancelledByCustomer = userId === booking.customerId;
    const otherParty = cancelledByCustomer ? booking.providerId : booking.customerId;

    await Promise.all([
      cancelReminder(booking.id),
      publishSlotsChanged({
        providerId: booking.providerId,
        date: DateTime.fromJSDate(booking.startsAt).setZone(tz).toISODate()!,
      }),
      notifyUser(otherParty, {
        type: 'BOOKING_CANCELLED',
        title: 'Randevu iptal edildi',
        message: `${cancelledByCustomer ? booking.customer.name : booking.provider.name} randevuyu iptal etti: ${booking.service.name}, ${fmt(booking.startsAt, tz)}`,
        bookingId: booking.id,
      }),
    ]);

    res.json(updated);
  }),
);
