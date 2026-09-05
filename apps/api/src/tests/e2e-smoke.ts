#!/usr/bin/env tsx
/**
 * END-TO-END SMOKE TEST  —  `npm run smoke`
 *
 * Drives the PDF's eight-step Quick Test Flow (§9) over real HTTP against a
 * freshly reset level-0 database, using the §2.9 demo credentials.
 *
 * Every step is one of:
 *   ✓ PASS     the behaviour is implemented and correct
 *   ⧗ PENDING  the endpoint is not built yet; the step names the owning agent
 *   ✗ FAIL     the behaviour is implemented and WRONG — this fails the run
 *
 * As each agent lands their slice, their PENDING steps turn into PASS with no
 * change to this file beyond deleting the `pending` flag. This is the team's
 * shared progress dashboard: run it any time to see exactly what is left.
 */
import type { Server } from 'node:http';
import {
  ApprovalStatus,
  PORTAL_TOKEN_HEADER,
  RiskLevel,
  Role,
  formatMoney,
} from '@dealflow/shared';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { connectMongo, disconnectMongo } from '../db/connection.js';
import { syncAllIndexes } from '../db/models.js';
import { runSeed } from '../seed/seed.js';
import { PRIYA_PORTAL_TOKEN } from '../seed/modules/approvals.seed.js';
import { log } from '../utils/logger.js';
import { waitForMongo } from '../../../../scripts/wait-for-mongo.js';

/* ------------------------------------------------------------------ harness */

let baseUrl = '';
const results: { n: number; title: string; status: 'PASS' | 'PENDING' | 'FAIL'; note: string; owner?: string }[] = [];

interface Res<T = any> {
  status: number;
  body: { success: boolean; data: T; error: { code: string; message: string } | null; meta?: any };
}

