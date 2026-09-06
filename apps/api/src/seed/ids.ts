/**
 * Deterministic ObjectIds.
 *
 * Every seeded document gets a FIXED _id so that a reset produces byte-identical
 * data, cross-references never dangle, and a test can hard-code an id without
 * first querying for it. `fid('a1', 1)` -> 'a10001000000000000000000'.
 */
import { Types } from 'mongoose';

export function fid(group: string, n: number): Types.ObjectId {
  const hex = (group + String(n).padStart(4, '0')).padEnd(24, '0');
  return new Types.ObjectId(hex);
}

export const G = {
  USER: 'a1',
  CUSTOMER: 'a2',
  PRODUCT: 'a3',
  PRICELIST: 'a4',
  WAREHOUSE: 'a5',
  STOCK: 'a6',
  PLAN: 'a7',
  PAIRING: 'a8',
  CONFIG: 'a9',
  QUOTATION: 'b1',
  APPROVAL: 'b2',
  NEGOTIATION: 'b3',
  PORTAL: 'b4',
  ORDER: 'c1',
  FULFILLMENT: 'c2',
  SUBSCRIPTION: 'd1',
  INVOICE: 'd2',
  CREDITNOTE: 'd3',
  ALERT: 'e1',
  AUDIT: 'e2',
  NOTIFICATION: 'e3',
  HISTORY: 'f1',
} as const;

/* ---- Named ids used across more than one seed module ---- */
export const IDS = {
  users: {
    admin: fid(G.USER, 1),
    rao: fid(G.USER, 2),
    nair: fid(G.USER, 3),
    shah: fid(G.USER, 4),
    iyer: fid(G.USER, 5),
    priya: fid(G.USER, 6),
    das: fid(G.USER, 7),
    /** A deactivated former rep. Not a demo login — see users.seed.ts. */
    bose: fid(G.USER, 8),
  },
  customers: {
    acme: fid(G.CUSTOMER, 1),
    beta: fid(G.CUSTOMER, 2),
    delta: fid(G.CUSTOMER, 3),
    novus: fid(G.CUSTOMER, 4),
    zenith: fid(G.CUSTOMER, 5),
    orion: fid(G.CUSTOMER, 6),
  },
  priceLists: {
    bronze: fid(G.PRICELIST, 1),
    silver: fid(G.PRICELIST, 2),
    gold: fid(G.PRICELIST, 3),
  },
  products: {
    laptop: fid(G.PRODUCT, 1),
    setup: fid(G.PRODUCT, 2),
    dock: fid(G.PRODUCT, 3),
    warranty: fid(G.PRODUCT, 4),
    mouse: fid(G.PRODUCT, 5),
    carePlan2yr: fid(G.PRODUCT, 6),
    supportSla: fid(G.PRODUCT, 7),
    carePlan3yr: fid(G.PRODUCT, 8),
    carePlan1yr: fid(G.PRODUCT, 9),
    laptop13Eol: fid(G.PRODUCT, 10),
  },
  warehouses: { main: fid(G.WAREHOUSE, 1), east: fid(G.WAREHOUSE, 2) },
  plans: {
    carePlan2yr: fid(G.PLAN, 1),
    supportSla: fid(G.PLAN, 2),
    carePlan1yr: fid(G.PLAN, 3),
    carePlan3yr: fid(G.PLAN, 4),
  },
  quotations: {
    q1042: fid(G.QUOTATION, 1042),
    q1041: fid(G.QUOTATION, 1041),
    q1039: fid(G.QUOTATION, 1039),
    /* Beta Industries' back catalogue — one company, several quotations. */
    q1038: fid(G.QUOTATION, 1038),
    q1033: fid(G.QUOTATION, 1033),
    q1029: fid(G.QUOTATION, 1029),
    q1035: fid(G.QUOTATION, 1035),
    q1030: fid(G.QUOTATION, 1030),
    q1044: fid(G.QUOTATION, 1044),
    q1045: fid(G.QUOTATION, 1045),
    q1046: fid(G.QUOTATION, 1046),
    q1047: fid(G.QUOTATION, 1047),
    q1036: fid(G.QUOTATION, 1036),
  },
  orders: {
    acmePrior: fid(G.ORDER, 1041),
    zenith: fid(G.ORDER, 1032),
    novus: fid(G.ORDER, 1036),
  },
  config: fid(G.CONFIG, 1),
} as const;
