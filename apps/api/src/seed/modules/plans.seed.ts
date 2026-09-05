/** Recurring plans that can be attached to subscription products (screen 9/10). */
import { BillingCycle, ProrationRule, money } from '@dealflow/shared';
import { SubscriptionPlan } from '../../db/models.js';
import { IDS } from '../ids.js';
import type { SeedContext } from '../context.js';

export async function seedSubscriptionPlans(_ctx: SeedContext): Promise<void> {
  await SubscriptionPlan.insertMany([
    {
      _id: IDS.plans.carePlan2yr, name: 'Care Plan 2yr', productId: IDS.products.carePlan2yr,
      cycle: BillingCycle.MONTHLY, amount: money(46),
      prorationRule: ProrationRule.PRORATED, cancellationRule: ProrationRule.PRORATED,
    },
    {
      _id: IDS.plans.supportSla, name: 'Support SLA', productId: IDS.products.supportSla,
      cycle: BillingCycle.QUARTERLY, amount: money(300),
      prorationRule: ProrationRule.PRORATED, cancellationRule: ProrationRule.FULL_PERIOD,
    },
    {
      _id: IDS.plans.carePlan1yr, name: 'Care Plan 1yr', productId: IDS.products.carePlan1yr,
      cycle: BillingCycle.MONTHLY, amount: money(28),
      prorationRule: ProrationRule.PRORATED, cancellationRule: ProrationRule.PRORATED,
    },
    {
      _id: IDS.plans.carePlan3yr, name: 'Care Plan 3 years', productId: IDS.products.carePlan3yr,
      cycle: BillingCycle.MONTHLY, amount: money(40),
      prorationRule: ProrationRule.PRORATED, cancellationRule: ProrationRule.PRORATED,
    },
  ]);
}
