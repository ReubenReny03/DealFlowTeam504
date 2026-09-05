import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ALL_ROLES, AuditEntity, INTERNAL_ROLES, Role, type UserListDto } from '@dealflow/shared';
import { env } from '../../config/env.js';
import { Customer, User } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, conflict, notFound } from '../../utils/apiError.js';
import { listParams, pageMeta, searchFilter, stableSort } from '../../utils/listQuery.js';
import { created, ok } from '../../utils/respond.js';
import { diff, writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { toUserDto } from '../auth/auth.service.js';

export const usersRouter = Router();

mountModuleHealth(usersRouter, {
  module: 'users', owner: 'A', screens: [1, 19],
  implemented: ['GET /', 'GET /:id', 'POST / (internal or customer account)', 'PATCH /:id (deactivate or edit)'],
  todo: [],
});

/**
 * Screen 19 — the Admin Users tab. This is the ONLY way an account comes into
 * existence: there is no public signup, because a self-service endpoint lets
 * anyone mint an ADMIN, or attach themselves to a company they have nothing to
 * do with. A CUSTOMER account is a portal login and is scoped to exactly one
 * company for its whole life, so `customerId` is required for that role and
 * refused for every other one.
 */
const createUserSchema = z
  .object({
    name: z.string().trim().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(ALL_ROLES as [Role, ...Role[]]),
    customerId: z.string().trim().min(1).optional(),
    active: z.boolean().default(true),
    // The password on a new account was typed by somebody else, so by default the
    // holder is asked to pick their own at first sign-in.
    mustChangePassword: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.role === Role.CUSTOMER && !value.customerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customerId'],
        message: 'A customer account must be linked to a company.',
      });
    }
    if (value.role !== Role.CUSTOMER && value.customerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customerId'],
        message: `A ${value.role} account is internal and is not linked to a company.`,
      });
    }
  });

/** Resolve and vet the company a portal account is being attached to. */
async function resolveCustomer(customerId: string): Promise<any> {
  const customer: any = await Customer.findById(customerId).lean();
  if (!customer) throw notFound(`No customer with id ${customerId}`);
  if (customer.active === false) {
    throw badRequest(`${customer.name} is not an active customer, so it cannot take a new portal login.`);
  }
  return customer;
}

usersRouter.post(
  '/',
  requireAuth([Role.ADMIN]),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createUserSchema>;
    const email = body.email.toLowerCase().trim();
    if (await User.exists({ email })) throw conflict(`An account with email ${email} already exists.`);

    const customer = body.customerId ? await resolveCustomer(body.customerId) : null;

    const passwordHash = await bcrypt.hash(body.password, env.bcryptRounds);
    const doc = await User.create({
      name: body.name,
      email,
      passwordHash,
      role: body.role,
      customerId: customer?._id,
      active: body.active,
      mustChangePassword: body.mustChangePassword,
    });

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'USER_CREATED',
      entity: AuditEntity.USER,
      entityId: String(doc._id),
      entityLabel: doc.name,
      after: { role: doc.role, ...(customer ? { customer: customer.name } : {}) },
      reason: customer
        ? `New portal login for ${customer.name}`
        : `New ${body.role} account added`,
    });

    created(res, toUserDto(doc));
  }),
);

/**
 * A role change stays on its own side of the internal/portal line. Turning a rep
 * into a portal login (or the reverse) is not a role edit — it changes what the
 * account IS, and would strand the quotations, approvals and audit entries that
 * already name them. Moving a portal login to a different company is allowed,
 * because a contact really does change employer.
 */
