/** Screen 18's configuration. Everything downstream reads from this document. */
import { ApprovalChainConfig } from '../../db/models.js';
import { IDS } from '../ids.js';
import type { SeedContext } from '../context.js';
import { ProrationRule, Role, money } from '@dealflow/shared';

export async function seedConfig(_ctx: SeedContext): Promise<void> {
  await ApprovalChainConfig.create({
    _id: IDS.config,
    key: 'default',
    // Tier Discount Ceilings — Bronze 5% / Silver 10% / Gold 15%
    tierCeilings: { BRONZE: 5, SILVER: 10, GOLD: 15 },
    // Category Discount Ceilings — Hardware 15% / Services 10% / Subscription 5%
    categoryCeilings: { HARDWARE: 15, SERVICES: 10, SUBSCRIPTION: 5 },
    thresholds: {
      mediumMinScore: 1,
      highMinScore: 30,
      hardEscalationMaxSingleOver: 8,
      blendedWeight: 7,
      maxSingleWeight: 3,
    },
    // Approval chain matrix from screen 18.
    chains: {
      NONE: [],
      LOW: [],
      MEDIUM: [Role.SALES_MANAGER],
      HIGH: [Role.SALES_MANAGER, Role.FINANCE],
    },
    dealHealth: { stalledDays: 7, anomalyMultiplier: 2, anomalyAbsoluteCapPct: 25, trailingWindow: 20 },
    upsell: {
      coPurchaseWeight: 0.5,
      promotedWeight: 0.2,
      marginWeight: 0.3,
      minMarginThreshold: money(5),
      maxSuggestions: 3,
    },
    billing: {
      defaultProrationRule: ProrationRule.PRORATED,
      cancellationRule: ProrationRule.PRORATED,
      scheduleHorizon: 12,
      invoiceDueDays: 15,
    },
    updatedBy: 'seed',
  });
}
