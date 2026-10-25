import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';

/**
 * POST /api/bookings ve iptal uçlarının testleri.
 * Veritabanı ve Redis bellekte taklit edilir; slot hesaplama (Luxon) ve
 * route mantığı gerçek koddur.
 */

const TZ = 'Europe/Istanbul';
const PROVIDER_ID = 'provider-1';
const CUSTOMER_ID = 'customer-1';
const SERVICE = { id: 'service-1', providerId: PROVIDER_ID, name: 'Muayene', durationMin: 30, priceCents: 0 };

// Bir hafta sonrası: slotlar her zaman gelecekte kalsın
const day = DateTime.now().setZone(TZ).plus({ days: 7 }).startOf('day');
const at = (hour: number, minute = 0) => day.set({ hour, minute }).toUTC().toISO()!;

type FakeBooking = { id: string; startsAt: Date; endsAt: Date; status: 'CONFIRMED' | 'CANCELLED' };

const db = vi.hoisted(() => ({
  bookings: [] as { id: string; startsAt: Date; endsAt: Date; status: 'CONFIRMED' | 'CANCELLED' }[],
  updateManyCount: null as number | null,
}));

vi.mock('../src/lib/prisma', () => {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    service: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.id === SERVICE.id && where.providerId === PROVIDER_ID ? { ...SERVICE, provider: { timezone: TZ } } : null,
      ),
    },
    workingHour: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.providerId_weekday.weekday === day.weekday ? { startTime: '09:00', endTime: '17:00' } : null,
      ),
    },
    booking: {
      findMany: vi.fn(async () => db.bookings.filter((b) => b.status === 'CONFIRMED')),
      create: vi.fn(async ({ data }: any) => {
        const b = { id: `booking-${db.bookings.length + 1}`, status: 'CONFIRMED' as const, ...data };
        db.bookings.push(b);
        return withRelations(b);
      }),
    },
  };

  const withRelations = (b: FakeBooking) => ({
    ...b,
    providerId: PROVIDER_ID,
    customerId: CUSTOMER_ID,
    service: SERVICE,
    provider: { id: PROVIDER_ID, name: 'Dr. Test', timezone: TZ },
    customer: { id: CUSTOMER_ID, name: 'Müşteri', email: 'm@ornek.com' },
  });

  return {
    prisma: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      service: {
        findUnique: vi.fn(async ({ where }: any) =>
          where.id === SERVICE.id ? { ...SERVICE, provider: { id: PROVIDER_ID, timezone: TZ } } : null,
        ),
      },
      booking: {
        findUnique: vi.fn(async ({ where }: any) => {
          const b = db.bookings.find((x) => x.id === where.id);
          return b ? withRelations(b) : null;
        }),
        // db.updateManyCount ile "başka bir istek önce iptal etti" durumu taklit edilir
        updateMany: vi.fn(async ({ where, data }: any) => {
          if (db.updateManyCount !== null) return { count: db.updateManyCount };
          const b = db.bookings.find((x) => x.id === where.id && x.status === where.status);
          if (b) b.status = data.status;
          return { count: b ? 1 : 0 };
        }),
      },
    },
  };
});

vi.mock('../src/lib/redis', () => ({
  redis: { ping: vi.fn(), publish: vi.fn(), quit: vi.fn() },
  createRedis: vi.fn(() => ({})),
}));

vi.mock('../src/queues/reminders', () => ({
  scheduleReminder: vi.fn(async () => undefined),
  cancelReminder: vi.fn(async () => undefined),
}));

vi.mock('../src/realtime/events', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    bus: new EventEmitter(),
    notifyUser: vi.fn(async () => undefined),
    publishSlotsChanged: vi.fn(async () => undefined),
  };
});

const { createApp } = await import('../src/app');
const { signToken } = await import('../src/lib/jwt');
const { scheduleReminder, cancelReminder } = await import('../src/queues/reminders');
const { notifyUser, publishSlotsChanged } = await import('../src/realtime/events');

const app = createApp();
const customerToken = signToken({ sub: CUSTOMER_ID, role: 'CUSTOMER', name: 'Müşteri' });
const providerToken = signToken({ sub: PROVIDER_ID, role: 'PROVIDER', name: 'Dr. Test' });

const book = (startsAt: string, token = customerToken) =>
  request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`).send({ serviceId: SERVICE.id, startsAt });

beforeEach(() => {
  db.bookings = [];
  db.updateManyCount = null;
  vi.clearAllMocks();
});

describe('POST /api/bookings', () => {
  it('geçerli bir slot için randevu oluşturur ve yan etkileri tetikler', async () => {
    const res = await book(at(10));

    expect(res.status).toBe(201);
    expect(res.body.startsAt).toBe(new Date(at(10)).toISOString());
    expect(res.body.endsAt).toBe(new Date(at(10, 30)).toISOString());
    expect(db.bookings).toHaveLength(1);

    expect(scheduleReminder).toHaveBeenCalledWith(res.body.id, expect.any(Date));
    expect(publishSlotsChanged).toHaveBeenCalledWith({ providerId: PROVIDER_ID, date: day.toISODate() });
    expect(notifyUser).toHaveBeenCalledWith(CUSTOMER_ID, expect.objectContaining({ type: 'BOOKING_CONFIRMED' }));
    expect(notifyUser).toHaveBeenCalledWith(PROVIDER_ID, expect.objectContaining({ type: 'NEW_BOOKING' }));
  });

  it('aynı anı farklı bir ofsetle gönderen istemciyi de kabul eder', async () => {
    // 10:00 İstanbul = 07:00Z; istemci "+03:00" ofsetiyle yollasa da aynı slot
    const local = day.set({ hour: 10 }).toISO()!;
    const res = await book(local);
    expect(res.status).toBe(201);
  });

  it('dolu slot için 409 döner', async () => {
    expect((await book(at(10))).status).toBe(201);

    const res = await book(at(10));
    expect(res.status).toBe(409);
    expect(db.bookings).toHaveLength(1);
  });

  it('çalışma saatleri dışındaki veya slota denk gelmeyen saat için 400 döner', async () => {
    expect((await book(at(8))).status).toBe(400);
    expect((await book(at(10, 10))).status).toBe(400);
    expect(db.bookings).toHaveLength(0);
  });

  it('hizmet veren rolüyle randevu alınamaz (403)', async () => {
    expect((await book(at(10), providerToken)).status).toBe(403);
  });

  it('oturum olmadan 401 döner', async () => {
    const res = await request(app).post('/api/bookings').send({ serviceId: SERVICE.id, startsAt: at(10) });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/bookings/:id/cancel', () => {
  it('randevuyu iptal eder ve karşı tarafa bildirir', async () => {
    const { body } = await book(at(11));
    vi.clearAllMocks();

    const res = await request(app)
      .post(`/api/bookings/${body.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(cancelReminder).toHaveBeenCalledWith(body.id);
    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(notifyUser).toHaveBeenCalledWith(PROVIDER_ID, expect.objectContaining({ type: 'BOOKING_CANCELLED' }));
  });

  it('eşzamanlı başka bir iptal önce davrandıysa 400 döner ve bildirim göndermez', async () => {
    const { body } = await book(at(11));
    vi.clearAllMocks();
    db.updateManyCount = 0; // okuma sırasında CONFIRMED, güncelleme anında artık değil

    const res = await request(app)
      .post(`/api/bookings/${body.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(400);
    expect(notifyUser).not.toHaveBeenCalled();
    expect(cancelReminder).not.toHaveBeenCalled();
  });
});
