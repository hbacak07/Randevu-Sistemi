import { Router } from 'express';
import Joi from 'joi';
import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { badRequest } from '../../lib/errors';
import { validate } from '../../middleware/validate';
import { requireAuth, requireRole } from '../../middleware/auth';

/**
 * Hizmet verenin kendi hizmetlerini ve çalışma saatlerini yönettiği uç noktalar.
 * Yalnızca PROVIDER rolü erişebilir.
 */
export const providerAdminRouter = Router();
providerAdminRouter.use(requireAuth, requireRole(Role.PROVIDER));

const serviceSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  durationMin: Joi.number().integer().valid(15, 20, 30, 45, 60, 90, 120).required(),
  priceCents: Joi.number().integer().min(0).default(0),
});

providerAdminRouter.post(
  '/services',
  validate(serviceSchema),
  asyncHandler(async (req, res) => {
    const service = await prisma.service.create({
      data: { ...res.locals.body, providerId: req.user!.sub },
    });
    res.status(201).json(service);
  }),
);

const time = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).messages({
  'string.pattern.base': 'Saat HH:mm formatında olmalı',
});

const workingHoursSchema = Joi.object({
  days: Joi.array()
    .items(
      Joi.object({
        weekday: Joi.number().integer().min(1).max(7).required(),
        startTime: time.required(),
        endTime: time.required(),
      }),
    )
    .unique('weekday')
    .max(7)
    .required(),
});

/** PUT /api/provider/working-hours — haftalık programı tamamen değiştirir */
providerAdminRouter.put(
  '/working-hours',
  validate(workingHoursSchema),
  asyncHandler(async (req, res) => {
    const days: { weekday: number; startTime: string; endTime: string }[] = res.locals.body.days;
    for (const d of days) {
      if (d.startTime >= d.endTime) throw badRequest(`${d.weekday}. gün için başlangıç bitişten önce olmalı`);
    }

    const providerId = req.user!.sub;
    await prisma.$transaction([
      prisma.workingHour.deleteMany({ where: { providerId } }),
      prisma.workingHour.createMany({ data: days.map((d) => ({ ...d, providerId })) }),
    ]);

    res.json({ ok: true });
  }),
);
