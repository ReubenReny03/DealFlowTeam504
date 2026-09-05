/**
 * Express application. THIS FILE IS FROZEN.
 * To add an endpoint, append one line to routes.registry.ts — never edit here.
 */
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { PORTAL_TOKEN_HEADER } from '@dealflow/shared';
import { env } from './config/env.js';
import { attachUser } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { ROUTES } from './routes.registry.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.webOrigin === '*' ? true : env.webOrigin.split(',').map((s) => s.trim()),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', PORTAL_TOKEN_HEADER, 'X-Client-Version'],
      exposedHeaders: ['X-Total-Count'],
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  // Every request gets `req.user` when a valid Bearer token is present.
  app.use(attachUser);

  for (const route of ROUTES) {
    app.use(`${env.apiBasePath}${route.basePath}`, route.router);
  }

  // Route inventory, so anyone can see what is wired without reading the code.
  app.get(`${env.apiBasePath}/_routes`, (_req, res) => {
    res.json({
      success: true,
      data: ROUTES.map((r) => ({
        basePath: `${env.apiBasePath}${r.basePath}`,
        domain: r.domain,
        description: r.description,
      })),
      error: null,
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
