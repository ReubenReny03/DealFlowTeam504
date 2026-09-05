/**
 * Scaffolding for the read side of a module.
 *
 * Phase 3 wires every screen to real, seeded data immediately so nobody is
 * blocked and no screen is ever empty. The WRITE side — the actual business
 * logic — is deliberately left to the owning agent; each module's `todo` list
 * names exactly what is still theirs to build.
 */
import { Router, type Request } from 'express';
import type { Model } from 'mongoose';
import type { Role } from '@dealflow/shared';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { notFound } from '../utils/apiError.js';
import { ok, paginate } from '../utils/respond.js';
import { toDto, toDtoList } from '../utils/serialize.js';

export interface ReadonlyOptions {
  model: Model<any>;
  roles?: Role[];
  /** Default sort, mongo syntax. */
  sort?: Record<string, 1 | -1>;
  /** Fields matched by the `?q=` search box. */
  searchFields?: string[];
  /** Query params mapped straight onto the filter. */
  filterFields?: string[];
  /** Extra filter derived from the request (e.g. restrict a rep to their own rows). */
  scope?: (req: Request) => Record<string, unknown>;
  defaultPageSize?: number;
}

export function mountReadonly(router: Router, options: ReadonlyOptions): Router {
  const {
    model, roles, sort = { createdAt: -1 },
    searchFields = [], filterFields = [], scope, defaultPageSize = 50,
  } = options;

  router.get(
    '/',
    requireAuth(roles),
    asyncHandler(async (req, res) => {
      const page = Math.max(1, Number(req.query.page ?? 1));
      const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? defaultPageSize)));
      const filter: Record<string, unknown> = { ...(scope?.(req) ?? {}) };

      for (const field of filterFields) {
        const value = req.query[field];
        if (value !== undefined && value !== '') filter[field] = value;
      }
      const q = req.query.q as string | undefined;
      if (q && searchFields.length > 0) {
        filter.$or = searchFields.map((f) => ({ [f]: { $regex: q, $options: 'i' } }));
      }

      const [items, total] = await Promise.all([
        model.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize).lean(),
        model.countDocuments(filter),
      ]);
      ok(res, toDtoList(items), paginate([], page, pageSize, total));
    }),
  );

  router.get(
    '/:id',
    requireAuth(roles),
    asyncHandler(async (req, res) => {
      const doc = await model.findById(req.params.id).lean();
      if (!doc) throw notFound(`No ${model.modelName.toLowerCase()} with id ${req.params.id}`);
      ok(res, toDto(doc));
    }),
  );

  return router;
}
