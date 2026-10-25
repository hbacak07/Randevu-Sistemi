import { NextFunction, Request, Response } from 'express';
import Joi from 'joi';
import { badRequest } from '../lib/errors';

type Source = 'body' | 'query' | 'params';

/**
 * Joi şemasıyla isteğin bir bölümünü doğrular.
 * Doğrulanmış (ve dönüştürülmüş, ör. string→number) değeri res.locals[source]'a yazar.
 *
 *   router.post('/', validate(schema), handler)
 *   router.get('/', validate(schema, 'query'), handler)
 */
export function validate(schema: Joi.Schema, source: Source = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return next(
        badRequest(
          'Doğrulama hatası',
          error.details.map((d) => ({ field: d.path.join('.'), message: d.message })),
        ),
      );
    }

    res.locals[source] = value;
    next();
  };
}
