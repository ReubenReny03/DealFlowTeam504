import { Router } from 'express';
import { z } from 'zod';
import { ALL_ROLES, Role } from '@dealflow/shared';
import { env } from '../../config/env.js';
import { User } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { unauthenticated } from '../../utils/apiError.js';
import { created, ok } from '../../utils/respond.js';
import { DEMO_ACCOUNTS } from '../../seed/users.seed.js';
import { mountModuleHealth } from '../module.health.js';
import { login, signup, toUserDto } from './auth.service.js';

export const authRouter = Router();

mountModuleHealth(authRouter, {
  module: 'auth', owner: 'A', screens: [1],
  implemented: ['POST /login', 'POST /signup', 'GET /me', 'GET /demo-accounts'],
  todo: ['password reset (out of scope — see docs/FEATURE_PRIORITY.md P3)'],
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    ok(res, await login(req.body.email, req.body.password));
  }),
);

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(ALL_ROLES as [Role, ...Role[]]),
  customerId: z.string().optional(),
  team: z.string().optional(),
});

authRouter.post(
  '/signup',
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    created(res, await signup(req.body));
  }),
);

authRouter.get(
  '/me',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id);
    if (!user || !user.active) throw unauthenticated();
    ok(res, toUserDto(user));
  }),
);

/**
 * Powers the login screen's one-click "Log in as…" panel.
 * Guarded by SHOW_DEMO_LOGINS so a production build never exposes it.
 */
authRouter.get(
  '/demo-accounts',
  asyncHandler(async (_req, res) => {
    if (!env.showDemoLogins) {
      ok(res, []);
      return;
    }
    ok(
      res,
      DEMO_ACCOUNTS.map(({ label, name, email, password, role, landingRoute, description }) => ({
        label, name, email, password, role, landingRoute, description,
      })),
    );
  }),
);
