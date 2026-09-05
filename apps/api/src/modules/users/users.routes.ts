import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AuditEntity, INTERNAL_ROLES, Role } from '@dealflow/shared';
import { env } from '../../config/env.js';
import { User } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, conflict, notFound } from '../../utils/apiError.js';
import { created, ok } from '../../utils/respond.js';
import { diff, writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';
import { toUserDto } from '../auth/auth.service.js';

export const usersRouter = Router();

mountModuleHealth(usersRouter, {
  module: 'users', owner: 'A', screens: [1],
  implemented: ['GET /', 'GET /:id', 'POST / (create internal user)', 'PATCH /:id (deactivate or edit)'],
  todo: [],
});

// Portal (customer) accounts are created via /auth/signup, tied to a customerId.
// This module only manages the internal roster.
const createUserSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(INTERNAL_ROLES as [Role, ...Role[]]),
  active: z.boolean().default(true),
});

usersRouter.post(
  '/',
  requireAuth([Role.ADMIN]),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createUserSchema>;
    const email = body.email.toLowerCase().trim();
    if (await User.exists({ email })) throw conflict(`An account with email ${email} already exists.`);

    const passwordHash = await bcrypt.hash(body.password, env.bcryptRounds);
    const doc = await User.create({ name: body.name, email, passwordHash, role: body.role, active: body.active });

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'USER_CREATED',
      entity: AuditEntity.USER,
      entityId: String(doc._id),
      entityLabel: doc.name,
      after: { role: doc.role },
      reason: `New ${body.role} account added`,
    });

    created(res, toUserDto(doc));
  }),
);

const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  role: z.enum(INTERNAL_ROLES as [Role, ...Role[]]).optional(),
  active: z.boolean().optional(),
});

usersRouter.patch(
  '/:id',
  requireAuth([Role.ADMIN]),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const doc = await User.findById(req.params.id);
    if (!doc) throw notFound(`No user with id ${req.params.id}`);

    const body = req.body as z.infer<typeof updateUserSchema>;
    if (body.active === false && String(doc._id) === req.user!.id) {
      throw badRequest('You cannot deactivate your own account.');
    }

    const before = toUserDto(doc);
    if (body.name !== undefined) doc.name = body.name;
    if (body.role !== undefined) doc.role = body.role;
    if (body.active !== undefined) doc.active = body.active;
    await doc.save();
    const after = toUserDto(doc);

    const changed = diff(before as any, after as any, ['name', 'role', 'active']);
    if (changed.changed) {
      await writeAudit({
        actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
        action: body.active === false ? 'USER_DEACTIVATED' : 'USER_UPDATED',
        entity: AuditEntity.USER,
        entityId: String(doc._id),
        entityLabel: doc.name,
        before: changed.before,
        after: changed.after,
        reason: body.active === false ? 'Account deactivated' : 'User details changed',
      });
    }

    ok(res, after);
  }),
);

mountReadonly(usersRouter, {
  model: User,
  roles: ['ADMIN'] as any,
  searchFields: ['name','email'],
  filterFields: ['role'],
});
