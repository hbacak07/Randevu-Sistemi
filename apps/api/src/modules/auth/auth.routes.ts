import { Router } from 'express';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { signToken } from '../../lib/jwt';
import { asyncHandler } from '../../lib/asyncHandler';
import { conflict, notFound, unauthorized } from '../../lib/errors';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { isValidTimezone } from '../../services/availability';

export const authRouter = Router();

const publicUser = { id: true, email: true, name: true, role: true, timezone: true } as const;

const registerSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(6).max(100).required(),
  name: Joi.string().trim().min(2).max(80).required(),
  role: Joi.string().valid(Role.CUSTOMER, Role.PROVIDER).default(Role.CUSTOMER),
  timezone: Joi.string()
    .custom((v, helpers) => (isValidTimezone(v) ? v : helpers.error('any.invalid')))
    .default('Europe/Istanbul')
    .messages({ 'any.invalid': 'Geçersiz zaman dilimi' }),
});

authRouter.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (_req, res) => {
    const { email, password, name, role, timezone } = res.locals.body;

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw conflict('Bu e-posta ile kayıtlı bir hesap var');

    const user = await prisma.user.create({
      data: { email, name, role, timezone, passwordHash: await bcrypt.hash(password, 10) },
      select: publicUser,
    });

    const token = signToken({ sub: user.id, role: user.role, name: user.name });
    res.status(201).json({ token, user });
  }),
);

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
});

authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (_req, res) => {
    const { email, password } = res.locals.body;
    const user = await prisma.user.findUnique({ where: { email } });

    // Hangisinin yanlış olduğunu söylemiyoruz (hesap tahminini zorlaştırır)
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw unauthorized('E-posta veya şifre hatalı');
    }

    const token = signToken({ sub: user.id, role: user.role, name: user.name });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, timezone: user.timezone },
    });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: publicUser });
    if (!user) throw notFound('Kullanıcı bulunamadı');
    res.json(user);
  }),
);
