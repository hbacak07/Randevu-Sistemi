import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { verifyToken, TokenPayload } from '../lib/jwt';
import { forbidden, unauthorized } from '../lib/errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/** "Authorization: Bearer <token>" başlığını doğrular ve req.user'ı doldurur */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());

  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    next(unauthorized('Oturum süresi dolmuş veya geçersiz'));
  }
}

/** Yalnızca belirli rollere izin verir. requireAuth'tan sonra kullanılmalı. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}
