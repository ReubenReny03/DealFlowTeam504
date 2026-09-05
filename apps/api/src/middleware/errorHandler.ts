import type { NextFunction, Request, Response } from 'express';
import { ErrorCode, type ApiResponse } from '@dealflow/shared';
import { env } from '../config/env.js';
import { ApiException } from '../utils/apiError.js';

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiResponse<null> = {
    success: false,
    data: null,
    error: { code: ErrorCode.NOT_FOUND, message: `No route matches ${req.method} ${req.originalUrl}` },
  };
  res.status(404).json(body);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiException) {
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.status).json(body);
    return;
  }

  const e = err as { name?: string; code?: number; message?: string; keyValue?: unknown; stack?: string };

  if (e?.name === 'CastError') {
    res.status(400).json({
      success: false, data: null,
      error: { code: ErrorCode.VALIDATION_ERROR, message: 'Malformed identifier in the request.' },
    } satisfies ApiResponse<null>);
    return;
  }

  if (e?.code === 11000) {
    res.status(409).json({
      success: false, data: null,
      error: { code: ErrorCode.CONFLICT, message: 'A record with that unique value already exists.', details: e.keyValue },
    } satisfies ApiResponse<null>);
    return;
  }

  if (e?.name === 'ValidationError') {
    res.status(400).json({
      success: false, data: null,
      error: { code: ErrorCode.VALIDATION_ERROR, message: e.message ?? 'Validation failed.' },
    } satisfies ApiResponse<null>);
    return;
  }

  console.error('[unhandled]', err);
  res.status(500).json({
    success: false, data: null,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Something went wrong on our side.',
      details: env.isProd ? undefined : { message: e?.message, stack: e?.stack },
    },
  } satisfies ApiResponse<null>);
}
