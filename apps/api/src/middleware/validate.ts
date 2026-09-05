import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { badRequest } from '../utils/apiError.js';

type Target = 'body' | 'query' | 'params';

/** Zod request validation. Replaces the validated value so handlers get typed, coerced data. */
export function validate(schema: ZodTypeAny, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target]);
      if (target === 'query') Object.defineProperty(req, 'query', { value: parsed, writable: true });
      else (req as any)[target] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          badRequest(
            'The request did not match the expected shape.',
            err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
          ),
        );
      }
      next(err);
    }
  };
}
