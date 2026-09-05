/**
 * Every module mounts this so `npm run dev:api` is green from minute one, even
 * before its business logic exists. GET /api/v1/<module>/_health tells you
 * whether the module is wired, who owns it, and what is still stubbed.
 */
import { Router } from 'express';
import { ok } from '../utils/respond.js';

export interface ModuleHealth {
  module: string;
  owner: 'A' | 'B' | 'C' | 'D';
  screens: number[];
  implemented: string[];
  todo: string[];
}

export function mountModuleHealth(router: Router, info: ModuleHealth): Router {
  router.get('/_health', (_req, res) => {
    ok(res, { status: 'ok', ...info });
  });
  return router;
}
