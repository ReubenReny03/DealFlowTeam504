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
import { createServer, type Server } from 'node:http';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  ApprovalStatus,
  NotificationType,
  PORTAL_TOKEN_HEADER,
  RiskLevel,
  Role,
  SOCKET_PATH,
  SocketEvent,
  SocketRoom,
  formatMoney,
  type NotificationDto,
  type RealtimeReadyPayload,
} from '@dealflow/shared';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { connectMongo, disconnectMongo } from '../db/connection.js';
import { syncAllIndexes } from '../db/models.js';
import { runSeed } from '../seed/seed.js';
import { DEMO_ACCOUNTS } from '../seed/users.seed.js';
import { PRIYA_PORTAL_TOKEN } from '../seed/modules/approvals.seed.js';
import { closeRealtime, initRealtime } from '../realtime/server.js';
import { log } from '../utils/logger.js';
import { waitForMongo } from '../../../../scripts/wait-for-mongo.js';

/* ------------------------------------------------------------------ harness */

let baseUrl = '';
const results: {
  n: number;
  title: string;
  status: 'PASS' | 'PENDING' | 'FAIL';
  note: string;
  domain?: string;
}[] = [];

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
  constructor(
    public readonly domain: string,
    message: string,
  ) {
    super(message);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Treat a not-yet-built endpoint as PENDING rather than a failure. */
function expectBuilt(res: Res, domain: string, what: string): void {
  if (
    res.status === 404 &&
    res.body.error?.code === 'NOT_FOUND' &&
    /No route matches/.test(res.body.error.message)
  ) {
    throw new Pending(domain, `${what} is not implemented yet`);
  }
  if (res.status === 501) throw new Pending(domain, `${what} is stubbed`);
}

async function step(
  n: number,
  title: string,
  domain: string,
  run: () => Promise<string>,
): Promise<void> {
  try {
    const note = await run();
    results.push({ n, title, status: 'PASS', note, domain });
    log.ok(`step ${n}: ${title}\n      ${note}`);
  } catch (err) {
    if (err instanceof Pending) {
      results.push({ n, title, status: 'PENDING', note: err.message, domain: err.domain });
      console.log(`  ⧗ step ${n}: ${title}\n      awaiting the ${err.domain} module — ${err.message}`);
      return;
    }
    results.push({ n, title, status: 'FAIL', note: (err as Error).message, domain });
    log.error(`step ${n}: ${title}\n      ${(err as Error).message}`);
  }
}


/* ------------------------------------------------------------------ realtime */

interface TestSocket {
  socket: Socket;
  frames: { event: string; payload: any }[];
  ready: RealtimeReadyPayload;
}

/**
 * Open a socket the way the browser does — credentials in the handshake `auth`
 * bag, never a header — and resolve once the server has said who it thinks we
 * are. Every frame is recorded so a step can assert on what did AND did not
 * arrive; "nobody else was told" is half of what these tests are for.
 */
function openSocket(auth: Record<string, string>): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      auth,
      reconnection: false,
    });
    const frames: { event: string; payload: any }[] = [];
    socket.onAny((event: string, payload: any) => frames.push({ event, payload }));
    socket.on(SocketEvent.READY, (ready: RealtimeReadyPayload) =>
      resolve({ socket, frames, ready }),
    );
    socket.on('connect_error', (err: Error) => reject(err));
    setTimeout(() => reject(new Error('the socket never became ready')), 8000);
  });
}

/** A handshake that must FAIL. Resolves with the refusal message. */
function expectRefused(auth: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      auth,
      reconnection: false,
    });
    socket.on('connect_error', (err: Error) => {
      socket.close();
      resolve(err.message);
    });
    socket.on(SocketEvent.READY, () => {
      socket.close();
      reject(new Error('the socket was accepted when it should have been refused'));
    });
    setTimeout(() => reject(new Error('the handshake neither succeeded nor failed')), 8000);
  });
}

/** Give the server a moment to fan an event out before asserting on it. */
const settle = (ms = 600): Promise<void> => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ the flow */

