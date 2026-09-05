/** Screens 12 and 13. */
import { Router } from 'express';
import { z } from 'zod';
import {
  AuditEntity,
  InvoiceStatus,
  InvoiceType,
  OrderStatus,
  PaymentMethod,
  Role,
  addDays,
  invoiceableOneTimeLines,
  type InvoiceListDto,
  type RecordPaymentRequest,
} from '@dealflow/shared';
import { Invoice, Order, nextSeq } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, invalidState, notFound } from '../../utils/apiError.js';
import { listParams, pageMeta, searchFilter, stableSort } from '../../utils/listQuery.js';
import { ok } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { writeAudit } from '../../utils/audit.js';
import { toCsv } from '../../utils/csv.js';
import { mountModuleHealth } from '../module.health.js';
import { loadConfig } from '../config/config.service.js';

export const invoicesRouter = Router();

mountModuleHealth(invoicesRouter, {
  module: 'invoices',
  domain: 'billing',
  screens: [12, 13],
  implemented: [
    'GET / (with unpaid/paid chips)',
    'GET /:id (with the order stepper)',
    'POST /:id/payments',
    'POST /generate/:orderId',
    'GET /:id/summary.csv',
  ],
  todo: [],
});

const FINANCE_VIEW: Role[] = [Role.ADMIN, Role.FINANCE, Role.SALES_MANAGER, Role.SALES_REP];

invoicesRouter.get(
  '/',
  requireAuth(FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const params = listParams(req.query);
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.customerId) filter.customerId = req.query.customerId;
    Object.assign(
      filter,
      searchFilter(params.q, ['number', 'customerName', 'orderNumber']) ?? {},
    );
    const [items, total, unpaid, paid, overdue] = await Promise.all([
      Invoice.find(filter)
        .sort(stableSort({ issueDate: -1 }))
        .skip(params.skip)
        .limit(params.pageSize)
        .lean(),
      Invoice.countDocuments(filter),
      Invoice.countDocuments({
        status: { $in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] },
      }),
      Invoice.countDocuments({ status: InvoiceStatus.PAID }),
      Invoice.countDocuments({ status: InvoiceStatus.OVERDUE }),
    ]);
    const payload: InvoiceListDto = { counts: { unpaid, paid, overdue }, items: toDtoList(items) };
    ok(res, payload, pageMeta(params, total));
  }),
);

invoicesRouter.get(
  '/:id',
  requireAuth(FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const invoice: any = await Invoice.findOne({
      $or: [
        { number: req.params.id },
        ...(req.params.id.match(/^[0-9a-f]{24}$/i) ? [{ _id: req.params.id }] : []),
      ],
    }).lean();
    if (!invoice) throw notFound(`No invoice ${req.params.id}`);
    const [order, related] = await Promise.all([
      invoice.orderId ? Order.findById(invoice.orderId).lean() : null,
      Invoice.find({ orderId: invoice.orderId }).sort({ issueDate: 1 }).lean(),
    ]);
    // Screen 13 shows the one-time and the recurring invoice for the same order
    // side by side — the proof that one order produced two billing artefacts.
    ok(res, {
      invoice: toDto(invoice),
      order: order ? toDto(order) : null,
      relatedInvoices: toDtoList(related),
    });
  }),
);

invoicesRouter.get(
  '/:id/summary.csv',
  requireAuth(FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const invoice: any = await Invoice.findOne({
      $or: [
        { number: req.params.id },
        ...(req.params.id.match(/^[0-9a-f]{24}$/i) ? [{ _id: req.params.id }] : []),
      ],
    }).lean();
    if (!invoice) throw notFound(`No invoice ${req.params.id}`);

    const rows: unknown[][] = [
      ['Invoice', invoice.number],
      ['Customer', invoice.customerName],
      ['Type', invoice.type],
      ['Status', invoice.status],
      ['Issue Date', new Date(invoice.issueDate).toISOString().slice(0, 10)],
      ['Due Date', new Date(invoice.dueDate).toISOString().slice(0, 10)],
      [],
      ['Description', 'Qty', 'Unit Price', 'Discount %', 'Net', 'Tax', 'Total'],
      ...invoice.lines.map((l: any) => [
        l.description,
        l.qty,
        l.unitPrice,
        l.discountPct,
        l.net,
        l.tax,
        l.total,
      ]),
      [],
      ['Subtotal', invoice.subtotal],
      ['Tax Total', invoice.taxTotal],
      ['Total', invoice.total],
      ['Amount Paid', invoice.amountPaid],
      ['Amount Due', invoice.amountDue],
    ];
    const csv = toCsv([`Invoice ${invoice.number} summary`], rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.number}-summary.csv"`);
    res.send(csv);
  }),
);

/* ------------------------------------------------------------------ writes */

const WRITE: Role[] = [Role.ADMIN, Role.FINANCE, Role.SALES_MANAGER];

