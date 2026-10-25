import { Router } from 'express';
import Joi from 'joi';
import { DateTime } from 'luxon';
import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { notFound } from '../../lib/errors';
import { validate } from '../../middleware/validate';
import { getAvailability } from '../../services/availability';

export const providersRouter = Router();

/** GET /api/providers — tüm hizmet verenler ve hizmetleri */
providersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const providers = await prisma.user.findMany({
      where: { role: Role.PROVIDER },
      select: {
        id: true,
        name: true,
        timezone: true,
        services: { select: { id: true, name: true, durationMin: true, priceCents: true }, orderBy: { name: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(providers);
  }),
);

const idParams = Joi.object({ id: Joi.string().max(64).required() });

/** GET /api/providers/:id — detay + çalışma saatleri */
providersRouter.get(
  '/:id',
  validate(idParams, 'params'),
  asyncHandler(async (_req, res) => {
    const provider = await prisma.user.findFirst({
      where: { id: res.locals.params.id, role: Role.PROVIDER },
      select: {
        id: true,
        name: true,
        timezone: true,
        services: { select: { id: true, name: true, durationMin: true, priceCents: true }, orderBy: { name: 'asc' } },
        workingHours: { select: { weekday: true, startTime: true, endTime: true }, orderBy: { weekday: 'asc' } },
      },
    });
    if (!provider) throw notFound('Hizmet veren bulunamadı');
    res.json(provider);
  }),
);

const availabilityQuery = Joi.object({
  serviceId: Joi.string().max(64).required(),
  date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .custom((v, helpers) => (DateTime.fromISO(v).isValid ? v : helpers.error('any.invalid')))
    .required()
    .messages({ 'string.pattern.base': 'Tarih YYYY-MM-DD formatında olmalı', 'any.invalid': 'Geçersiz tarih' }),
});

/** GET /api/providers/:id/availability?serviceId=...&date=2026-10-26 */
providersRouter.get(
  '/:id/availability',
  validate(idParams, 'params'),
  validate(availabilityQuery, 'query'),
  asyncHandler(async (_req, res) => {
    const result = await getAvailability({
      providerId: res.locals.params.id,
      serviceId: res.locals.query.serviceId,
      date: res.locals.query.date,
    });
    res.json(result);
  }),
);