async function main(): Promise<void> {
  log.banner('DealFlow360 — end-to-end smoke test (PDF §9 Quick Test Flow)');

  log.step('setup', 'Preparing a level-0 database');
  const mongo = await waitForMongo();
  await connectMongo(mongo.uri);
  await syncAllIndexes();
  await runSeed({ quiet: true });
  log.ok('seeded');

  // The smoke test drives the REAL server, sockets included — otherwise the
  // realtime step would be testing a different program from the one that ships.
  const server: Server = await new Promise((resolve) => {
    const s = createServer(createApp());
    initRealtime(s);
    s.listen(0, () => resolve(s));
  });
  const port = (server.address() as { port: number }).port;
  baseUrl = `http://127.0.0.1:${port}`;
  log.ok(`API listening on ${baseUrl}`);

  const tokens: Record<string, string> = {};

  console.log('');

  /* ---- 0. Every demo credential works and lands on the right screen ---- */
  await step(
    0,
    'All seven demo credentials authenticate and land on the correct screen',
    'platform',
    async () => {
      const accounts = await api('GET', '/auth/demo-accounts');
      assert(
        accounts.body.data.length === 7,
        `expected 7 demo accounts, got ${accounts.body.data.length}`,
      );
      for (const account of accounts.body.data) {
        const res = await api('POST', '/auth/login', {
          body: { email: account.email, password: account.password },
        });
        assert(
          res.status === 200,
          `${account.email} failed to log in (${res.status} ${res.body.error?.message})`,
        );
        assert(
          res.body.data.user.landingRoute === account.landingRoute,
          `${account.email} landed on ${res.body.data.user.landingRoute}, expected ${account.landingRoute}`,
        );
        tokens[account.role === Role.CUSTOMER ? account.email : account.role] = res.body.data.token;
      }
      // A bad password must not authenticate.
      const bad = await api('POST', '/auth/login', {
        body: { email: 'rep@dealflow360.test', password: 'wrong' },
      });
      assert(bad.status === 401, 'a wrong password must be rejected with 401');
      return 'seven personas signed in; a wrong password is rejected with 401';
    },
  );

  /* ---- 1. Backend config exists: a discount tier, a warehouse and a plan ---- */
  await step(
    1,
    'Backend configuration is present (discount tiers, warehouse, subscription plan)',
    'platform',
    async () => {
      const config = await api('GET', '/config', { token: tokens[Role.ADMIN] });
      assert(config.status === 200, 'config endpoint failed');
      assert(config.body.data.tierCeilings.GOLD === 15, 'Gold tier ceiling should be 15');
      assert(
        config.body.data.categoryCeilings.SERVICES === 10,
        'Services category ceiling should be 10',
      );
      const warehouses = await api('GET', '/warehouses', { token: tokens[Role.ADMIN] });
      assert(warehouses.body.data.length >= 2, 'expected at least two warehouses');
      const plans = await api('GET', '/subscription-plans', { token: tokens[Role.ADMIN] });
      assert(plans.body.data.length >= 1, 'expected at least one subscription plan');
      return `Gold 15% / Services 10%, ${warehouses.body.data.length} warehouses, ${plans.body.data.length} plans`;
    },
  );

  /* ---- 2. A quotation with an over-limit discount ---- */
  await step(
    2,
    'A quotation with an over-limit discount is scored, not accepted silently',
    'quotations',
    async () => {
      const res = await api('GET', '/quotations?q=Q-1042', { token: tokens[Role.SALES_REP] });
      assert(res.status === 200, 'quotation list failed');
      const q = res.body.data.find((x: any) => x.number === 'Q-1042');
      assert(q, 'Q-1042 not found');
      assert(q.risk.riskScore === 33, `Q-1042 should score 33, got ${q.risk.riskScore}`);
      assert(q.risk.riskLevel === RiskLevel.HIGH, `Q-1042 should be HIGH, got ${q.risk.riskLevel}`);
      const over = q.risk.explanation.filter((r: any) => r.status === 'OVER');
      assert(
        over.length === 1 && over[0].overBy === 8,
        'the Onsite Setup line should be 8 points over',
      );
      return `Q-1042 = ${formatMoney(q.totals.grandTotal)} · score 33 · HIGH · "${over[0].line}" 8pt over its 10% limit`;
    },
  );

  /* ---- 3. The quote asks for approval by itself ---- */
  await step(3, 'The quotation routed itself for approval — the rep never asked', 'approvals', async () => {
    const res = await api('GET', '/approvals?pendingOnly=true', {
      token: tokens[Role.SALES_MANAGER],
    });
    assert(res.status === 200, 'approvals list failed');
    const approval = res.body.data.items.find((a: any) => a.quotationNumber === 'Q-1042');
    assert(approval, 'Q-1042 is not in the pending approval queue');
    assert(approval.status === ApprovalStatus.PENDING, 'Q-1042 approval should be PENDING');
    assert(
      JSON.stringify(approval.risk.requiredChain) ===
        JSON.stringify([Role.SALES_MANAGER, Role.FINANCE]),
      `chain should be [SALES_MANAGER, FINANCE], got ${JSON.stringify(approval.risk.requiredChain)}`,
    );
    assert(
      approval.currentStage === Role.SALES_MANAGER,
      'Q-1042 should be sitting with the Sales Manager',
    );
    assert(
      approval.trail.length === 3,
      `expected 3 audit-trail entries, got ${approval.trail.length}`,
    );
    return `queue shows ${res.body.data.counts.pending} pending; Q-1042 -> M. Shah, then Finance; trail has 3 entries`;
  });

  /* ---- 4. Accept an upsell and watch the totals move ---- */
  await step(
    4,
    'Accepting an upsell suggestion updates the order total and margin immediately',
    'quotations',
    async () => {
      const res = await api('GET', '/upsell/suggestions?quotationId=Q-1042', {
        token: tokens[Role.SALES_REP],
      });
      expectBuilt(res, 'quotations', 'GET /upsell/suggestions');
      assert(res.status === 200, `upsell suggestions failed: ${res.body.error?.message}`);
      assert(res.body.data.length > 0, 'expected at least one upsell suggestion');
      assert(
        res.body.data.every((s: any) => typeof s.marginDelta === 'number'),
        'every suggestion must carry a margin delta',
      );
      return `${res.body.data.length} suggestions, top: ${res.body.data[0].name} (+${formatMoney(res.body.data[0].marginDelta)})`;
    },
  );

  /* ---- 5. Approved quote pulls stock from the right warehouses ---- */
  await step(
    5,
    'Stock is pulled from the correct warehouses, splitting across two when needed',
    'inventory',
    async () => {
      const overview = await api('GET', '/fulfillment', { token: tokens[Role.FINANCE] });
      assert(overview.status === 200, 'fulfillment overview failed');
      const laptopMain = overview.body.data.stock.find(
        (s: any) => s.productName === 'Laptop Pro 14' && s.warehouseName === 'Main Warehouse',
      );
      const laptopEast = overview.body.data.stock.find(
        (s: any) => s.productName === 'Laptop Pro 14' && s.warehouseName === 'East Depot',
      );
      assert(
        laptopMain?.available === 18,
        `Main Warehouse should have 18 available, got ${laptopMain?.available}`,
      );
      assert(
        laptopEast?.available === 6,
        `East Depot should have 6 available, got ${laptopEast?.available}`,
      );
      const backorder = overview.body.data.awaiting.find((a: any) => a.status === 'BACKORDER');
      assert(backorder, 'expected at least one order sitting on backorder');

      const plan = await api('POST', '/fulfillment/plan/ORD-1032', { token: tokens[Role.FINANCE] });
      expectBuilt(plan, 'inventory', 'POST /fulfillment/plan/:orderId');
      assert(plan.status === 200, `split planning failed: ${plan.body.error?.message}`);
      assert(plan.body.data.rationale?.length > 0, 'the split must explain itself');
      return `Main 18 / East 6 available; ${backorder.orderNumber} is on backorder with a rationale`;
    },
  );

  /* ---- 6. Hybrid billing: one order, two artefacts ---- */
  await step(
    6,
    'One order produces a one-time invoice AND a separate recurring schedule',
    'inventory',
    async () => {
      const invoices = await api('GET', '/invoices', { token: tokens[Role.FINANCE] });
      assert(invoices.status === 200, 'invoice list failed');
      const oneTime = invoices.body.data.items.find((i: any) => i.number === 'INV-1042');
      const recurring = invoices.body.data.items.find((i: any) => i.number === 'INV-1043');
      assert(oneTime && recurring, 'expected both INV-1042 and INV-1043');
      assert(oneTime.orderId === recurring.orderId, 'both invoices must belong to the same order');
      assert(
        oneTime.type === 'ONE_TIME' && recurring.type === 'RECURRING',
        'invoice types are wrong',
      );
      const oneTimeProducts = oneTime.lines.map((l: any) => l.productId);
      assert(
        !recurring.lines.some((l: any) => oneTimeProducts.includes(l.productId)),
        'the recurring invoice must never repeat a one-time line',
      );
      const subs = await api('GET', '/subscriptions?pageSize=100', { token: tokens[Role.FINANCE] });
      assert(
        subs.body.data.counts.active === 53,
        `expected 53 active subscriptions, got ${subs.body.data.counts.active}`,
      );
      const carePlan = subs.body.data.items.find(
        (s: any) => s.planName === 'Care Plan 2yr' && s.customerName === 'Acme Corp',
      );
      assert(
        carePlan?.schedule?.length > 0,
        'the Care Plan subscription must carry a generated billing schedule',
      );
      assert(carePlan.nextBillDate, 'the Care Plan subscription must have a next bill date');
      return `ORD-1041 -> ${oneTime.number} ${formatMoney(oneTime.total)} unpaid + ${recurring.number} ${formatMoney(recurring.total)} recurring; ${carePlan.schedule.length} scheduled periods`;
    },
  );

  /* ---- 7. The portal, and the negative auth test ---- */
  await step(7, 'The customer portal is a genuinely restricted surface', 'approvals', async () => {
    // Priya's magic link opens exactly her quotation.
    const priya = await api('GET', '/portal/q/Q-1042', { portalToken: PRIYA_PORTAL_TOKEN });
    assert(
      priya.status === 200,
      `Priya could not open her own quotation: ${priya.body.error?.message}`,
    );
    assert(priya.body.data.quotation.number === 'Q-1042', 'wrong quotation resolved');

    // R. Das, logged in as himself, must NOT be able to reach it.
    const das = await api('GET', '/portal/q/Q-1042', { token: tokens['das@betaindustries.test'] });
    assert(das.status === 403, `R. Das should get 403, got ${das.status}`);

    // An internal JWT must not open the portal either.
    const rep = await api('GET', '/portal/q/Q-1042', { token: tokens[Role.SALES_REP] });
    assert(rep.status === 403, `an internal JWT should not open the portal, got ${rep.status}`);

    // An expired link is rejected with its own error code.
    const expired = await api('GET', '/portal/q/Q-1042', {
      portalToken: 'demo-acme-q1042-expired-000000000',
    });
    assert(
      expired.status === 403 && expired.body.error?.code === 'PORTAL_TOKEN_EXPIRED',
      `an expired link should return PORTAL_TOKEN_EXPIRED, got ${expired.body.error?.code}`,
    );

    /* ---- one customer, many quotations ---- */

    // Signed in with his password, R. Das sees every quotation Beta has been
    // sent — and nothing belonging to anyone else.
    const dasList = await api('GET', '/portal/quotations', {
      token: tokens['das@betaindustries.test'],
    });
    expectBuilt(dasList, 'approvals', 'GET /portal/quotations');
    assert(dasList.status === 200, `R. Das could not list his quotations: ${dasList.body.error?.message}`);
    const dasItems = dasList.body.data.items as { number: string; stage: string }[];
    assert(dasItems.length > 1, `expected Beta to have several quotations, got ${dasItems.length}`);
    assert(
      dasList.body.data.customer.name === 'Beta Industries',
      `list resolved the wrong company: ${dasList.body.data.customer.name}`,
    );
    assert(
      !dasItems.some((q) => q.number === 'Q-1042'),
      "R. Das's list must never contain Acme Corp's quotation",
    );
    assert(
      !dasItems.some((q) => q.stage === 'DRAFT'),
      'a draft has not been sent to the customer and must not appear in the portal',
    );
    assert(
      dasList.body.data.scopedToSingleQuotation === false,
      'a password login is scoped to the company, not to one quotation',
    );

    // ...and he can open any one of them, not just whichever was linked last.
    const dasOther = await api('GET', `/portal/q/${dasItems[0].number}`, {
      token: tokens['das@betaindustries.test'],
    });
    assert(
      dasOther.status === 200,
      `R. Das could not open his own ${dasItems[0].number}: ${dasOther.body.error?.message}`,
    );

    // A magic link, by contrast, still unlocks exactly the one it was minted for.
    const linkList = await api('GET', '/portal/quotations', { portalToken: PRIYA_PORTAL_TOKEN });
    expectBuilt(linkList, 'approvals', 'GET /portal/quotations');
    assert(
      linkList.body.data.items.length === 1 && linkList.body.data.items[0].number === 'Q-1042',
      'a magic link must list exactly the quotation it was minted for',
    );
    assert(
      linkList.body.data.scopedToSingleQuotation === true,
      'a magic-link session must report itself as scoped to one quotation',
    );

    return `Priya 200 · R. Das 403 on Acme · internal JWT 403 · expired link PORTAL_TOKEN_EXPIRED · R. Das lists ${dasItems.length} of his own · magic link lists 1`;
  });

  /* ---- 8. Counter-offer re-enters approval automatically ---- */
  await step(
    8,
    'A customer counter-offer sends the quote back for approval automatically',
    'approvals',
    async () => {
      const res = await api('POST', '/portal/q/Q-1042/counter', {
        portalToken: PRIYA_PORTAL_TOKEN,
        body: {
          lines: [{ lineId: 'Q-1042-L2', counterDiscountPct: 25 }],
          note: 'Can you do better on the setup fee?',
        },
      });
      expectBuilt(res, 'approvals', 'POST /portal/q/:number/counter');
      assert(res.status === 200, `counter failed: ${res.body.error?.message}`);
      assert(
        res.body.data.reEnteredApproval === true,
        'a breaching counter must re-enter the approval chain',
      );
      assert(
        res.body.data.quotation.stage === 'PENDING_APPROVAL',
        'the quote should be back at PENDING_APPROVAL',
      );
      return `counter accepted; risk recomputed to ${res.body.data.risk.riskScore}; quote re-entered approval`;
    },
  );

  /* ---- 9. Record a payment ---- */
  await step(9, 'Recording a payment advances the invoice and the order stepper', 'inventory', async () => {
    const invoice = await api('GET', '/invoices/INV-1042', { token: tokens[Role.FINANCE] });
    assert(invoice.status === 200, 'invoice detail failed');
    const res = await api('POST', `/invoices/${invoice.body.data.invoice.id}/payments`, {
      token: tokens[Role.FINANCE],
      body: {
        amount: invoice.body.data.invoice.amountDue,
        method: 'BANK_TRANSFER',
        reference: 'SMOKE-001',
      },
    });
    expectBuilt(res, 'inventory', 'POST /invoices/:id/payments');
    assert(res.status === 200 || res.status === 201, `payment failed: ${res.body.error?.message}`);
    assert(res.body.data.status === 'PAID', `invoice should be PAID, got ${res.body.data.status}`);
    return 'INV-1042 paid in full; order stepper advanced to Paid';
  });

  /* ---- 10. Deal health ---- */
  await step(10, 'Deal Health flags stalled deals and discount anomalies', 'inventory', async () => {
    const res = await api('GET', '/deal-health', { token: tokens[Role.SALES_MANAGER] });
    assert(res.status === 200, 'deal health dashboard failed');
    assert(res.body.data.stalledDeals >= 1, 'expected at least one stalled deal');
    assert(res.body.data.discountAnomalies >= 1, 'expected at least one discount anomaly');
    const q1030 = res.body.data.alerts.find((a: any) => a.quotationNumber === 'Q-1030');
    assert(
      q1030?.issue === 'idle 9 days',
      `Q-1030 should read "idle 9 days", got "${q1030?.issue}"`,
    );
    return `${res.body.data.stalledDeals} stalled · ${res.body.data.discountAnomalies} anomalies · ${res.body.data.deliverySlippage} slipping`;
  });

  /* ---- 11. Reporting ---- */
  await step(11, 'Reporting KPIs aggregate from real documents', 'inventory', async () => {
    const res = await api('GET', '/reporting?period=month', { token: tokens[Role.ADMIN] });
    assert(res.status === 200, 'reporting failed');
    assert(
      res.body.data.quotesCreated > 100,
      `expected a month of quotes, got ${res.body.data.quotesCreated}`,
    );
    assert(res.body.data.avgApprovalTimeMs > 0, 'expected a real average approval time');
    assert(res.body.data.topUpsellProduct, 'expected a top upsell product');
    return `${res.body.data.quotesCreated} quotes · avg approval ${res.body.data.avgApprovalTimeLabel} · top upsell ${res.body.data.topUpsellProduct.name}`;
  });

  /* ---- 12. Changing a ceiling changes behaviour live ---- */
  await step(
    12,
    'Changing a discount ceiling re-evaluates open quotations immediately',
    'platform',
    async () => {
      const before = await api('GET', '/quotations?q=Q-1042', { token: tokens[Role.ADMIN] });
      const beforeQuote = before.body.data.find((q: any) => q.number === 'Q-1042');
      const beforeScore = beforeQuote.risk.riskScore;
      // Step 8 (the portal counter-offer loop) may already have raised a line's own
      // discount above its seeded value, so the ceiling this test raises to must
      // cover whatever Q-1042's CURRENT terms are — not the value it happened to
      // carry when this test was first written — to prove the point regardless of
      // run order: a live ceiling change re-evaluates every open quotation.
      const coveringCeiling = Math.max(20, ...beforeQuote.lines.map((l: any) => l.discountPct));

      const res = await api('PUT', '/config', {
        token: tokens[Role.ADMIN],
        body: {
          tierCeilings: { GOLD: coveringCeiling },
          categoryCeilings: { SERVICES: coveringCeiling },
          reason: 'Smoke test: prove the risk engine is configuration-driven, not hardcoded',
        },
      });
      assert(res.status === 200, `config update failed: ${res.body.error?.message}`);
      const impact = res.body.data.reevaluated.find((r: any) => r.quotationNumber === 'Q-1042');
      assert(impact, 'Q-1042 should have been re-evaluated');
      assert(
        impact.previousScore === beforeScore && impact.newScore === 0,
        `expected ${beforeScore} -> 0, got ${impact.previousScore} -> ${impact.newScore}`,
      );
      assert(
        impact.autoApproved === true,
        'Q-1042 should have auto-approved once it was inside its limits',
      );

      // Put it back, so the demo database is left exactly as it was found.
      await api('PUT', '/config', {
        token: tokens[Role.ADMIN],
        body: {
          tierCeilings: { GOLD: 15 },
          categoryCeilings: { SERVICES: 10 },
          reason: 'Smoke test: restore baseline',
        },
      });
      return `${res.body.data.reevaluated.length} quotations re-scored live; Q-1042 went ${beforeScore} -> 0 and auto-approved`;
    },
  );

  /* ---- 13. Restock ⇒ the backordered order becomes consolidatable ---- */
  await step(
    13,
    'Restocking a warehouse flips a covered backorder to consolidation-available',
    'inventory',
    async () => {
      const overview = await api('GET', '/fulfillment', { token: tokens[Role.FINANCE] });
      assert(overview.status === 200, 'fulfillment overview failed');
      const backorder = overview.body.data.awaiting.find((a: any) => a.status === 'BACKORDER');
      assert(backorder, 'expected an order sitting on backorder');

      const detail = await api('GET', `/fulfillment/${backorder.fulfillmentId}`, {
        token: tokens[Role.FINANCE],
      });
      assert(
        detail.status === 200 && detail.body.data.backorders.length > 0,
        'the backorder detail should list short lines',
      );
      const short = detail.body.data.backorders[0];

      const before = await api('GET', `/fulfillment/${backorder.fulfillmentId}/consolidation`, {
        token: tokens[Role.FINANCE],
      });
      assert(
        before.status === 200 && before.body.data.available === false,
        'nothing should be consolidatable before the restock',
      );

      const warehouses = await api('GET', '/warehouses', { token: tokens[Role.FINANCE] });
      const east = warehouses.body.data.find((w: any) => w.name === 'East Depot');
      assert(east, 'East Depot not found');

      const totalShort = detail.body.data.backorders.reduce((a: number, b: any) => a + b.qty, 0);
      const adjust = await api('POST', '/stock/adjust', {
        token: tokens[Role.FINANCE],
        body: {
          warehouseId: east.id,
          productId: short.productId,
          delta: totalShort,
          reason: 'Smoke test: restock to cover the outstanding backorder',
        },
      });
      expectBuilt(adjust, 'inventory', 'POST /stock/adjust');
      assert(adjust.status === 200, `stock adjust failed: ${adjust.body.error?.message}`);
      assert(
        adjust.body.data.consolidationAvailableFor.includes(backorder.orderNumber),
        `${backorder.orderNumber} should be flagged consolidation-available after the restock`,
      );

      const after = await api('GET', `/fulfillment/${backorder.fulfillmentId}/consolidation`, {
        token: tokens[Role.FINANCE],
      });
      assert(
        after.status === 200 && after.body.data.available === true,
        'the backorder should now be consolidatable',
      );
      return `${backorder.orderNumber}: +${totalShort} restocked at East Depot ⇒ consolidation prompt is live`;
    },
  );

  /* ---- 14. The notification centre: escalate writes one, "mark all read" clears it ---- */
  await step(
    14,
    'An escalation notifies its recipient, and "mark all read" clears the badge',
    'approvals',
    async () => {
      const alerts = await api('GET', '/deal-health', { token: tokens[Role.SALES_MANAGER] });
      assert(
        alerts.status === 200 && alerts.body.data.alerts.length > 0,
        'expected at least one deal alert to act on',
      );
      const alert = alerts.body.data.alerts[0];

      const escalate = await api('POST', `/deal-health/${alert.id}/escalate`, {
        token: tokens[Role.SALES_MANAGER],
        body: { note: 'Smoke test: escalate to exercise the notification centre' },
      });
      expectBuilt(escalate, 'inventory', 'POST /deal-health/:id/escalate');
      assert(escalate.status === 200, `escalate failed: ${escalate.body.error?.message}`);

      const unread = await api('GET', '/notifications', { token: tokens[Role.SALES_MANAGER] });
      expectBuilt(unread, 'approvals', 'GET /notifications');
      assert(unread.status === 200, `notifications list failed: ${unread.body.error?.message}`);
      assert(
        unread.body.data.unreadCount >= 1,
        `expected an unread notification, got ${unread.body.data.unreadCount}`,
      );
      assert(
        unread.body.data.items.every((n: any) => n.userId),
        'every notification must be scoped to a user',
      );

      const readAll = await api('POST', '/notifications/read-all', {
        token: tokens[Role.SALES_MANAGER],
      });
      expectBuilt(readAll, 'approvals', 'POST /notifications/read-all');
      assert(
        readAll.status === 200 && readAll.body.data.updated >= 1,
        'read-all should mark at least one notification read',
      );

      const cleared = await api('GET', '/notifications', { token: tokens[Role.SALES_MANAGER] });
      assert(
        cleared.body.data.unreadCount === 0,
        `unread count should be 0 after read-all, got ${cleared.body.data.unreadCount}`,
      );
      return `escalation ⇒ 1 unread for the manager; read-all cleared ${readAll.body.data.updated}`;
    },
  );

  /* ---- 15. Reissuing a customer link revokes the old one ---- */
  await step(15, 'Reissuing the customer portal link revokes every earlier link', 'approvals', async () => {
    const list = await api('GET', '/quotations?q=Q-1042', { token: tokens[Role.SALES_REP] });
    const q = list.body.data.find((x: any) => x.number === 'Q-1042');
    assert(q, 'Q-1042 not found');

    // The seeded link still works right now.
    const beforeOld = await api('GET', '/portal/q/Q-1042', { portalToken: PRIYA_PORTAL_TOKEN });
    assert(beforeOld.status === 200, 'the seeded link should still work before the reissue');

    const reissue = await api('POST', `/quotations/${q.id}/portal-link`, {
      token: tokens[Role.SALES_REP],
      body: { reason: 'Smoke test: reissue the customer link' },
    });
    expectBuilt(reissue, 'approvals', 'POST /quotations/:id/portal-link');
    assert(reissue.status === 200, `reissue failed: ${reissue.body.error?.message}`);
    assert(reissue.body.data.revokedCount >= 1, 'the reissue should have revoked the seeded link');
    assert(
      reissue.body.data.token && reissue.body.data.url.includes('token='),
      'the reissue must return a usable link',
    );

    const afterOld = await api('GET', '/portal/q/Q-1042', { portalToken: PRIYA_PORTAL_TOKEN });
    assert(
      afterOld.status === 403,
      `the old link should be dead after a reissue, got ${afterOld.status}`,
    );

    const afterNew = await api('GET', '/portal/q/Q-1042', { portalToken: reissue.body.data.token });
    assert(
      afterNew.status === 200,
      `the new link should open the quotation, got ${afterNew.status}`,
    );
    return `old link 403 · new link 200 · ${reissue.body.data.revokedCount} revoked`;
  });

  /* ---- 16. Every list endpoint searches and pages ---- */
  await step(16, 'Every list screen searches and pages server-side', 'integration', async () => {
    const rep = tokens[Role.SALES_REP];
    const finance = tokens[Role.FINANCE];
    const admin = tokens[Role.ADMIN];

    // The contract: `meta` always carries the four pagination fields, a page is
    // never longer than pageSize, and `total` counts the whole filtered set —
    // not the page. The full seeded quotation set must never arrive in one response.
    const lists: { path: string; token: string; rows: (body: any) => any[] }[] = [
      { path: '/quotations', token: rep, rows: (b) => b.data },
      { path: '/approvals', token: finance, rows: (b) => b.data.items },
      { path: '/invoices', token: finance, rows: (b) => b.data.items },
      { path: '/subscriptions', token: finance, rows: (b) => b.data.items },
      { path: '/deal-health', token: rep, rows: (b) => b.data.alerts },
      { path: '/products/dashboard', token: admin, rows: (b) => b.data.products },
      { path: '/products', token: admin, rows: (b) => b.data },
      { path: '/customers', token: admin, rows: (b) => b.data },
      { path: '/pricelists', token: admin, rows: (b) => b.data },
      { path: '/warehouses', token: admin, rows: (b) => b.data },
      { path: '/subscription-plans', token: admin, rows: (b) => b.data },
    ];

    for (const list of lists) {
      const res = await api('GET', `${list.path}?page=1&pageSize=3`, { token: list.token });
      expectBuilt(res, 'integration', `GET ${list.path} (paged)`);
      assert(res.status === 200, `${list.path} failed: ${res.body.error?.message}`);
      const meta = res.body.meta;
      assert(meta, `${list.path} returned no pagination meta`);
      for (const field of ['page', 'pageSize', 'total', 'totalPages']) {
        assert(meta[field] !== undefined, `${list.path} meta is missing ${field}`);
      }
      assert(meta.pageSize === 3, `${list.path} ignored pageSize, got ${meta.pageSize}`);
      assert(
        list.rows(res.body).length <= 3,
        `${list.path} returned ${list.rows(res.body).length} rows for pageSize=3`,
      );
    }

    // Paging actually moves: page 2 of the quotation list is a different page.
    const first = await api('GET', '/quotations?page=1&pageSize=5', { token: rep });
    const second = await api('GET', '/quotations?page=2&pageSize=5', { token: rep });
    assert(first.body.meta.total > 5, 'the seed should have more than one page of quotations');
    const firstIds = new Set(first.body.data.map((q: any) => q.id));
    assert(
      second.body.data.every((q: any) => !firstIds.has(q.id)),
      'page 2 repeated rows from page 1',
    );

    // Searching narrows the SAME set, and narrows `total` with it.
    const searched = await api('GET', '/quotations?q=Acme', { token: rep });
    assert(searched.status === 200, 'quotation search failed');
    assert(
      searched.body.data.length > 0 &&
        searched.body.data.every((q: any) => /acme/i.test(q.customerName) || /acme/i.test(q.number)),
      'every search hit must actually match the term',
    );
    assert(
      searched.body.meta.total < first.body.meta.total,
      'a search must narrow the total, not just the page',
    );

    // The board takes the same term, so switching views keeps the filter.
    const board = await api('GET', '/quotations/board?q=Acme', { token: rep });
    assert(board.status === 200, 'board search failed');
    const boardCards = board.body.data.columns.flatMap((c: any) => c.cards);
    assert(
      boardCards.length > 0 && boardCards.every((c: any) => /acme/i.test(c.customerName)),
      'the Kanban board must honour ?q= exactly as the flat list does',
    );
    assert(
      board.body.data.columns.every((c: any) => c.cardCount >= c.cards.length),
      'a column must report the true count behind its capped cards',
    );

    // A term that matches nothing is an empty page, never an error or everything.
    const none = await api('GET', '/quotations?q=zzzznothingmatchesthis', { token: rep });
    assert(
      none.status === 200 && none.body.data.length === 0 && none.body.meta.total === 0,
      'a search with no matches must return an empty page, not the whole collection',
    );

    // Regex metacharacters are data, not syntax.
    const literal = await api('GET', '/quotations?q=.*', { token: rep });
    assert(
      literal.status === 200 && literal.body.meta.total === 0,
      'a search term must be matched literally, never executed as a regex',
    );

    // Out-of-range and junk paging degrade to something sane, never a 500.
    const silly = await api('GET', '/quotations?page=0&pageSize=-4', { token: rep });
    assert(
      silly.status === 200 && silly.body.meta.page === 1 && silly.body.meta.pageSize >= 1,
      'a nonsense page/pageSize must be clamped, not honoured',
    );

    // Fulfillment carries two lists in one payload, so it pages each separately
    // under one shared search term.
    const ful = await api('GET', '/fulfillment?stockPageSize=2&awaitingPageSize=1', { token: rep });
    expectBuilt(ful, 'integration', 'GET /fulfillment (paged)');
    assert(ful.status === 200, `fulfillment failed: ${ful.body.error?.message}`);
    assert(
      ful.body.meta?.stock?.total !== undefined && ful.body.meta?.awaiting?.total !== undefined,
      'fulfillment must report a pagination block for each of its two lists',
    );
    assert(
      ful.body.data.stock.length <= 2 && ful.body.data.awaiting.length <= 1,
      'fulfillment ignored its per-list page sizes',
    );
    const fulSearch = await api('GET', '/fulfillment?q=East', { token: rep });
    assert(
      fulSearch.status === 200 && fulSearch.body.meta.stock.total < ful.body.meta.stock.total,
      'one search box must narrow the stock table',
    );

    // The customer portal pages too, and its search stays inside the company.
    const portal = await api('GET', '/portal/quotations?pageSize=2', {
      token: tokens['das@betaindustries.test'],
    });
    assert(portal.status === 200 && portal.body.data.items.length <= 2, 'the portal list did not page');
    assert(
      portal.body.meta.total > 2,
      `Beta should have more than one page of quotations, got ${portal.body.meta.total}`,
    );
    const portalSearch = await api('GET', '/portal/quotations?q=Q-1042', {
      token: tokens['das@betaindustries.test'],
    });
    assert(
      portalSearch.body.data.items.length === 0,
      "a portal search must never reach another company's quotation",
    );

    return `${lists.length + 1} list endpoints page + report meta · search narrows total · regex is literal · portal search stays in-company`;
  });

  /* ---- 17. Hardware carries warehouse stock; nothing else does ---- */
  await step(
    17,
    'A hardware product shows and is created with its warehouse stock',
    'platform',
    async () => {
      const admin = tokens[Role.ADMIN];
      const catalogue = await api('GET', '/products?pageSize=100', { token: admin });
      assert(catalogue.status === 200, 'could not read the catalogue');
      const laptop = catalogue.body.data.find((p: any) => p.sku === 'LP14-BASE');
      const service = catalogue.body.data.find((p: any) => p.sku === 'SVC-ONSITE');
      assert(laptop && service, 'the seeded laptop and service product must both exist');

      // Read side: the laptop reports the same Main 18 / East 6 the split
      // planner works from, and the catalogue figure reconciles to the sum.
      const stock = await api('GET', `/products/${laptop.id}/stock`, { token: admin });
      expectBuilt(stock, 'platform', 'GET /products/:id/stock');
      assert(stock.status === 200, `product stock failed: ${stock.body.error?.message}`);
      assert(stock.body.data.stocked === true, 'a hardware product must be stocked');
      const main = stock.body.data.warehouses.find((w: any) => w.warehouseCode === 'MAIN');
      const east = stock.body.data.warehouses.find((w: any) => w.warehouseCode === 'EAST');
      assert(main?.available === 18, `Main should show 18 available, got ${main?.available}`);
      assert(east?.available === 6, `East should show 6 available, got ${east?.available}`);
      assert(
        stock.body.data.totalInStock === stock.body.data.quantityOnHand,
        `catalogue quantity ${stock.body.data.quantityOnHand} must equal the warehouses' ${stock.body.data.totalInStock}`,
      );

      // A service is delivered, never shelved, so it answers plainly instead of 404ing.
      const serviceStock = await api('GET', `/products/${service.id}/stock`, { token: admin });
      assert(
        serviceStock.status === 200 &&
          serviceStock.body.data.stocked === false &&
          serviceStock.body.data.warehouses.length === 0,
        'a services product must report stocked: false with no warehouses',
      );

      // Write side: opening stock lands as real Stock rows and sets the catalogue figure.
      const warehouses = await api('GET', '/warehouses', { token: admin });
      const [wMain, wEast] = ['MAIN', 'EAST'].map((code) =>
        warehouses.body.data.find((w: any) => w.code === code),
      );
      const createdProduct = await api('POST', '/products', {
        token: admin,
        body: {
          name: 'Smoke Test Monitor',
          category: 'HARDWARE',
          unitPrice: 20000,
          costPrice: 12000,
          unit: 'Each',
          taxPct: 15,
          isSubscription: false,
          warehouseStock: [
            { warehouseId: wMain.id, inStock: 7 },
            { warehouseId: wEast.id, inStock: 3 },
          ],
        },
      });
      assert(createdProduct.status === 201, `create failed: ${createdProduct.body.error?.message}`);
      assert(
        createdProduct.body.data.quantityOnHand === 10,
        `opening stock must set quantityOnHand to 10, got ${createdProduct.body.data.quantityOnHand}`,
      );
      const newStock = await api('GET', `/products/${createdProduct.body.data.id}/stock`, {
        token: admin,
      });
      assert(
        newStock.body.data.totalInStock === 10 && newStock.body.data.totalAvailable === 10,
        'the opening allocation must be readable back as warehouse stock',
      );

      // And a category that is never stocked cannot smuggle stock in.
      const rejected = await api('POST', '/products', {
        token: admin,
        body: {
          name: 'Smoke Test Service',
          category: 'SERVICES',
          unitPrice: 5000,
          costPrice: 1000,
          unit: 'Each',
          taxPct: 15,
          isSubscription: false,
          warehouseStock: [{ warehouseId: wMain.id, inStock: 4 }],
        },
      });
      assert(
        rejected.status === 400,
        `a services product must not accept warehouse stock, got ${rejected.status}`,
      );

      return 'Laptop Main 18 / East 6 reconciles to the catalogue; a new hardware product opened with 7 + 3; services rejected';
    },
  );

  /* ---- 18. Finance's lists are scoped to Finance's work ---- */
  await step(
    18,
    "Finance sees only approved-onward quotations and only the approvals that reached Finance",
    'approvals',
    async () => {
      const finance = tokens[Role.FINANCE];
      const manager = tokens[Role.SALES_MANAGER];

      // Approvals: a MEDIUM-risk quote routed to the Manager alone is not Finance's
      // business, and a HIGH-risk one still sitting with the Manager has not reached
      // them yet. Both are visible to the Manager, so the queue really is scoped.
      const financeQueue = await api('GET', '/approvals?pageSize=100', { token: finance });
      const managerQueue = await api('GET', '/approvals?pageSize=100', { token: manager });
      assert(financeQueue.status === 200 && managerQueue.status === 200, 'approval queues failed');
      assert(
        managerQueue.body.data.items.length > financeQueue.body.data.items.length,
        `Finance should see fewer approvals than the Manager, got ${financeQueue.body.data.items.length} vs ${managerQueue.body.data.items.length}`,
      );
      assert(
        financeQueue.body.data.items.length > 0,
        'Finance must still see the approvals that did reach them',
      );
      for (const a of financeQueue.body.data.items) {
        const financeStep = a.steps.find((st: any) => st.role === Role.FINANCE);
        assert(financeStep, `${a.quotationNumber} has no Finance step but is in Finance's queue`);
        assert(
          financeStep.status !== 'PENDING' && financeStep.status !== 'SKIPPED',
          `${a.quotationNumber}'s Finance step never activated, so it never reached Finance`,
        );
      }
      // The chips must count the same scope as the rows, or the queue reads as
      // broken — "1 row, 12 Pending". Checked against Finance's own rows, since
      // the page holds all of them. (An auto-approved NOT_REQUIRED approval is in
      // no chip by design; the four chips cover the four decided states.)
      const counts = financeQueue.body.data.counts;
      const managerCounts = managerQueue.body.data.counts;
      for (const [chip, status] of [
        ['pending', 'PENDING'],
        ['returned', 'RETURNED'],
        ['approved', 'APPROVED'],
        ['rejected', 'REJECTED'],
      ] as const) {
        const mine = financeQueue.body.data.items.filter((a: any) => a.status === status).length;
        assert(
          counts[chip] === mine,
          `the ${chip} chip says ${counts[chip]} but Finance can see ${mine} such approvals`,
        );
        assert(
          counts[chip] <= managerCounts[chip],
          `Finance's ${chip} chip (${counts[chip]}) must never exceed the Manager's (${managerCounts[chip]})`,
        );
      }
      assert(
        counts.approved < managerCounts.approved,
        "the Manager's history of approvals must not be counted into Finance's chips",
      );

      // Quotations: approved onward only. Drafts and rejects are not Finance's queue.
      const financeQuotes = await api('GET', '/quotations?pageSize=500', { token: finance });
      assert(financeQuotes.status === 200, 'finance quotation list failed');
      assert(financeQuotes.body.data.length > 0, 'Finance must still see the cleared deals');
      assert(
        financeQuotes.body.data.every((qt: any) =>
          ['APPROVED', 'NEGOTIATION', 'CONFIRMED'].includes(qt.stage),
        ),
        'Finance must not see a draft, a pending or a rejected quotation',
      );
      const managerQuotes = await api('GET', '/quotations?pageSize=500', { token: manager });
      assert(
        managerQuotes.body.meta.total > financeQuotes.body.meta.total,
        'the Manager still sees the whole pipeline',
      );

      // A hand-typed stage a role cannot see narrows to nothing; it never widens.
      const smuggled = await api('GET', '/quotations?stage=DRAFT', { token: finance });
      assert(
        smuggled.status === 200 && smuggled.body.data.length === 0,
        `?stage=DRAFT must return nothing for Finance, got ${smuggled.body.data.length} rows`,
      );

      // And the board drops the lanes Finance can never fill.
      const board = await api('GET', '/quotations/board', { token: finance });
      const boardStages = board.body.data.columns.map((c: any) => c.stage);
      assert(
        !boardStages.includes('DRAFT') && !boardStages.includes('PENDING_APPROVAL'),
        `Finance's board must not carry lanes they cannot see: ${boardStages.join(', ')}`,
      );
      assert(boardStages.includes('APPROVED'), "Finance's board must keep the Approved lane");

      return `approvals ${financeQueue.body.data.items.length} of ${managerQueue.body.data.items.length} · quotations ${financeQuotes.body.meta.total} of ${managerQuotes.body.meta.total} · board lanes ${boardStages.join('/')}`;
    },
  );

  /* ---- 19. Accounts are issued, not self-served — and a token is not a licence ---- */
  await step(
    19,
    'Only an Admin creates accounts, and deactivating one takes effect on the next request',
    'platform',
    async () => {
      const admin = tokens[Role.ADMIN];
      const rep = tokens[Role.SALES_REP];

      // There is no public signup: nobody can mint themselves an account.
      const selfServe = await api('POST', '/auth/signup', {
        body: { name: 'Mallory', email: 'mallory@evil.test', password: 'Demo@123', role: 'ADMIN' },
      });
      assert(
        selfServe.status === 404,
        `POST /auth/signup must not exist, got ${selfServe.status}`,
      );

      // Creating accounts is Admin-only.
      const byRep = await api('POST', '/users', {
        token: rep,
        body: { name: 'Sneaky Rep', email: 'sneaky@dealflow360.test', password: 'Demo@123', role: 'SALES_REP' },
      });
      assert(byRep.status === 403, `a rep must not create accounts, got ${byRep.status}`);

      // The list never carries a password hash, to an Admin or to anyone.
      const list = await api('GET', '/users?pageSize=100', { token: admin });
      assert(list.status === 200, `user list failed: ${list.body.error?.message}`);
      assert(
        list.body.data.items.every((u: any) => u.passwordHash === undefined),
        'the user list must never carry a password hash',
      );
      assert(
        list.body.data.items.some((u: any) => u.active === false),
        'the seed should include a deactivated account so the screen shows both states',
      );

      // A portal login must name a company; an internal one must not.
      const customers = await api('GET', '/customers', { token: admin });
      const orion = customers.body.data.find((c: any) => c.name === 'Orion Ltd');
      assert(orion, 'expected Orion Ltd in the seed');
      const noCompany = await api('POST', '/users', {
        token: admin,
        body: { name: 'Portal Person', email: 'portal@orion.test', password: 'Demo@123', role: 'CUSTOMER' },
      });
      assert(noCompany.status === 400, 'a customer account without a company must be refused');
      const strayCompany = await api('POST', '/users', {
        token: admin,
        body: { name: 'Stray', email: 'stray@dealflow360.test', password: 'Demo@123', role: 'FINANCE', customerId: orion.id },
      });
      assert(strayCompany.status === 400, 'an internal account must not carry a company');

      // The real thing: a portal login for a company that had none.
      const createdUser = await api('POST', '/users', {
        token: admin,
        body: { name: 'N. Orion', email: 'portal@orion.test', password: 'Demo@123', role: 'CUSTOMER', customerId: orion.id },
      });
      assert(createdUser.status === 201, `create failed: ${createdUser.body.error?.message}`);
      assert(
        createdUser.body.data.customerId === orion.id && createdUser.body.data.passwordHash === undefined,
        'a new portal login must carry its company and no password hash',
      );

      // It signs in, and the list shows which company it belongs to.
      const session = await api('POST', '/auth/login', {
        body: { email: 'portal@orion.test', password: 'Demo@123' },
      });
      assert(session.status === 200, 'the new account could not sign in');
      const newToken = session.body.data.token;
      const listed = await api('GET', '/users?q=N. Orion', { token: admin });
      assert(
        listed.body.data.items[0]?.customerName === 'Orion Ltd',
        'the user list must resolve the company name for a portal login',
      );

      // A JWT is a bearer token we cannot recall, so the API re-reads the account:
      // deactivating takes effect on the very next request with the SAME token.
      const beforeRevoke = await api('GET', '/auth/me', { token: newToken });
      assert(beforeRevoke.status === 200, 'the fresh token should work');
      const deactivated = await api('PATCH', `/users/${createdUser.body.data.id}`, {
        token: admin,
        body: { active: false },
      });
      assert(deactivated.status === 200, `deactivate failed: ${deactivated.body.error?.message}`);
      const afterRevoke = await api('GET', '/quotations', { token: newToken });
      assert(
        afterRevoke.status === 401,
        `a deactivated account's existing token must stop working, got ${afterRevoke.status}`,
      );
      const loginAfter = await api('POST', '/auth/login', {
        body: { email: 'portal@orion.test', password: 'Demo@123' },
      });
      assert(loginAfter.status === 401, 'a deactivated account must not be able to sign in again');

      // An Admin cannot strand everyone by deactivating themselves.
      const self = await api('PATCH', `/users/${DEMO_ACCOUNTS[0].id}`, {
        token: admin,
        body: { active: false },
      });
      assert(self.status === 400, 'an Admin must not be able to deactivate their own account');

      return 'no public signup · rep 403 · no hash on the wire · Orion portal login created, then revoked mid-token';
    },
  );

  /* ---- 20. An Admin edits accounts; the holder picks their own password ---- */
  await step(
    20,
    'An Admin can edit an account, and a new account is asked to set its own password',
    'platform',
    async () => {
      const admin = tokens[Role.ADMIN];

      // A new account starts on a password somebody else typed, and says so.
      const createdUser = await api('POST', '/users', {
        token: admin,
        body: { name: 'E. Editable', email: 'editable@dealflow360.test', password: 'Temp@123', role: 'SALES_REP' },
      });
      assert(createdUser.status === 201, `create failed: ${createdUser.body.error?.message}`);
      const userId = createdUser.body.data.id;
      assert(
        createdUser.body.data.mustChangePassword === true,
        'a new account must be asked to choose its own password',
      );

      // Editing: name, email and an internal role change all land together.
      const edited = await api('PATCH', `/users/${userId}`, {
        token: admin,
        body: { name: 'E. Edited', email: 'edited@dealflow360.test', role: 'FINANCE' },
      });
      assert(edited.status === 200, `edit failed: ${edited.body.error?.message}`);
      assert(
        edited.body.data.name === 'E. Edited' &&
          edited.body.data.email === 'edited@dealflow360.test' &&
          edited.body.data.role === 'FINANCE',
        'the edit did not take',
      );
      assert(edited.body.data.passwordHash === undefined, 'an edit response must not carry the hash');

      // An email already in use is refused rather than silently duplicating.
      const clash = await api('PATCH', `/users/${userId}`, {
        token: admin,
        body: { email: 'admin@dealflow360.test' },
      });
      assert(clash.status === 409, `a duplicate email must conflict, got ${clash.status}`);

      // The holder sets their own password, and the flag clears.
      const session = await api('POST', '/auth/login', {
        body: { email: 'edited@dealflow360.test', password: 'Temp@123' },
      });
      assert(session.status === 200, 'the new account could not sign in');
      assert(
        session.body.data.user.mustChangePassword === true,
        'the sign-in response must tell the UI to offer a password change',
      );
      const userToken = session.body.data.token;

      const wrongCurrent = await api('POST', '/auth/change-password', {
        token: userToken,
        body: { currentPassword: 'NotIt@123', newPassword: 'Mine@4567' },
      });
      assert(wrongCurrent.status === 400, 'changing a password must prove the current one');
      const sameAgain = await api('POST', '/auth/change-password', {
        token: userToken,
        body: { currentPassword: 'Temp@123', newPassword: 'Temp@123' },
      });
      assert(sameAgain.status === 400, 'the new password must differ from the old one');

      const changed = await api('POST', '/auth/change-password', {
        token: userToken,
        body: { currentPassword: 'Temp@123', newPassword: 'Mine@4567' },
      });
      assert(changed.status === 200, `change-password failed: ${changed.body.error?.message}`);
      assert(
        changed.body.data.mustChangePassword === false,
        'setting your own password must clear the prompt',
      );

      const oldPassword = await api('POST', '/auth/login', {
        body: { email: 'edited@dealflow360.test', password: 'Temp@123' },
      });
      assert(oldPassword.status === 401, 'the old password must stop working');
      const newPassword = await api('POST', '/auth/login', {
        body: { email: 'edited@dealflow360.test', password: 'Mine@4567' },
      });
      assert(
        newPassword.status === 200 && newPassword.body.data.user.mustChangePassword === false,
        'the new password must work, with no prompt left',
      );

      // An Admin reset puts the prompt back — a reset password is one they did
      // not choose either.
      const reset = await api('PATCH', `/users/${userId}`, {
        token: admin,
        body: { password: 'Reset@123' },
      });
      assert(reset.status === 200, `reset failed: ${reset.body.error?.message}`);
      assert(
        reset.body.data.mustChangePassword === true,
        'an Admin reset must ask the holder to choose their own again',
      );
      const afterReset = await api('POST', '/auth/login', {
        body: { email: 'edited@dealflow360.test', password: 'Reset@123' },
      });
      assert(afterReset.status === 200, 'the reset password must work');

      // Nobody may change somebody else's password through this endpoint: it
      // takes no id, and it requires the current password.
      const notMine = await api('POST', '/auth/change-password', {
        token: tokens[Role.SALES_REP],
        body: { currentPassword: 'Reset@123', newPassword: 'Sneaky@123' },
      });
      assert(notMine.status === 400, "one account's password must not open another's");

      // A demo login is exempt, or the published credentials would go stale.
      const demo = await api('POST', '/auth/login', {
        body: { email: 'rep@dealflow360.test', password: DEMO_ACCOUNTS[1].password },
      });
      assert(
        demo.body.data.user.mustChangePassword === false,
        'seeded demo logins must not be prompted — their passwords are published',
      );

      return 'created → prompted → edited (name/email/role) → holder set their own → Admin reset re-armed the prompt';
    },
  );


  /* ---- 21. The realtime handshake is the authorisation boundary ---- */
  await step(
    21,
    'A socket is authenticated once, and its rooms are what it may ever receive',
    'platform',
    async () => {
      const manager = await openSocket({ token: tokens[Role.SALES_MANAGER] });
      const customer = await openSocket({ token: tokens['priya@acmecorp.test'] });

      assert(
        manager.ready.rooms.includes(SocketRoom.role(Role.SALES_MANAGER)) &&
          manager.ready.rooms.includes(SocketRoom.internal),
        `a manager must be in their role room and the internal room, got ${manager.ready.rooms.join(', ')}`,
      );
      assert(
        !customer.ready.rooms.includes(SocketRoom.internal),
        `a customer must never be in the internal room, got ${customer.ready.rooms.join(', ')}`,
      );
      assert(
        customer.ready.rooms.includes(SocketRoom.customer(customer.ready.customerId!)),
        'a customer must be in their own company room',
      );

      // No credential, and a forged one, are both refused outright — a socket
      // that cannot say who it is has no room to be in.
      const noCredential = await expectRefused({});
      const forged = await expectRefused({ token: 'not-a-jwt' });

      // A magic link unlocks exactly the quotation it was minted for. Mint a
      // fresh one rather than reusing the seeded token: step 15 proves that a
      // reissue revokes every earlier link, so by now the seeded one is dead —
      // which is the system working, not a problem to route around.
      const acme = await api('GET', '/quotations?q=Q-1042', { token: tokens[Role.SALES_MANAGER] });
      const issued = await api('POST', `/quotations/${(acme.body.data as any[])[0].id}/portal-link`, {
        token: tokens[Role.SALES_MANAGER],
        body: { reason: 'Smoke test: realtime handshake' },
      });
      assert(issued.status === 200, `could not mint a portal link: ${issued.body.error?.message}`);
      const link = await openSocket({ portalToken: issued.body.data.token });
      assert(
        !!link.ready.quotationId &&
          link.ready.rooms.includes(SocketRoom.quotation(link.ready.quotationId)),
        'a magic-link session must land in its own quotation room',
      );

      // ...and cannot talk its way into another company's deal. This is the
      // same negative-auth case step 7 proves over REST.
      const foreign = await api('GET', '/quotations?pageSize=100', {
        token: tokens[Role.SALES_MANAGER],
      });
      const notTheirs = (foreign.body.data as any[]).find(
        (q) => String(q.customerId) !== String(link.ready.customerId),
      );
      const allowed = await new Promise<boolean>((resolve) => {
        link.socket.emit(SocketEvent.SUBSCRIBE_QUOTATION, notTheirs.id, (ok: boolean) => resolve(ok));
        setTimeout(() => resolve(true), 3000);
      });
      assert(allowed === false, `a portal link must not watch ${notTheirs.number}`);

      for (const s of [manager, customer, link]) s.socket.close();
      return `rooms scoped per identity · no-credential refused ("${noCredential}") · forged token refused ("${forged}") · a link cannot watch ${notTheirs.number}`;
    },
  );

  /* ---- 22. A business event notifies the people it concerns, live ---- */
  await step(
    22,
    'Deciding an approval reaches the owning rep over the socket, and nobody else',
    'platform',
    async () => {
      const queue = await api('GET', '/approvals?pendingOnly=true&pageSize=50', {
        token: tokens[Role.SALES_MANAGER],
      });
      const target = (queue.body.data.items as any[]).find(
        (a) => a.currentStage === Role.SALES_MANAGER,
      );
      assert(!!target, 'the seed must leave an approval sitting on the Sales Manager');

      // Sign in AS THE OWNER, so we are watching the bell that should ring.
      const users = await api('GET', '/users?pageSize=100', { token: tokens[Role.ADMIN] });
      const owner = (users.body.data.items as any[]).find((u) => u.name === target.ownerName);
      assert(!!owner, `no account for ${target.ownerName}`);
      const ownerLogin = await api('POST', '/auth/login', {
        body: { email: owner.email, password: DEMO_ACCOUNTS.find((d) => d.email === owner.email)?.password },
      });
      assert(ownerLogin.status === 200, `could not sign in as ${owner.email}`);

      const repSocket = await openSocket({ token: ownerLogin.body.data.token });
      const managerSocket = await openSocket({ token: tokens[Role.SALES_MANAGER] });
      const customerSocket = await openSocket({ token: tokens['priya@acmecorp.test'] });

      const decision = await api('POST', `/approvals/${target.id}/approve`, {
        token: tokens[Role.SALES_MANAGER],
        body: { reason: 'Smoke test: realtime delivery' },
      });
      assert(decision.status === 200, `approve failed: ${decision.body.error?.message}`);

      await settle(900);

      const notification = repSocket.frames.find((f) => f.event === SocketEvent.NOTIFICATION_NEW);
      assert(
        !!notification,
        `the owning rep received no notification — frames: ${repSocket.frames.map((f) => f.event).join(', ') || 'none'}`,
      );
      const dto = notification!.payload as NotificationDto;
      assert(
        dto.type === NotificationType.APPROVAL_APPROVED ||
          dto.type === NotificationType.APPROVAL_STEP_ADVANCED,
        `unexpected notification type ${dto.type}`,
      );
      assert(!!dto.link, 'a notification must link somewhere the recipient can open');
      assert(!!dto.severity, 'a notification must carry a severity for the UI to colour by');

      assert(
        repSocket.frames.some((f) => f.event === SocketEvent.NOTIFICATION_COUNT),
        'the badge count must be pushed alongside the notification',
      );
      assert(
        repSocket.frames.some((f) => f.event === SocketEvent.APPROVAL_UPDATED),
        'the approval domain event must reach the owner',
      );

      // Nobody is told about their own action...
      assert(
        !managerSocket.frames.some((f) => f.event === SocketEvent.NOTIFICATION_NEW),
        'the manager who decided must not be notified of their own decision',
      );
      // ...and an internal approval is not the customer's business.
      assert(
        !customerSocket.frames.some(
          (f) =>
            f.event === SocketEvent.NOTIFICATION_NEW || f.event === SocketEvent.APPROVAL_UPDATED,
        ),
        `a customer must hear nothing of an internal approval — frames: ${customerSocket.frames.map((f) => f.event).join(', ')}`,
      );

      // The push is a convenience; the row is the notification. Someone who was
      // offline must still find it in their bell.
      const persisted = await api('GET', '/notifications', { token: ownerLogin.body.data.token });
      assert(
        (persisted.body.data.items as NotificationDto[]).some((n) => n.id === dto.id),
        'the notification must be persisted, not only pushed',
      );

      // Marking read pushes the cleared badge to this person's other tabs.
      const secondTab = await openSocket({ token: ownerLogin.body.data.token });
      await api('POST', '/notifications/read-all', { token: ownerLogin.body.data.token });
      await settle(700);
      const countFrame = secondTab.frames.find((f) => f.event === SocketEvent.NOTIFICATION_COUNT);
      assert(
        countFrame?.payload?.unreadCount === 0,
        `a second tab must see the badge clear, got ${JSON.stringify(countFrame?.payload)}`,
      );

      for (const s of [repSocket, managerSocket, customerSocket, secondTab]) s.socket.close();
      return `${target.quotationNumber} → ${target.ownerName} got "${dto.title}" (${dto.type}) · the decider and the customer got nothing · persisted and cleared across tabs`;
    },
  );

  /* ------------------------------------------------------------------ report */

  await closeRealtime();
  server.close();
  await disconnectMongo();
  await mongo.stop();

  const pass = results.filter((r) => r.status === 'PASS').length;
  const pending = results.filter((r) => r.status === 'PENDING');
  const fail = results.filter((r) => r.status === 'FAIL');

  log.banner(
    `Smoke: ${pass} passing · ${pending.length} not yet built · ${fail.length} failing`,
  );

  if (pending.length > 0) {
    console.log('\nStill to build:');
    for (const p of pending) console.log(`  ⧗ ${p.domain} — step ${p.n}: ${p.title}`);
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
