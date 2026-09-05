/**
 * Seed orchestrator.
 *
 * Runs every module registered in seeds.registry.ts, in dependency order.
 * Deterministic and idempotent: fixed ObjectIds, fixed document numbers, and
 * every date computed as an offset from the single SEED_NOW anchor, so
 * "idle 9 days" is always exactly 9 days no matter when you run it.
 */
import { connectMongo, disconnectMongo } from '../db/connection.js';
import { ALL_MODELS, syncAllIndexes } from '../db/models.js';
import { log } from '../utils/logger.js';
import { createSeedContext } from './context.js';
import { orderedSeedModules } from './seeds.registry.js';
import { credentialsTable } from './users.seed.js';
import { DAS_PORTAL_TOKEN, PRIYA_PORTAL_TOKEN } from './modules/approvals.seed.js';
import { env } from '../config/env.js';

export interface SeedOptions {
  /** Drop every collection first. Default true. */
  wipe?: boolean;
  /** Keep admin configuration (products, price lists, warehouses, plans, users, config). */
  keepConfig?: boolean;
  /** Configuration + users only; no transactional records. */
  minimal?: boolean;
  quiet?: boolean;
}

/** Modules that hold admin configuration rather than transactional data. */
const CONFIG_MODULES = new Set([
  'config', 'users', 'pricelists+customers', 'products', 'warehouses+stock', 'subscriptionPlans',
]);

/** Collections wiped by `--keep-config`. */
export const TRANSACTIONAL_COLLECTIONS = [
  'Quotation', 'Approval', 'AuditLog', 'PortalToken', 'NegotiationEvent', 'Notification',
  'Order', 'Fulfillment', 'Subscription', 'Invoice', 'CreditNote', 'DealAlert', 'Counter',
];

export async function runSeed(options: SeedOptions = {}): Promise<{ counts: Record<string, number> }> {
  const { wipe = true, keepConfig = false, minimal = false, quiet = false } = options;
  const say = quiet ? () => undefined : log.info;
  const ctx = createSeedContext();

  if (wipe) {
    if (keepConfig) {
      for (const m of ALL_MODELS.filter((x) => TRANSACTIONAL_COLLECTIONS.includes(x.modelName))) {
        await m.deleteMany({});
      }
      say(`wiped ${TRANSACTIONAL_COLLECTIONS.length} transactional collections, kept configuration`);
    } else {
      for (const m of ALL_MODELS) await m.deleteMany({});
      say(`wiped ${ALL_MODELS.length} collections`);
    }
  }

  const modules = orderedSeedModules().filter((m) => {
    if (minimal) return CONFIG_MODULES.has(m.name);
    if (keepConfig) return !CONFIG_MODULES.has(m.name);
    return true;
  });

  for (const mod of modules) {
    const started = Date.now();
    await mod.run(ctx);
    say(`seed:${mod.name} (${mod.domain}) — ${Date.now() - started}ms`);
  }

  const counts: Record<string, number> = {};
  for (const m of ALL_MODELS) counts[m.modelName] = await m.countDocuments();
  return { counts };
}

/** Human-readable summary block, printed by both `npm run seed` and `npm run reset`. */
export function printSummary(counts: Record<string, number>): void {
  log.banner('DealFlow360 — seeded demo environment');
  console.log('\nDocument counts');
  log.rule();
  for (const [name, count] of Object.entries(counts).filter(([, c]) => c > 0)) {
    console.log(`  ${name.padEnd(22)} ${String(count).padStart(5)}`);
  }
  console.log('\nDemo accounts (all use the same password)');
  log.rule();
  console.log(credentialsTable());
  console.log('\nCustomer portal — ready to click');
  log.rule();
  console.log(`  Acme / Priya   ${env.webBaseUrl}/portal/q/Q-1042?token=${PRIYA_PORTAL_TOKEN}`);
  console.log(`  Beta / R. Das  ${env.webBaseUrl}/portal/q/Q-1038?token=${DAS_PORTAL_TOKEN}`);
  console.log('  A link opens ONE quotation; a password login opens the whole company list.');
  console.log('\nApp URLs');
  log.rule();
  console.log(`  Web   ${env.webBaseUrl}`);
  console.log(`  API   http://localhost:${env.port}${env.apiBasePath}/health`);
}

const isEntry = process.argv[1]?.replace(/\\/g, '/').endsWith('seed/seed.ts');
if (isEntry) {
  (async () => {
    log.step(1, 'Connecting to MongoDB');
    await connectMongo();
    log.ok('connected');
    log.step(2, 'Building indexes');
    const idx = await syncAllIndexes();
    log.ok(`${idx.length} collections, ${idx.reduce((a, i) => a + i.indexes, 0)} indexes`);
    log.step(3, 'Seeding');
    const { counts } = await runSeed({
      keepConfig: process.argv.includes('--keep-config'),
      minimal: process.argv.includes('--minimal'),
    });
    printSummary(counts);
    await disconnectMongo();
    console.log('\nSeed complete.\n');
  })().catch(async (err) => {
    log.error(err);
    await disconnectMongo().catch(() => undefined);
    process.exit(1);
  });
}
