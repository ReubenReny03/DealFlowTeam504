/** Screens 12 and 13. */
import { Router } from 'express';
import { InvoiceStatus, Role, type InvoiceListDto } from '@dealflow/shared';
import { Invoice, Order } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { mountModuleHealth } from '../module.health.js';

export const invoicesRouter = Router();

mountModuleHealth(invoicesRouter, {
  module: 'invoices', owner: 'D', screens: [12, 13],
  implemented: ['GET / (with unpaid/paid chips)', 'GET /:id (with the order stepper)'],
  todo: [
    'POST /:id/payments — record a payment, advance DRAFT->ISSUED->PARTIALLY_PAID->PAID and the order stepper (Agent D)',
    'POST /generate/:orderId — raise an invoice for the SHIPPED quantity only (Agent D)',
    'GET /:id/summary.csv — Download Summary (Agent D, CSV stub first)',
  ],
});

const FINANCE_VIEW: Role[] = [Role.ADMIN, Role.FINANCE, Role.SALES_MANAGER, Role.SALES_REP];

invoicesRouter.get(
  '/',
  requireAuth(FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.customerId) filter.customerId = req.query.customerId;
    const [items, unpaid, paid, overdue] = await Promise.all([
      Invoice.find(filter).sort({ issueDate: -1 }).limit(200).lean(),
      Invoice.countDocuments({ status: { $in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] } }),
      Invoice.countDocuments({ status: InvoiceStatus.PAID }),
      Invoice.countDocuments({ status: InvoiceStatus.OVERDUE }),
    ]);
    const payload: InvoiceListDto = { counts: { unpaid, paid, overdue }, items: toDtoList(items) };
    ok(res, payload);
  }),
);

invoicesRouter.get(
  '/:id',
  requireAuth(FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const invoice: any = await Invoice.findOne({
      $or: [{ number: req.params.id }, ...(req.params.id.match(/^[0-9a-f]{24}$/i) ? [{ _id: req.params.id }] : [])],
    }).lean();
    if (!invoice) throw notFound(`No invoice ${req.params.id}`);
    const [order, related] = await Promise.all([
      invoice.orderId ? Order.findById(invoice.orderId).lean() : null,
      Invoice.find({ orderId: invoice.orderId }).sort({ issueDate: 1 }).lean(),
    ]);
    // Screen 13 shows the one-time and the recurring invoice for the same order
    // side by side — the proof that one order produced two billing artefacts.
    ok(res, { invoice: toDto(invoice), order: order ? toDto(order) : null, relatedInvoices: toDtoList(related) });
  }),
);
