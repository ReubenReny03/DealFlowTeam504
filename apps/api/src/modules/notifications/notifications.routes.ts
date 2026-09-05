/**
 * Screen 2 / 14 — the notification centre.
 *
 * Every nudge, escalation and system notice a user receives lands here. The
 * list is always scoped to the signed-in user — a notification is a private
 * message, never a shared feed — and carries an `unreadCount` so the header
 * bell can render its badge without a second request.
 */
import { Router } from 'express';
import type { NotificationListDto } from '@dealflow/shared';
import { Notification } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { forbidden, notFound } from '../../utils/apiError.js';
import { ok, paginate } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { mountModuleHealth } from '../module.health.js';

export const notificationsRouter = Router();

mountModuleHealth(notificationsRouter, {
  module: 'notifications',
  owner: 'C',
  screens: [2, 14],
  implemented: [
    'GET / (scoped, paginated, unreadCount)',
    'GET /:id',
    'PATCH /:id/read',
    'POST /read-all',
  ],
  todo: [],
});

/** The bell's data source. Own notifications only, newest first, paginated. */
notificationsRouter.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 20)));
    const filter: Record<string, unknown> = { userId: req.user!.id };
    if (req.query.read === 'true' || req.query.read === 'false')
      filter.read = req.query.read === 'true';

    const [items, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: req.user!.id, read: false }),
    ]);

    const payload: NotificationListDto = { items: toDtoList(items), unreadCount };
    ok(res, payload, paginate([], page, pageSize, total));
  }),
);

notificationsRouter.get(
  '/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const doc: any = await Notification.findById(req.params.id).lean();
    if (!doc) throw notFound(`No notification with id ${req.params.id}`);
    if (String(doc.userId) !== String(req.user!.id))
      throw forbidden('This notification does not belong to you.');
    ok(res, toDto(doc));
  }),
);

notificationsRouter.patch(
  '/:id/read',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const doc: any = await Notification.findById(req.params.id);
    if (!doc) throw notFound(`No notification with id ${req.params.id}`);
    if (String(doc.userId) !== String(req.user!.id))
      throw forbidden('This notification does not belong to you.');
    doc.read = true;
    await doc.save();
    ok(res, toDto(doc));
  }),
);

/** "Mark all read" — clears the badge in one call. Read-state is not a business event, so no audit entry (matches PATCH /:id/read). */
notificationsRouter.post(
  '/read-all',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const result = await Notification.updateMany(
      { userId: req.user!.id, read: false },
      { $set: { read: true } },
    );
    ok(res, { updated: result.modifiedCount ?? 0 });
  }),
);
