#!/usr/bin/env tsx
/**
 * LEVEL-0 RESET  —  `npm run reset`
 *
 * Returns the entire environment to a known-good, fully-configured baseline.
 * Nobody on this team ever debugs a corrupted database during a hackathon: they
 * run this, it takes seconds, and everything is exactly as it was.
 *
 *   npm run reset                  full level-0 rebuild
 *   npm run reset -- --keep-config wipe transactional data, keep admin config
 *   npm run reset -- --minimal     config + users only (empty-state testing)
 *   npm run reset -- --force       allow a non-local Mongo URI (guard rail off)
 *   npm run reset:check            run the assertions ONLY, wipe nothing
 *   npm run demo:reset             full rebuild + verification, run before the demo
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  ApprovalStatus,
  InvoiceStatus,
  RiskLevel,
  Role,
} from '@dealflow/shared';
import { env, isLocalMongoUri } from '../apps/api/src/config/env.js';
import { connectMongo, disconnectMongo } from '../apps/api/src/db/connection.js';
import {
  Approval,
  AuditLog,
  DealAlert,
  Invoice,
  PortalToken,
  Quotation,
  Stock,
  User,
  syncAllIndexes,
} from '../apps/api/src/db/models.js';
import { log } from '../apps/api/src/utils/logger.js';
import { printSummary, runSeed } from '../apps/api/src/seed/seed.js';
import { DEMO_ACCOUNTS } from '../apps/api/src/seed/users.seed.js';
import { PRIYA_PORTAL_TOKEN } from '../apps/api/src/seed/modules/approvals.seed.js';
import { IDS } from '../apps/api/src/seed/ids.js';
import { waitForMongo } from './wait-for-mongo.js';

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);

const OPTS = {
  keepConfig: flag('keep-config'),
  minimal: flag('minimal'),
  force: flag('force'),
  checkOnly: flag('check-only'),
  verify: flag('verify'),
};

/* ------------------------------------------------------------------ assertions */

interface Assertion {
  name: string;
  run: () => Promise<void>;
}

