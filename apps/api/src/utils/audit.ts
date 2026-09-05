/**
 * Audit trail writer. NON-NEGOTIABLE: every approval, rejection, edit, discount
 * change, override and negotiation event goes through here.
 */
import type { AuditEntity, Role } from '@dealflow/shared';
import { AuditLog } from '../db/models.js';
import { oid } from './serialize.js';

export interface AuditActor {
  id: string;
  name: string;
  role: Role;
}

export interface AuditInput {
  actor: AuditActor;
  action: string;
  entity: AuditEntity;
  entityId: string;
  entityLabel?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  at?: Date;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  await AuditLog.create({
    actor: input.actor.name,
    actorId: oid(input.actor.id),
    role: input.actor.role,
    action: input.action,
    entity: input.entity,
    entityId: oid(input.entityId),
    entityLabel: input.entityLabel,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? '',
    timestamp: input.at ?? new Date(),
  });
}

/** Shallow diff, so the audit `before`/`after` stay small and readable. */
export function diff<T extends Record<string, any>>(before: T, after: T, keys: (keyof T)[]) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of keys) {
    if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) {
      b[k as string] = before?.[k];
      a[k as string] = after?.[k];
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
