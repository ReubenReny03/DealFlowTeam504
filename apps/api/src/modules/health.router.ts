import { Router } from 'express';
import mongoose from 'mongoose';
import { ok } from '../utils/respond.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    ok(res, {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      mongo: states[mongoose.connection.readyState] ?? 'unknown',
      timestamp: new Date().toISOString(),
    });
  }),
);