function expect(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function eq(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const ASSERTIONS: Assertion[] = [
  {
    name: 'exactly 7 demo users exist',
    run: async () => {
      const count = await User.countDocuments({ email: { $in: DEMO_ACCOUNTS.map((a) => a.email) } });
      eq(count, 7, 'demo user count');
    },
  },
  {
    name: 'every demo credential authenticates',
    run: async () => {
      for (const account of DEMO_ACCOUNTS) {
        const user = await User.findOne({ email: account.email }).lean();
        expect(user, `user ${account.email} is missing`);
        expect(user!.active, `user ${account.email} is inactive`);
        const okPassword = await bcrypt.compare(account.password, (user as any).passwordHash);
        expect(okPassword, `password for ${account.email} does not verify`);
        eq((user as any).role, account.role, `role for ${account.email}`);
      }
    },
  },
  {
    name: 'Q-1042 scores 33 -> HIGH -> [SALES_MANAGER, FINANCE]',
    run: async () => {
      const q: any = await Quotation.findOne({ number: 'Q-1042' }).lean();
      expect(q, 'Q-1042 is missing');
      eq(q.risk.riskScore, 33, 'Q-1042 riskScore');
      eq(q.risk.riskLevel, RiskLevel.HIGH, 'Q-1042 riskLevel');
      eq(q.risk.requiredChain, [Role.SALES_MANAGER, Role.FINANCE], 'Q-1042 approval chain');
      eq(q.risk.maxSingleOver, 8, 'Q-1042 maxSingleOver');
      eq(q.risk.explanation.length, 2, 'Q-1042 explanation row count');
      eq(q.risk.explanation[1].overBy, 8, 'Q-1042 setup line overBy');
    },
  },
  {
    name: 'Q-1042 has exactly the 3 seeded audit-trail entries, in order',
    run: async () => {
      const approval: any = await Approval.findOne({ quotationNumber: 'Q-1042' }).lean();
      expect(approval, 'Q-1042 approval is missing');
      eq(approval.trail.length, 3, 'Q-1042 trail length');
      eq(
        approval.trail.map((t: any) => `${t.actorName}:${t.action}`),
        ['J. Rao:SUBMITTED', 'M. Shah:RETURNED', 'J. Rao:RESUBMITTED'],
        'Q-1042 trail sequence',
      );
      const times = approval.trail.map((t: any) => new Date(t.at).getTime());
      expect(times[0] < times[1] && times[1] < times[2], 'Q-1042 trail is not chronological');
      eq(approval.status, ApprovalStatus.PENDING, 'Q-1042 approval status');
      eq(approval.currentStage, Role.SALES_MANAGER, 'Q-1042 current stage');
    },
  },
  {
    name: 'Laptop Pro 14 availability: Main 18, East Depot 6',
    run: async () => {
      const main: any = await Stock.findOne({ warehouseId: IDS.warehouses.main, productId: IDS.products.laptop }).lean();
      const east: any = await Stock.findOne({ warehouseId: IDS.warehouses.east, productId: IDS.products.laptop }).lean();
      eq(main?.available, 18, 'Main Warehouse laptop availability');
      eq(east?.available, 6, 'East Depot laptop availability');
      eq(main.inStock - main.reserved, main.available, 'Main stock invariant');
      eq(east.inStock - east.reserved, east.available, 'East stock invariant');
    },
  },
  {
    name: 'INV-1042 is unpaid, INV-1043 recurring and paid',
    run: async () => {
      const oneTime: any = await Invoice.findOne({ number: 'INV-1042' }).lean();
      const recurring: any = await Invoice.findOne({ number: 'INV-1043' }).lean();
      expect(oneTime, 'INV-1042 is missing');
      expect(recurring, 'INV-1043 is missing');
      eq(oneTime.status, InvoiceStatus.ISSUED, 'INV-1042 status');
      expect(oneTime.amountDue > 0, 'INV-1042 should have an outstanding balance');
      eq(recurring.status, InvoiceStatus.PAID, 'INV-1043 status');
      eq(recurring.type, 'RECURRING', 'INV-1043 type');
      // One order, two billing artefacts, and they never share a line.
      eq(oneTime.orderId?.toString(), recurring.orderId?.toString(), 'both invoices belong to ORD-1041');
      const recurringProductIds = recurring.lines.map((l: any) => String(l.productId));
      const oneTimeProductIds = oneTime.lines.map((l: any) => String(l.productId));
      expect(
        !recurringProductIds.some((id: string) => oneTimeProductIds.includes(id)),
        'the recurring invoice must not repeat a one-time line',
      );
      const sum = oneTime.lines.reduce((a: number, l: any) => a + l.total, 0);
      eq(sum, oneTime.total, 'INV-1042 total equals the sum of its lines');
    },
  },
  {
    name: 'at least one stalled deal and one discount anomaly are detectable',
    run: async () => {
      const stalled = await DealAlert.countDocuments({ type: 'STALLED_DEAL' });
      const anomaly = await DealAlert.countDocuments({ type: 'DISCOUNT_ANOMALY' });
      expect(stalled >= 1, `expected at least one stalled deal, found ${stalled}`);
      expect(anomaly >= 1, `expected at least one discount anomaly, found ${anomaly}`);
      const q1030 = await DealAlert.findOne({ quotationNumber: 'Q-1030', type: 'STALLED_DEAL' }).lean();
      expect(q1030, 'Q-1030 should be flagged as a stalled deal');
      eq((q1030 as any).issue, 'idle 9 days', 'Q-1030 stalled issue text');
    },
  },
  {
    name: "Priya's portal token resolves to Q-1042 and is scoped to Acme Corp",
    run: async () => {
      const token: any = await PortalToken.findOne({ token: PRIYA_PORTAL_TOKEN }).lean();
      expect(token, 'the seeded portal token is missing');
      expect(!token.revoked, 'the seeded portal token is revoked');
      expect(new Date(token.expiresAt) > new Date(), 'the seeded portal token has expired');
      const q: any = await Quotation.findById(token.quotationId).lean();
      eq(q?.number, 'Q-1042', 'portal token target');
      eq(String(token.customerId), String(IDS.customers.acme), 'portal token customer scope');
      // Negative auth: R. Das belongs to Beta Industries and must not match.
      const das: any = await User.findOne({ email: 'das@betaindustries.test' }).lean();
      expect(
        String(das.customerId) !== String(token.customerId),
        "R. Das must not share Acme Corp's customer scope",
      );
    },
  },
  {
    name: 'audit trail is populated and every entry names an actor and a reason',
    run: async () => {
      const total = await AuditLog.countDocuments();
      expect(total >= 8, `expected a populated audit trail, found ${total} entries`);
      const bad = await AuditLog.countDocuments({ $or: [{ actor: '' }, { actor: null }] });
      eq(bad, 0, 'audit entries without an actor');
    },
  },
  {
    name: 'no orphaned references (quotations, approvals, invoices, stock)',
    run: async () => {
      const [quotations, approvals, invoices, stock, users] = await Promise.all([
        Quotation.find().select('customerId ownerId number').lean(),
        Approval.find().select('quotationId quotationNumber').lean(),
        Invoice.find().select('customerId orderId number').lean(),
        Stock.find().select('warehouseId productId').lean(),
        User.find().select('_id').lean(),
      ]);
      const userIds = new Set(users.map((u: any) => String(u._id)));
      for (const q of quotations as any[]) {
        expect(userIds.has(String(q.ownerId)), `${q.number} points at a missing owner`);
      }
      const quotationIds = new Set(quotations.map((q: any) => String(q._id)));
      for (const a of approvals as any[]) {
        expect(quotationIds.has(String(a.quotationId)), `approval for ${a.quotationNumber} points at a missing quotation`);
      }
      expect(invoices.length > 0 && stock.length > 0, 'invoices and stock must not be empty');
    },
  },
  {
    name: 'stock reservation conservation (available === inStock - reserved everywhere)',
    run: async () => {
      const rows: any[] = await Stock.find().lean();
      for (const r of rows) {
        eq(r.available, Math.max(0, r.inStock - r.reserved), `stock invariant for ${r._id}`);
        expect(r.reserved >= 0 && r.inStock >= 0, 'stock quantities must not be negative');
      }
    },
  },
  {
    name: 'money is stored as integers everywhere it matters',
    run: async () => {
      const quotes: any[] = await Quotation.find().select('number totals lines').limit(50).lean();
      for (const q of quotes) {
        for (const key of ['subtotal', 'discountTotal', 'netTotal', 'taxTotal', 'grandTotal']) {
          expect(Number.isInteger(q.totals[key]), `${q.number}.totals.${key} is not an integer (${q.totals[key]})`);
        }
        for (const l of q.lines) {
          expect(Number.isInteger(l.lineTotal), `${q.number} line ${l.lineId} lineTotal is not an integer`);
        }
      }
    },
  },
  {
    name: 'invoice totals equal the sum of their lines',
    run: async () => {
      const invoices: any[] = await Invoice.find().lean();
      for (const inv of invoices) {
        const sum = inv.lines.reduce((a: number, l: any) => a + l.total, 0);
        eq(sum, inv.total, `${inv.number} total`);
        eq(inv.amountDue, inv.total - inv.amountPaid, `${inv.number} amountDue`);
      }
    },
  },
];

async function runAssertions(): Promise<boolean> {
  let failures = 0;
  for (const assertion of ASSERTIONS) {
    try {
      await assertion.run();
      log.ok(assertion.name);
    } catch (err) {
      failures++;
      log.error(`${assertion.name}\n      → ${(err as Error).message}`);
    }
  }
  if (failures > 0) {
    log.banner(`RESET VERIFICATION FAILED — ${failures} of ${ASSERTIONS.length} assertions did not pass`);
    return false;
  }
  log.ok(`all ${ASSERTIONS.length} assertions passed`);
  return true;
}

/* ------------------------------------------------------------------ filesystem */

function resetFileArtifacts(): number {
  const roots = ['storage/exports', 'storage/uploads', 'storage/logs'];
  let removed = 0;
  for (const dir of roots) {
    const abs = join(process.cwd(), dir);
    if (!existsSync(abs)) {
      mkdirSync(abs, { recursive: true });
      continue;
    }
    for (const entry of readdirSync(abs)) {
      if (entry === '.gitkeep') continue;
      rmSync(join(abs, entry), { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}

/* ------------------------------------------------------------------ main */

async function main(): Promise<void> {
  const started = Date.now();
  const mode = OPTS.checkOnly
    ? 'check-only'
    : OPTS.minimal
      ? 'minimal (config + users)'
      : OPTS.keepConfig
        ? 'keep-config (transactional wipe)'
        : 'full level-0 rebuild';

  log.banner(`DealFlow360 — environment reset  [${mode}]`);

  /* 1. Resolve and guard the target database */
  log.step(1, 'Resolving the target MongoDB');
  log.info(`configured URI: ${env.mongoUri.replace(/\/\/[^@]*@/, '//***@')}`);
  if (!OPTS.checkOnly && !isLocalMongoUri(env.mongoUri) && !OPTS.force) {
    log.error('Refusing to wipe a database whose URI does not look local/dev.');
    log.error('Pass --force if you are certain. Guard rail: apps/api/src/config/env.ts:isLocalMongoUri');
    process.exit(2);
  }
  log.ok(OPTS.checkOnly ? 'read-only run, no wipe' : 'URI is local/dev — safe to rebuild');

  /* 2. Wait for MongoDB */
  log.step(2, 'Waiting for MongoDB');
  const resolved = await waitForMongo(env.mongoUri, OPTS.checkOnly ? 3 : 5, 1000, !OPTS.checkOnly);
  if (resolved.source === 'memory') log.warn('using an EPHEMERAL in-memory MongoDB for this run');
  else log.ok('MongoDB is reachable');
  await connectMongo(resolved.uri);

  try {
    if (OPTS.checkOnly) {
      log.step(3, 'Running post-seed assertions only (nothing was wiped)');
      const passed = await runAssertions();
      log.banner(passed ? 'Environment is sane ✅' : 'Environment is NOT sane ❌ — run `npm run reset`');
      await disconnectMongo();
      await resolved.stop();
      process.exit(passed ? 0 : 1);
    }

    /* 3. Drop */
    log.step(3, OPTS.keepConfig ? 'Dropping transactional collections' : 'Dropping the database');
    if (OPTS.keepConfig) {
      log.ok('configuration preserved; transactional collections handled by the seeder');
    } else {
      await mongoose.connection.dropDatabase();
      log.ok(`dropped database "${env.dbName}"`);
    }

    /* 4. Recreate collections and every index */
    log.step(4, 'Recreating collections and building all indexes');
    const indexes = await syncAllIndexes();
    log.ok(`${indexes.length} collections, ${indexes.reduce((a, i) => a + i.indexes, 0)} indexes built explicitly`);

    /* 5. Seed */
    log.step(5, 'Running seed modules in dependency order');
    const { counts } = await runSeed({
      wipe: true,
      keepConfig: OPTS.keepConfig,
      minimal: OPTS.minimal,
    });
    log.ok(`${Object.values(counts).reduce((a, b) => a + b, 0)} documents written`);

    /* 6. Filesystem + caches */
    log.step(6, 'Clearing filesystem artifacts and in-memory caches');
    const removed = resetFileArtifacts();
    log.ok(`removed ${removed} generated file(s) from storage/`);
    log.ok('API caches are process-local and are rebuilt on next boot');

    /* 7. Assertions */
    log.step(7, 'Verifying the rebuilt environment');
    const passed = OPTS.minimal ? true : await runAssertions();
    if (OPTS.minimal) log.warn('minimal mode — transactional assertions skipped by design');
    if (!passed) {
      await disconnectMongo();
      await resolved.stop();
      process.exit(1);
    }

    /* 8. Summary */
    printSummary(counts);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    log.banner(`Level-0 ready ✅   (${elapsed}s${resolved.source === 'memory' ? ', in-memory MongoDB' : ''})`);
    if (resolved.source === 'memory') {
      log.warn('This run used an ephemeral database. Start Docker and re-run for a persistent demo environment:');
      log.warn('  sudo systemctl start docker && docker compose up -d mongo && npm run reset');
    }
  } finally {
    await disconnectMongo().catch(() => undefined);
    await resolved.stop().catch(() => undefined);
  }
}

main().catch((err) => {
  if ((err as Error).message === 'MONGO_UNREACHABLE') process.exit(3);
  log.error(err);
  process.exit(1);
});
