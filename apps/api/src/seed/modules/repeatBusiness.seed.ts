/**
 * Repeat business for the 6 existing customers: bulk historical orders that
 * have already been shipped, fulfilled and invoiced, so the Orders,
 * Fulfillment and Invoices screens carry real volume instead of the 3
 * hand-tuned hero orders (ORD-1041/1032/1036) alone.
 *
 * Every order here is a completed, single-warehouse shipment out of Main
 * Warehouse — like ORD-1041 and ORD-1036 already are — so, exactly like
 * those two, it never touches `Stock`. Only the live Zenith backorder
 * scenario in `fulfillment.seed.ts` reserves real warehouse stock.
 */
import {
  FulfillmentStatus,
  InvoiceStatus,
  InvoiceType,
  OrderStatus,
  PaymentMethod,
  QuoteStage,
  invoiceableOneTimeLines,
  sumMoney,
} from '@dealflow/shared';
import { Fulfillment, Invoice, Order, Quotation } from '../../db/models.js';
import { G, IDS, fid } from '../ids.js';
import { CUSTOMERS, P, REPS } from '../catalog.js';
import { buildQuotation } from '../build.js';
import type { SeedContext } from '../context.js';

const PRODUCTS = [P.laptop, P.dock, P.mouse, P.warranty, P.setup];

/** How many repeat-business orders to manufacture. */
const REPEAT_ORDER_COUNT = 60;

export async function seedRepeatBusiness(ctx: SeedContext): Promise<void> {
  const quotations: any[] = [];
  const orders: any[] = [];
  const fulfillments: any[] = [];
  const invoices: any[] = [];

  for (let i = 0; i < REPEAT_ORDER_COUNT; i++) {
    const cust = CUSTOMERS[i % CUSTOMERS.length];
    const rep = REPS[i % REPS.length];
    const monthsBack = 1 + (i % 12);
    const occurredAt = ctx.monthsAhead(-monthsBack);

    const qty = 1 + (i % 8);
    // Always comfortably inside every tier/category ceiling (lowest is
    // Bronze at 5%), so none of these need a fabricated Approval record —
    // same as the existing named CONFIRMED orders (Q-1033, Q-1036, ...).
    const discountPct = i % 5;
    const primary = PRODUCTS[i % PRODUCTS.length];
    const secondary = PRODUCTS[(i + 1) % PRODUCTS.length];

    const orderId = fid(G.ORDER, 2000 + i);
    const quotationNumber = `Q-${3000 + i}`;

    const built = buildQuotation({
      _id: fid(G.QUOTATION, 3000 + i),
      number: quotationNumber,
      customerId: cust.id, customerName: cust.name, tier: cust.tier,
      priceListId: cust.pl, priceList: cust.rule,
      ownerId: rep.id, ownerName: rep.name,
      stage: QuoteStage.CONFIRMED,
      lines:
        i % 4 === 0
          ? [{ product: primary, qty, discountPct }]
          : [
              { product: primary, qty, discountPct },
              { product: secondary, qty: 1, discountPct: 0 },
            ],
      createdAt: occurredAt,
      submittedAt: occurredAt,
      lastActivityAt: occurredAt,
      validUntil: ctx.daysAgo(monthsBack * 5),
      orderId,
    });
    quotations.push(built.doc);

    const orderLinesInput = built.doc.lines.map((l: any) => ({
      lineId: l.lineId, productId: String(l.productId), description: l.productName,
      qty: l.qty, qtyShipped: l.qty, qtyInvoiced: 0,
      unitPrice: l.unitPrice, discountPct: l.discountPct, taxPct: l.taxPct,
      isSubscription: l.isSubscription,
    }));
    const oneTime = invoiceableOneTimeLines(orderLinesInput);
    const subtotal = sumMoney(oneTime.map((l) => l.net));
    const tax = sumMoney(oneTime.map((l) => l.tax));
    const total = subtotal + tax;
    const isPaid = i % 5 !== 4; // 4 of every 5 are fully paid

    orders.push({
      _id: orderId, number: `ORD-${2000 + i}`,
      quotationId: built.doc._id, quotationNumber,
      customerId: cust.id, customerName: cust.name, ownerId: rep.id,
      currency: 'USD', status: isPaid ? OrderStatus.PAID : OrderStatus.INVOICED,
      lines: built.doc.lines.map((l: any) => ({
        lineId: l.lineId, productId: l.productId, productName: l.productName, category: l.category,
        qty: l.qty, qtyShipped: l.qty, qtyInvoiced: l.qty,
        unitPrice: l.unitPrice, discountPct: l.discountPct, taxPct: l.taxPct,
        lineNet: l.lineNet, lineTax: l.lineTax, lineTotal: l.lineTotal,
        isSubscription: l.isSubscription, recurringCycle: l.recurringCycle,
      })),
      totals: built.doc.totals,
      confirmedAt: occurredAt,
      fulfillmentId: fid(G.FULFILLMENT, 2000 + i),
      createdAt: occurredAt, updatedAt: occurredAt,
    });

    const totalQty = built.doc.lines.reduce((a: number, l: any) => a + l.qty, 0);
    fulfillments.push({
      _id: fid(G.FULFILLMENT, 2000 + i), orderId, orderNumber: `ORD-${2000 + i}`,
      customerId: cust.id, customerName: cust.name,
      status: FulfillmentStatus.SHIPPED,
      allocations: [
        {
          warehouseId: IDS.warehouses.main, warehouseName: 'Main Warehouse',
          lines: built.doc.lines.map((l: any) => ({ lineId: l.lineId, productId: l.productId, productName: l.productName, qty: l.qty })),
          qty: totalQty, estShipments: 1, estCost: 2000 + totalQty * 100, shipped: true, shippedAt: occurredAt,
        },
      ],
      backorders: [], totalShipments: 1, totalCost: 2000 + totalQty * 100,
      rationale: ['Main Warehouse could cover every line in full, so a single shipment was used.'],
      reserved: true, overridden: false,
      createdAt: occurredAt, updatedAt: occurredAt,
    });

    invoices.push({
      _id: fid(G.INVOICE, 2000 + i), number: `INV-${2000 + i}`, type: InvoiceType.ONE_TIME,
      customerId: cust.id, customerName: cust.name,
      orderId, orderNumber: `ORD-${2000 + i}`,
      currency: 'USD', status: isPaid ? InvoiceStatus.PAID : InvoiceStatus.ISSUED,
      lines: oneTime,
      subtotal, taxTotal: tax, total,
      amountPaid: isPaid ? total : 0, amountDue: isPaid ? 0 : total,
      issueDate: occurredAt, dueDate: ctx.daysAgo(Math.max(0, monthsBack * 30 - 15)),
      payments: isPaid
        ? [{ amount: total, method: i % 2 === 0 ? PaymentMethod.CARD : PaymentMethod.BANK_TRANSFER, reference: `REF-${2000 + i}`, receivedAt: occurredAt, recordedById: IDS.users.iyer, recordedByName: 'K. Iyer' }]
        : [],
      createdAt: occurredAt, updatedAt: occurredAt,
    });
  }

  await Quotation.insertMany(quotations);
  await Order.insertMany(orders);
  await Fulfillment.insertMany(fulfillments);
  await Invoice.insertMany(invoices);
}