/** Bill min(qtyShipped, qty) - qtyInvoiced for the order's one-time lines. Never bills the recurring lines. */
invoicesRouter.post(
  '/generate/:orderId',
  requireAuth(WRITE),
  asyncHandler(async (req, res) => {
    const order: any = await Order.findOne({
      $or: [
        ...(req.params.orderId.match(/^[0-9a-f]{24}$/i) ? [{ _id: req.params.orderId }] : []),
        { number: req.params.orderId },
      ],
    });
    if (!order) throw notFound(`No order ${req.params.orderId}`);

    const billable = invoiceableOneTimeLines(
      (order.lines as any[]).map((l) => ({
        lineId: l.lineId,
        productId: String(l.productId),
        description: l.productName,
        qty: l.qty,
        qtyShipped: l.qtyShipped,
        qtyInvoiced: l.qtyInvoiced,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        taxPct: l.taxPct,
        isSubscription: l.isSubscription,
      })),
    );
    if (billable.length === 0) {
      return ok(res, {
        invoice: null,
        message: 'Nothing new to invoice — every shipped unit has already been billed.',
      });
    }

    const config = await loadConfig();
    const dueDays: number = config.billing?.invoiceDueDays ?? 15;
    const subtotal = billable.reduce((a, l) => a + l.net, 0);
    const taxTotal = billable.reduce((a, l) => a + l.tax, 0);
    const now = new Date();

    const invoice = await Invoice.create({
      number: `INV-${await nextSeq('invoice', 2000)}`,
      type: InvoiceType.ONE_TIME,
      customerId: order.customerId,
      customerName: order.customerName,
      orderId: order._id,
      orderNumber: order.number,
      currency: order.currency,
      status: InvoiceStatus.ISSUED,
      lines: billable,
      subtotal,
      taxTotal,
      total: subtotal + taxTotal,
      amountPaid: 0,
      amountDue: subtotal + taxTotal,
      issueDate: now,
      dueDate: addDays(now, dueDays),
      payments: [],
    });

    for (const l of billable) {
      const orderLine = (order.lines as any[]).find((x) => x.lineId === l.lineId);
      if (orderLine) orderLine.qtyInvoiced += l.qty;
    }
    if (order.status === OrderStatus.SHIPPED) order.status = OrderStatus.INVOICED;
    await order.save();

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'INVOICE_GENERATED',
      entity: AuditEntity.INVOICE,
      entityId: String(invoice._id),
      entityLabel: invoice.number,
      after: { orderNumber: order.number, total: invoice.total },
      reason: `Invoice raised for the shipped quantity of ${order.number}`,
    });

    return ok(
      res,
      {
        invoice: toDto(invoice),
        message: `${invoice.number} raised for ${billable.length} line(s).`,
      },
      undefined,
      201,
    );
  }),
);

const paymentSchema = z.object({
  amount: z.number().int().positive(),
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().trim().optional(),
  receivedAt: z.string().optional(),
});

/** Advances the invoice (and, for a one-time invoice, the order stepper) toward Paid. */
invoicesRouter.post(
  '/:id/payments',
  requireAuth(WRITE),
  validate(paymentSchema),
  asyncHandler(async (req, res) => {
    const invoice: any = await Invoice.findOne({
      $or: [
        { number: req.params.id },
        ...(req.params.id.match(/^[0-9a-f]{24}$/i) ? [{ _id: req.params.id }] : []),
      ],
    });
    if (!invoice) throw notFound(`No invoice ${req.params.id}`);
    if (invoice.status === InvoiceStatus.VOID)
      throw invalidState('This invoice is void and cannot take a payment.');

    const body = req.body as RecordPaymentRequest;
    if (body.amount > invoice.amountDue) {
      throw badRequest(
        `Payment of ${body.amount} exceeds the outstanding balance of ${invoice.amountDue}.`,
      );
    }

    invoice.payments.push({
      amount: body.amount,
      method: body.method,
      reference: body.reference,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
      recordedById: req.user!.id,
      recordedByName: req.user!.name,
    });
    invoice.amountPaid += body.amount;
    invoice.amountDue = invoice.total - invoice.amountPaid;
    invoice.status = invoice.amountDue <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
    await invoice.save();

    if (
      invoice.type === InvoiceType.ONE_TIME &&
      invoice.status === InvoiceStatus.PAID &&
      invoice.orderId
    ) {
      await Order.updateOne(
        { _id: invoice.orderId, status: { $ne: OrderStatus.PAID } },
        { $set: { status: OrderStatus.PAID } },
      );
    }

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'PAYMENT_RECORDED',
      entity: AuditEntity.PAYMENT,
      entityId: String(invoice._id),
      entityLabel: invoice.number,
      after: { amount: body.amount, method: body.method, status: invoice.status },
      reason: body.reference ? `Payment received, ref ${body.reference}` : 'Payment received',
    });

    ok(res, toDto(invoice));
  }),
);
