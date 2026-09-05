/**
 * Mongo document -> wire DTO.
 * One place, so `_id` always becomes `id`, ObjectIds always become strings,
 * Dates always become ISO-8601 UTC strings, and Maps always become plain objects.
 */
import { Types } from 'mongoose';

function convert(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) out[String(k)] = convert(v);
    return out;
  }
  if (Array.isArray(value)) return value.map(convert);
  if (typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k === '__v') continue;
      if (k === '_id') {
        out.id = convert(v);
        continue;
      }
      out[k] = convert(v);
    }
    return out;
  }
  return value;
}

export function toDto<T = any>(doc: unknown): T {
  if (doc === null || doc === undefined) return doc as T;
  const plain =
    typeof (doc as any)?.toObject === 'function'
      ? (doc as any).toObject({ flattenMaps: false, depopulate: true })
      : doc;
  return convert(plain) as T;
}

export function toDtoList<T = any>(docs: unknown[]): T[] {
  return docs.map((d) => toDto<T>(d));
}

export function oid(id: string | Types.ObjectId): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && Types.ObjectId.isValid(id);
}
