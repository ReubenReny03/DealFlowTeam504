import type { Response } from 'express';
import type { ApiMeta, ApiResponse } from '@dealflow/shared';

export function ok<T>(res: Response, data: T, meta?: ApiMeta, status = 200): Response {
  const body: ApiResponse<T> = { success: true, data, error: null, ...(meta ? { meta } : {}) };
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T, meta?: ApiMeta): Response {
  return ok(res, data, meta, 201);
}

export function paginate<T>(items: T[], page: number, pageSize: number, total: number) {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 1,
  };
}