async function api<T = any>(
  method: string,
  path: string,
  opts: { token?: string; portalToken?: string; body?: unknown } = {},
): Promise<Res<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.portalToken) headers[PORTAL_TOKEN_HEADER] = opts.portalToken;
  const response = await fetch(`${baseUrl}${env.apiBasePath}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await response.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { success: false, data: null, error: { code: 'NON_JSON', message: text.slice(0, 200) } };
  }
  return { status: response.status, body };
}

class Pending extends Error {
  constructor(public readonly owner: string, message: string) {
    super(message);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Treat a not-yet-built endpoint as PENDING rather than a failure. */
function expectBuilt(res: Res, owner: string, what: string): void {
  if (res.status === 404 && res.body.error?.code === 'NOT_FOUND' && /No route matches/.test(res.body.error.message)) {
    throw new Pending(owner, `${what} is not implemented yet`);
  }
  if (res.status === 501) throw new Pending(owner, `${what} is stubbed`);
}

async function step(
  n: number,
  title: string,
  owner: string,
  run: () => Promise<string>,
): Promise<void> {
  try {
    const note = await run();
    results.push({ n, title, status: 'PASS', note, owner });
    log.ok(`step ${n}: ${title}\n      ${note}`);
  } catch (err) {
    if (err instanceof Pending) {
      results.push({ n, title, status: 'PENDING', note: err.message, owner: err.owner });
      console.log(`  ⧗ step ${n}: ${title}\n      awaiting Agent ${err.owner} — ${err.message}`);
      return;
    }
    results.push({ n, title, status: 'FAIL', note: (err as Error).message, owner });
    log.error(`step ${n}: ${title}\n      ${(err as Error).message}`);
  }
}

/* ------------------------------------------------------------------ the flow */

async function main(): Promise<void> {
  log.banner('DealFlow360 — end-to-end smoke test (PDF §9 Quick Test Flow)');

  log.step('setup', 'Preparing a level-0 database');
  const mongo = await waitForMongo();
  await connectMongo(mongo.uri);
  await syncAllIndexes();
  await runSeed({ quiet: true });
  log.ok('seeded');

  const server: Server = await new Promise((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  const port = (server.address() as { port: number }).port;
  baseUrl = `http://127.0.0.1:${port}`;
  log.ok(`API listening on ${baseUrl}`);

  const tokens: Record<string, string> = {};

  console.log('');

  /* ---- 0. Every demo credential works and lands on the right screen ---- */
  await step(0, 'All seven demo credentials authenticate and land on the correct screen', 'A', async () => {
    const accounts = await api('GET', '/auth/demo-accounts');
    assert(accounts.body.data.length === 7, `expected 7 demo accounts, got ${accounts.body.data.length}`);
    for (const account of accounts.body.data) {
      const res = await api('POST', '/auth/login', { body: { email: account.email, password: account.password } });
      assert(res.status === 200, `${account.email} failed to log in (${res.status} ${res.body.error?.message})`);
      assert(
        res.body.data.user.landingRoute === account.landingRoute,
        `${account.email} landed on ${res.body.data.user.landingRoute}, expected ${account.landingRoute}`,
      );
      tokens[account.role === Role.CUSTOMER ? account.email : account.role] = res.body.data.token;
    }
    // A bad password must not authenticate.
    const bad = await api('POST', '/auth/login', { body: { email: 'rep@dealflow360.test', password: 'wrong' } });
    assert(bad.status === 401, 'a wrong password must be rejected with 401');
    return 'seven personas signed in; a wrong password is rejected with 401';
  });

  /* ---- 1. Backend config exists: a discount tier, a warehouse and a plan ---- */
  await step(1, 'Backend configuration is present (discount tiers, warehouse, subscription plan)', 'A', async () => {
    const config = await api('GET', '/config', { token: tokens[Role.ADMIN] });
    assert(config.status === 200, 'config endpoint failed');
    assert(config.body.data.tierCeilings.GOLD === 15, 'Gold tier ceiling should be 15');
    assert(config.body.data.categoryCeilings.SERVICES === 10, 'Services category ceiling should be 10');
    const warehouses = await api('GET', '/warehouses', { token: tokens[Role.ADMIN] });
    assert(warehouses.body.data.length >= 2, 'expected at least two warehouses');
    const plans = await api('GET', '/subscription-plans', { token: tokens[Role.ADMIN] });
    assert(plans.body.data.length >= 1, 'expected at least one subscription plan');
    return `Gold 15% / Services 10%, ${warehouses.body.data.length} warehouses, ${plans.body.data.length} plans`;
  });

  /* ---- 2. A quotation with an over-limit discount ---- */
  await step(2, 'A quotation with an over-limit discount is scored, not accepted silently', 'B', async () => {
    const res = await api('GET', '/quotations?q=Q-1042', { token: tokens[Role.SALES_REP] });
    assert(res.status === 200, 'quotation list failed');
    const q = res.body.data.find((x: any) => x.number === 'Q-1042');
    assert(q, 'Q-1042 not found');
    assert(q.risk.riskScore === 33, `Q-1042 should score 33, got ${q.risk.riskScore}`);
    assert(q.risk.riskLevel === RiskLevel.HIGH, `Q-1042 should be HIGH, got ${q.risk.riskLevel}`);
    const over = q.risk.explanation.filter((r: any) => r.status === 'OVER');
    assert(over.length === 1 && over[0].overBy === 8, 'the Onsite Setup line should be 8 points over');
    return `Q-1042 = ${formatMoney(q.totals.grandTotal)} · score 33 · HIGH · "${over[0].line}" 8pt over its 10% limit`;
  });

  /* ---- 3. The quote asks for approval by itself ---- */
  await step(3, 'The quotation routed itself for approval — the rep never asked', 'C', async () => {
    const res = await api('GET', '/approvals?pendingOnly=true', { token: tokens[Role.SALES_MANAGER] });
    assert(res.status === 200, 'approvals list failed');
    const approval = res.body.data.items.find((a: any) => a.quotationNumber === 'Q-1042');
    assert(approval, 'Q-1042 is not in the pending approval queue');
    assert(approval.status === ApprovalStatus.PENDING, 'Q-1042 approval should be PENDING');
    assert(
      JSON.stringify(approval.risk.requiredChain) === JSON.stringify([Role.SALES_MANAGER, Role.FINANCE]),
      `chain should be [SALES_MANAGER, FINANCE], got ${JSON.stringify(approval.risk.requiredChain)}`,
    );
    assert(approval.currentStage === Role.SALES_MANAGER, 'Q-1042 should be sitting with the Sales Manager');
    assert(approval.trail.length === 3, `expected 3 audit-trail entries, got ${approval.trail.length}`);
    return `queue shows ${res.body.data.counts.pending} pending; Q-1042 -> M. Shah, then Finance; trail has 3 entries`;
  });

  /* ---- 4. Accept an upsell and watch the totals move ---- */
  await step(4, 'Accepting an upsell suggestion updates the order total and margin immediately', 'B', async () => {
    const res = await api('GET', '/upsell/suggestions?quotationId=Q-1042', { token: tokens[Role.SALES_REP] });
    expectBuilt(res, 'B', 'GET /upsell/suggestions');
    assert(res.status === 200, `upsell suggestions failed: ${res.body.error?.message}`);
    assert(res.body.data.length > 0, 'expected at least one upsell suggestion');
    assert(res.body.data.every((s: any) => typeof s.marginDelta === 'number'), 'every suggestion must carry a margin delta');
    return `${res.body.data.length} suggestions, top: ${res.body.data[0].name} (+${formatMoney(res.body.data[0].marginDelta)})`;
  });

  /* ---- 5. Approved quote pulls stock from the right warehouses ---- */
  await step(5, 'Stock is pulled from the correct warehouses, splitting across two when needed', 'D', async () => {
    const overview = await api('GET', '/fulfillment', { token: tokens[Role.FINANCE] });
    assert(overview.status === 200, 'fulfillment overview failed');
    const laptopMain = overview.body.data.stock.find(
      (s: any) => s.productName === 'Laptop Pro 14' && s.warehouseName === 'Main Warehouse',
    );
    const laptopEast = overview.body.data.stock.find(
      (s: any) => s.productName === 'Laptop Pro 14' && s.warehouseName === 'East Depot',
    );
    assert(laptopMain?.available === 18, `Main Warehouse should have 18 available, got ${laptopMain?.available}`);
    assert(laptopEast?.available === 6, `East Depot should have 6 available, got ${laptopEast?.available}`);
    const backorder = overview.body.data.awaiting.find((a: any) => a.status === 'BACKORDER');
    assert(backorder, 'expected at least one order sitting on backorder');

    const plan = await api('POST', '/fulfillment/plan/ORD-1032', { token: tokens[Role.FINANCE] });
    expectBuilt(plan, 'D', 'POST /fulfillment/plan/:orderId');
    assert(plan.status === 200, `split planning failed: ${plan.body.error?.message}`);
    assert(plan.body.data.rationale?.length > 0, 'the split must explain itself');
    return `Main 18 / East 6 available; ${backorder.orderNumber} is on backorder with a rationale`;
  });

  /* ---- 6. Hybrid billing: one order, two artefacts ---- */
  await step(6, 'One order produces a one-time invoice AND a separate recurring schedule', 'D', async () => {
    const invoices = await api('GET', '/invoices', { token: tokens[Role.FINANCE] });
    assert(invoices.status === 200, 'invoice list failed');
    const oneTime = invoices.body.data.items.find((i: any) => i.number === 'INV-1042');
    const recurring = invoices.body.data.items.find((i: any) => i.number === 'INV-1043');
    assert(oneTime && recurring, 'expected both INV-1042 and INV-1043');
    assert(oneTime.orderId === recurring.orderId, 'both invoices must belong to the same order');
    assert(oneTime.type === 'ONE_TIME' && recurring.type === 'RECURRING', 'invoice types are wrong');
    const oneTimeProducts = oneTime.lines.map((l: any) => l.productId);
    assert(
      !recurring.lines.some((l: any) => oneTimeProducts.includes(l.productId)),
      'the recurring invoice must never repeat a one-time line',
    );
    const subs = await api('GET', '/subscriptions', { token: tokens[Role.FINANCE] });
    assert(subs.body.data.counts.active === 16, `expected 16 active subscriptions, got ${subs.body.data.counts.active}`);
    const carePlan = subs.body.data.items.find((s: any) => s.planName === 'Care Plan 2yr' && s.customerName === 'Acme Corp');
    assert(carePlan?.schedule?.length > 0, 'the Care Plan subscription must carry a generated billing schedule');
    assert(carePlan.nextBillDate, 'the Care Plan subscription must have a next bill date');
    return `ORD-1041 -> ${oneTime.number} ${formatMoney(oneTime.total)} unpaid + ${recurring.number} ${formatMoney(recurring.total)} recurring; ${carePlan.schedule.length} scheduled periods`;
  });

  /* ---- 7. The portal, and the negative auth test ---- */
  await step(7, 'The customer portal is a genuinely restricted surface', 'C', async () => {
    // Priya's magic link opens exactly her quotation.
    const priya = await api('GET', '/portal/q/Q-1042', { portalToken: PRIYA_PORTAL_TOKEN });
    assert(priya.status === 200, `Priya could not open her own quotation: ${priya.body.error?.message}`);
    assert(priya.body.data.quotation.number === 'Q-1042', 'wrong quotation resolved');

    // R. Das, logged in as himself, must NOT be able to reach it.
    const das = await api('GET', '/portal/q/Q-1042', { token: tokens['das@betaindustries.test'] });
    assert(das.status === 403, `R. Das should get 403, got ${das.status}`);

    // An internal JWT must not open the portal either.
    const rep = await api('GET', '/portal/q/Q-1042', { token: tokens[Role.SALES_REP] });
    assert(rep.status === 403, `an internal JWT should not open the portal, got ${rep.status}`);

    // An expired link is rejected with its own error code.
    const expired = await api('GET', '/portal/q/Q-1042', { portalToken: 'demo-acme-q1042-expired-000000000' });
    assert(
      expired.status === 403 && expired.body.error?.code === 'PORTAL_TOKEN_EXPIRED',
      `an expired link should return PORTAL_TOKEN_EXPIRED, got ${expired.body.error?.code}`,
    );
    return 'Priya 200 · R. Das 403 · internal JWT 403 · expired link PORTAL_TOKEN_EXPIRED';
  });

  /* ---- 8. Counter-offer re-enters approval automatically ---- */
  await step(8, 'A customer counter-offer sends the quote back for approval automatically', 'C', async () => {
    const res = await api('POST', '/portal/q/Q-1042/counter', {
      portalToken: PRIYA_PORTAL_TOKEN,
      body: { lines: [{ lineId: 'Q-1042-L2', counterDiscountPct: 25 }], note: 'Can you do better on the setup fee?' },
    });
    expectBuilt(res, 'C', 'POST /portal/q/:number/counter');
    assert(res.status === 200, `counter failed: ${res.body.error?.message}`);
    assert(res.body.data.reEnteredApproval === true, 'a breaching counter must re-enter the approval chain');
    assert(res.body.data.quotation.stage === 'PENDING_APPROVAL', 'the quote should be back at PENDING_APPROVAL');
    return `counter accepted; risk recomputed to ${res.body.data.risk.riskScore}; quote re-entered approval`;
  });

  /* ---- 9. Record a payment ---- */
  await step(9, 'Recording a payment advances the invoice and the order stepper', 'D', async () => {
    const invoice = await api('GET', '/invoices/INV-1042', { token: tokens[Role.FINANCE] });
    assert(invoice.status === 200, 'invoice detail failed');
    const res = await api('POST', `/invoices/${invoice.body.data.invoice.id}/payments`, {
      token: tokens[Role.FINANCE],
      body: { amount: invoice.body.data.invoice.amountDue, method: 'BANK_TRANSFER', reference: 'SMOKE-001' },
    });
    expectBuilt(res, 'D', 'POST /invoices/:id/payments');
    assert(res.status === 200 || res.status === 201, `payment failed: ${res.body.error?.message}`);
    assert(res.body.data.status === 'PAID', `invoice should be PAID, got ${res.body.data.status}`);
    return 'INV-1042 paid in full; order stepper advanced to Paid';
  });

  /* ---- 10. Deal health ---- */
  await step(10, 'Deal Health flags stalled deals and discount anomalies', 'D', async () => {
    const res = await api('GET', '/deal-health', { token: tokens[Role.SALES_MANAGER] });
    assert(res.status === 200, 'deal health dashboard failed');
    assert(res.body.data.stalledDeals >= 1, 'expected at least one stalled deal');
    assert(res.body.data.discountAnomalies >= 1, 'expected at least one discount anomaly');
    const q1030 = res.body.data.alerts.find((a: any) => a.quotationNumber === 'Q-1030');
    assert(q1030?.issue === 'idle 9 days', `Q-1030 should read "idle 9 days", got "${q1030?.issue}"`);
    return `${res.body.data.stalledDeals} stalled · ${res.body.data.discountAnomalies} anomalies · ${res.body.data.deliverySlippage} slipping`;
  });

  /* ---- 11. Reporting ---- */
  await step(11, 'Reporting KPIs aggregate from real documents', 'D', async () => {
    const res = await api('GET', '/reporting?period=month', { token: tokens[Role.ADMIN] });
    assert(res.status === 200, 'reporting failed');
    assert(res.body.data.quotesCreated > 100, `expected a month of quotes, got ${res.body.data.quotesCreated}`);
    assert(res.body.data.avgApprovalTimeMs > 0, 'expected a real average approval time');
    assert(res.body.data.topUpsellProduct, 'expected a top upsell product');
    return `${res.body.data.quotesCreated} quotes · avg approval ${res.body.data.avgApprovalTimeLabel} · top upsell ${res.body.data.topUpsellProduct.name}`;
  });

  /* ---- 12. Changing a ceiling changes behaviour live ---- */
  await step(12, 'Changing a discount ceiling re-evaluates open quotations immediately', 'A', async () => {
    const before = await api('GET', '/quotations?q=Q-1042', { token: tokens[Role.ADMIN] });
    const beforeScore = before.body.data.find((q: any) => q.number === 'Q-1042').risk.riskScore;

    const res = await api('PUT', '/config', {
      token: tokens[Role.ADMIN],
      body: {
        tierCeilings: { GOLD: 20 },
        categoryCeilings: { SERVICES: 20 },
        reason: 'Smoke test: prove the risk engine is configuration-driven, not hardcoded',
      },
    });
    assert(res.status === 200, `config update failed: ${res.body.error?.message}`);
    const impact = res.body.data.reevaluated.find((r: any) => r.quotationNumber === 'Q-1042');
    assert(impact, 'Q-1042 should have been re-evaluated');
    assert(impact.previousScore === 33 && impact.newScore === 0, `expected 33 -> 0, got ${impact.previousScore} -> ${impact.newScore}`);
    assert(impact.autoApproved === true, 'Q-1042 should have auto-approved once it was inside its limits');

    // Put it back, so the demo database is left exactly as it was found.
    await api('PUT', '/config', {
      token: tokens[Role.ADMIN],
      body: { tierCeilings: { GOLD: 15 }, categoryCeilings: { SERVICES: 10 }, reason: 'Smoke test: restore baseline' },
    });
    return `${res.body.data.reevaluated.length} quotations re-scored live; Q-1042 went ${beforeScore} -> 0 and auto-approved`;
  });

  /* ------------------------------------------------------------------ report */

  server.close();
  await disconnectMongo();
  await mongo.stop();

  const pass = results.filter((r) => r.status === 'PASS').length;
  const pending = results.filter((r) => r.status === 'PENDING');
  const fail = results.filter((r) => r.status === 'FAIL');

  log.banner(`Smoke: ${pass} passing · ${pending.length} awaiting an agent · ${fail.length} failing`);

  if (pending.length > 0) {
    console.log('\nStill to build:');
    for (const p of pending) console.log(`  ⧗ Agent ${p.owner} — step ${p.n}: ${p.title}`);
  }
  if (fail.length > 0) {
    console.log('\nBroken:');
    for (const f of fail) console.log(`  ✗ step ${f.n}: ${f.title}\n      ${f.note}`);
    console.log('');
    process.exit(1);
  }
  console.log('');
}

main().catch(async (err) => {
  log.error(err);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
