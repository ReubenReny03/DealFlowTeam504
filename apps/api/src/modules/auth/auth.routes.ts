import { Router } from 'express';
import { z } from 'zod';
import { AuditEntity } from '@dealflow/shared';
import { env } from '../../config/env.js';
import { User } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { unauthenticated } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { DEMO_ACCOUNTS } from '../../seed/users.seed.js';
import { writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { changePassword, login, toUserDto } from './auth.service.js';

export const authRouter = Router();

mountModuleHealth(authRouter, {
  module: 'auth', owner: 'A', screens: [1],
  implemented: ['POST /login', 'POST /change-password', 'GET /me', 'GET /demo-accounts'],
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

/*
 * There is deliberately no POST /signup.
 *
 * Anyone could otherwise mint themselves an ADMIN account, or a CUSTOMER account
 * pointed at a company they have nothing to do with, from an unauthenticated
 * endpoint. Accounts are created by an Admin on /admin/users, which is audited
 * and where the company link is validated. See docs/DECISIONS.md D-034.
 */

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Your current password is required.'),
  newPassword: z.string().min(6, 'A password must be at least 6 characters.'),
});

/**
 * Offered right after a first sign-in, and usable at any time after that.
 * Anyone signed in may change their OWN password; there is no id in the path,
 * so this endpoint cannot be pointed at somebody else's account.
 */
authRouter.post(
  '/change-password',
  requireAuth(),
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
    const user = await changePassword(req.user!.id, currentPassword, newPassword);

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'PASSWORD_CHANGED',
      entity: AuditEntity.USER,
      entityId: req.user!.id,
      entityLabel: req.user!.name,
      reason: 'Account holder set their own password',
    });

    ok(res, user);
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