const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(INTERNAL_ROLES as [Role, ...Role[]]).optional(),
  customerId: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
  /**
   * Admin password reset. Deliberately does NOT ask for the current password —
   * an Admin resetting a forgotten one does not have it. The account is then
   * asked to choose its own at the next sign-in, which is why the flag comes back
   * on unless the caller explicitly says otherwise.
   */
  password: z.string().min(6).optional(),
  mustChangePassword: z.boolean().optional(),
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
    // Losing the last active Admin locks everyone out of this very screen.
    if ((body.active === false || (body.role && body.role !== Role.ADMIN)) && doc.role === Role.ADMIN) {
      const otherAdmins = await User.countDocuments({
        _id: { $ne: doc._id },
        role: Role.ADMIN,
        active: true,
      });
      if (otherAdmins === 0) throw badRequest('This is the last active Admin. Promote another one first.');
    }
    if (body.role && doc.role === Role.CUSTOMER) {
      throw badRequest('A portal login cannot be turned into an internal user. Create a new account instead.');
    }
    if (body.customerId && doc.role !== Role.CUSTOMER) {
      throw badRequest('Only a portal login belongs to a company.');
    }

    if (body.email && body.email.toLowerCase().trim() !== doc.email) {
      const email = body.email.toLowerCase().trim();
      if (await User.exists({ _id: { $ne: doc._id }, email })) {
        throw conflict(`An account with email ${email} already exists.`);
      }
      doc.email = email;
    }

    const before = toUserDto(doc);
    if (body.name !== undefined) doc.name = body.name;
    if (body.role !== undefined) doc.role = body.role;
    if (body.customerId !== undefined) doc.customerId = (await resolveCustomer(body.customerId))._id;
    if (body.active !== undefined) doc.active = body.active;
    if (body.password !== undefined) {
      doc.passwordHash = await bcrypt.hash(body.password, env.bcryptRounds);
      // A reset password is one somebody else typed, so ask them to replace it.
      doc.mustChangePassword = body.mustChangePassword ?? true;
    } else if (body.mustChangePassword !== undefined) {
      doc.mustChangePassword = body.mustChangePassword;
    }
    await doc.save();
    const after = toUserDto(doc);

    const changed = diff(before as any, after as any, [
      'name', 'email', 'role', 'customerId', 'active', 'mustChangePassword',
    ]);
    // The password itself is never in `changed` — only the fact that it was reset.
    const passwordReset = body.password !== undefined;
    if (changed.changed || passwordReset) {
      await writeAudit({
        actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
        action: passwordReset
          ? 'USER_PASSWORD_RESET'
          : body.active === false
            ? 'USER_DEACTIVATED'
            : 'USER_UPDATED',
        entity: AuditEntity.USER,
        entityId: String(doc._id),
        entityLabel: doc.name,
        before: changed.before,
        after: changed.after,
        reason: passwordReset
          ? 'Password reset by an Admin; the holder must choose a new one'
          : body.active === false
            ? 'Account deactivated'
            : 'User details changed',
      });
    }

    ok(res, after);
  }),
);

/* ------------------------------------------------------------------ reads */

/**
 * NOT `mountReadonly`: that serialises the raw document, and a User document
 * carries `passwordHash`. Every read here goes through `toUserDto`, which strips
 * it and adds the role's landing route, and the projection means the hash never
 * leaves Mongo in the first place.
 *
 * The list also resolves each portal account's company name, so the screen can
 * show who a login belongs to without a second request per row.
 */
const PUBLIC_FIELDS = '-passwordHash';

usersRouter.get(
  '/',
  requireAuth([Role.ADMIN]),
  asyncHandler(async (req, res) => {
    const params = listParams(req.query);
    const filter: Record<string, unknown> = {};
    for (const field of ['role', 'customerId']) {
      const value = (req.query as Record<string, unknown>)[field];
      if (value !== undefined && value !== '') filter[field] = value;
    }
    if (req.query.active === 'true' || req.query.active === 'false') {
      filter.active = req.query.active === 'true';
    }
    Object.assign(filter, searchFilter(params.q, ['name', 'email']) ?? {});

    const [items, total, customers] = await Promise.all([
      User.find(filter)
        .select(PUBLIC_FIELDS)
        .sort(stableSort({ name: 1 }))
        .skip(params.skip)
        .limit(params.pageSize)
        .lean(),
      User.countDocuments(filter),
      Customer.find().select('name').lean(),
    ]);
    const customerName = new Map((customers as any[]).map((c) => [String(c._id), c.name]));

    const payload: UserListDto = {
      items: (items as any[]).map((user) => ({
        ...toUserDto(user),
        customerName: user.customerId ? (customerName.get(String(user.customerId)) ?? '') : undefined,
      })),
    };
    ok(res, payload, pageMeta(params, total));
  }),
);

usersRouter.get(
  '/:id',
  requireAuth([Role.ADMIN]),
  asyncHandler(async (req, res) => {
    const doc = await User.findById(req.params.id).select(PUBLIC_FIELDS).lean();
    if (!doc) throw notFound(`No user with id ${req.params.id}`);
    ok(res, toUserDto(doc));
  }),
);
