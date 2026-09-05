/** Price lists (screen 17) and the six customers from the Kanban board (screen 3). */
import { Currency, CustomerTier, PriceRuleType } from '@dealflow/shared';
import { Customer, PriceList } from '../../db/models.js';
import { IDS } from '../ids.js';
import type { SeedContext } from '../context.js';

export async function seedPriceListsAndCustomers(_ctx: SeedContext): Promise<void> {
  await PriceList.insertMany([
    {
      _id: IDS.priceLists.bronze,
      name: 'Bronze',
      tier: CustomerTier.BRONZE,
      currencies: [Currency.USD],
      ruleType: PriceRuleType.NONE,
      ruleValue: 0,
      entries: [],
    },
    {
      _id: IDS.priceLists.silver,
      name: 'Silver',
      tier: CustomerTier.SILVER,
      currencies: [Currency.USD],
      ruleType: PriceRuleType.PERCENT_OFF_BASE,
      ruleValue: 5,
      entries: [],
    },
    {
      // "Gold / USD, EUR / price minus 10 percent base"
      _id: IDS.priceLists.gold,
      name: 'Gold',
      tier: CustomerTier.GOLD,
      currencies: [Currency.USD, Currency.EUR],
      ruleType: PriceRuleType.PERCENT_OFF_BASE,
      ruleValue: 10,
      entries: [],
    },
  ]);

  await Customer.insertMany([
    {
      _id: IDS.customers.acme, name: 'Acme Corp', tier: CustomerTier.GOLD,
      currency: Currency.USD, priceListId: IDS.priceLists.gold,
      contactName: 'Priya Menon', contactEmail: 'priya@acmecorp.test', ownerId: IDS.users.rao,
    },
    {
      _id: IDS.customers.beta, name: 'Beta Industries', tier: CustomerTier.SILVER,
      currency: Currency.USD, priceListId: IDS.priceLists.silver,
      contactName: 'R. Das', contactEmail: 'das@betaindustries.test', ownerId: IDS.users.nair,
    },
    {
      _id: IDS.customers.delta, name: 'Delta LLC', tier: CustomerTier.BRONZE,
      currency: Currency.USD, priceListId: IDS.priceLists.bronze,
      contactName: 'H. Kaur', contactEmail: 'ops@deltallc.test', ownerId: IDS.users.rao,
    },
    {
      _id: IDS.customers.novus, name: 'Novus Retail', tier: CustomerTier.SILVER,
      currency: Currency.USD, priceListId: IDS.priceLists.silver,
      contactName: 'T. Fernandes', contactEmail: 'buying@novusretail.test', ownerId: IDS.users.nair,
    },
    {
      _id: IDS.customers.zenith, name: 'Zenith Co', tier: CustomerTier.GOLD,
      currency: Currency.USD, priceListId: IDS.priceLists.gold,
      contactName: 'A. Bose', contactEmail: 'procurement@zenithco.test', ownerId: IDS.users.rao,
    },
    {
      _id: IDS.customers.orion, name: 'Orion Ltd', tier: CustomerTier.GOLD,
      currency: Currency.USD, priceListId: IDS.priceLists.gold,
      contactName: 'M. Fontaine', contactEmail: 'orders@orionltd.test', ownerId: IDS.users.nair,
    },
  ]);
}
