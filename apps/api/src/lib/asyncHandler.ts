import { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 4 async hataları yakalamaz; bu sarmalayıcı hatayı next()'e iletir. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
