/**
 * THE SINGLE SOURCE OF TRUTH FOR DEMO CREDENTIALS.
 *
 * `docs/CREDENTIALS.md`, the README credentials table, the reset script's summary
 * block and the login screen's "Demo accounts" panel are ALL generated from
 * DEMO_ACCOUNTS below. Nothing is ever hand-copied, so nothing can drift.
 *
 * These are deliberately uniform hackathon demo credentials. In production they
 * would be replaced by a real credential policy — see docs/DECISIONS.md D-009.
 */
import bcrypt from 'bcryptjs';
import { LANDING_ROUTE, Role, type DemoAccountDto } from '@dealflow/shared';
import { env } from '../config/env.js';
import { User } from '../db/models.js';
import { IDS } from './ids.js';
import type { SeedContext } from './context.js';

export interface DemoAccount extends DemoAccountDto {
  id: string;
  customerId?: string;
}

/** Every persona in the product, with the account a judge can log in with. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: String(IDS.users.admin),
    label: 'Admin',
    name: 'A. Verma',
    email: 'admin@dealflow360.test',
    password: env.demoPassword,
    role: Role.ADMIN,
    landingRoute: LANDING_ROUTE.ADMIN,
    description: 'Configures products, price lists, discount ceilings, warehouses and subscription plans.',
  },
  {
    id: String(IDS.users.rao),
    label: 'Sales Rep',
    name: 'J. Rao',
    email: 'rep@dealflow360.test',
    password: env.demoPassword,
    role: Role.SALES_REP,
    landingRoute: LANDING_ROUTE.SALES_REP,
    description: 'Builds Q-1042, applies the discounts and submits it for approval.',
  },
  {
    id: String(IDS.users.nair),
    label: 'Sales Rep 2',
    name: 'S. Nair',
    email: 'rep2@dealflow360.test',
    password: env.demoPassword,
    role: Role.SALES_REP,
    landingRoute: LANDING_ROUTE.SALES_REP,
    description: 'A second rep, so the discount-anomaly rule has another trailing average to compare against.',
  },
  {
    id: String(IDS.users.shah),
    label: 'Sales Manager',
    name: 'M. Shah',
    email: 'manager@dealflow360.test',
    password: env.demoPassword,
    role: Role.SALES_MANAGER,
    landingRoute: LANDING_ROUTE.SALES_MANAGER,
    description: 'First approver. Returns Q-1042 for revision, then approves it. Watches Deal Health.',
  },
  {
    id: String(IDS.users.iyer),
    label: 'Finance',
    name: 'K. Iyer',
    email: 'finance@dealflow360.test',
    password: env.demoPassword,
    role: Role.FINANCE,
    landingRoute: LANDING_ROUTE.FINANCE,
    description: 'Second approver on HIGH-risk quotes. Records payments and manages subscriptions.',
  },
  {
    id: String(IDS.users.priya),
    label: 'Customer — Acme Corp',
    name: 'Priya Menon',
    email: 'priya@acmecorp.test',
    password: env.demoPassword,
    role: Role.CUSTOMER,
    landingRoute: LANDING_ROUTE.CUSTOMER,
    customerId: String(IDS.customers.acme),
    description: 'Negotiates Q-1042 from the portal and confirms it.',
  },
  {
    id: String(IDS.users.das),
    label: 'Customer — Beta Industries',
    name: 'R. Das',
    email: 'das@betaindustries.test',
    password: env.demoPassword,
    role: Role.CUSTOMER,
    landingRoute: LANDING_ROUTE.CUSTOMER,
    customerId: String(IDS.customers.beta),
    description: 'Exists to prove the negative auth test: he cannot open Acme Corp\'s quotation.',
  },
];

/** Trailing average discount % per rep — the baseline the anomaly rule compares against. */
export const REP_TRAILING_AVG: Record<string, number> = {
  [String(IDS.users.rao)]: 8,
  [String(IDS.users.nair)]: 11,
};

export async function seedUsers(_ctx: SeedContext): Promise<void> {
  const passwordHash = await bcrypt.hash(env.demoPassword, env.bcryptRounds);
  await User.insertMany(
    DEMO_ACCOUNTS.map((a) => ({
      _id: a.id,
      name: a.name,
      email: a.email,
      passwordHash,
      role: a.role,
      customerId: a.customerId,
      active: true,
      trailingAvgDiscountPct: REP_TRAILING_AVG[a.id] ?? 0,
    })),
  );
}

/** Rendered by the reset script, the seed and `npm run docs:credentials`. */
export function credentialsTable(): string {
  const rows = DEMO_ACCOUNTS.map((a) => [a.label, a.name, a.email, a.password, a.role, a.landingRoute]);
  const headers = ['Persona', 'Name', 'Email', 'Password', 'Role', 'Lands on'];
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
  return [
    line(headers),
    '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|',
    ...rows.map(line),
  ].join('\n');
}

/** Markdown version for docs/CREDENTIALS.md and README.md. */
export function credentialsMarkdown(): string {
  const head = '| Persona | Name | Email | Password | Role | Lands on |\n|---|---|---|---|---|---|';
  const body = DEMO_ACCOUNTS.map(
    (a) => `| ${a.label} | ${a.name} | \`${a.email}\` | \`${a.password}\` | \`${a.role}\` | ${a.landingRoute} |`,
  ).join('\n');
  return `${head}\n${body}`;
}
