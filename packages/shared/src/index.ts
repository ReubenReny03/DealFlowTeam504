/**
 * @dealflow/shared — the single source of truth for every type, enum and business
 * rule in DealFlow360. The API and the Angular app both import from here.
 * Nobody redefines any of this locally.
 */
export * from './enums/index.js';
export * from './types/index.js';
export * from './dto/index.js';
export * from './logic/index.js';
export * from './util/money.js';
export * from './util/dates.js';
export * from './util/ids.js';
export * from './constants.js';
export * from './realtime.js';
