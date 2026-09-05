/**
 * Loads the singleton governance configuration and adapts it to the shape the
 * shared pure functions expect. Every module that scores risk goes through here,
 * so there is exactly one place where configuration becomes behaviour.
 */
import type { RiskConfig } from '@dealflow/shared';
import { ApprovalChainConfig } from '../../db/models.js';
import { notFound } from '../../utils/apiError.js';

export async function loadConfig(): Promise<any> {
  const doc = await ApprovalChainConfig.findOne({ key: 'default' });
  if (!doc) {
    throw notFound(
      'Discount governance is not configured. An admin must save screen 18 (or run `npm run reset`) before quotations can be scored.',
    );
  }
  return doc;
}

function mapToObject(map: any): Record<string, any> {
  if (!map) return {};
  if (map instanceof Map) return Object.fromEntries(map.entries());
  return { ...map };
}

export function toRiskConfig(doc: any): RiskConfig {
  return {
    tierCeilings: mapToObject(doc.tierCeilings) as RiskConfig['tierCeilings'],
    categoryCeilings: mapToObject(doc.categoryCeilings) as RiskConfig['categoryCeilings'],
    thresholds: doc.thresholds ? { ...doc.thresholds.toObject?.() ?? doc.thresholds } : undefined,
    chains: mapToObject(doc.chains) as RiskConfig['chains'],
  };
}

export async function loadRiskConfig(): Promise<RiskConfig> {
  return toRiskConfig(await loadConfig());
}
