/**
 * The search-and-pagination contract every list endpoint honours.
 *
 * `?q=` searches, `?page=` and `?pageSize=` page, and the response `meta` always
 * carries `{page, pageSize, total, totalPages}` so the UI's paginator never has
 * to guess. Parsing it once here is what keeps "page 0", "pageSize=100000" and
 * a regex-injecting search term from being re-handled — or forgotten — per module.
 */
import type { Request } from 'express';

export interface ListParams {
  page: number;
  pageSize: number;
  skip: number;
  /** Trimmed search term, or undefined when the box is empty. */
  q?: string;
}

/** Escapes a user's search term so `.` and `*` match literally, never as regex. */
export function searchRegex(q: string): { $regex: string; $options: string } {
  return { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
}

/**
 * A `$or` across the given fields, or `null` when there is nothing to search.
 * Returning null (rather than an empty `$or`, which matches nothing in Mongo)
 * is what lets callers spread it into a filter unconditionally.
 */
export function searchFilter(q: string | undefined, fields: string[]): Record<string, unknown> | null {
  if (!q || fields.length === 0) return null;
  const term = searchRegex(q);
  return { $or: fields.map((field) => ({ [field]: term })) };
}

export function listParams(
  query: Request['query'],
  { defaultPageSize = 25, maxPageSize = 200, prefix = '' } = {},
): ListParams {
  const key = (name: string) => (prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name);
  const rawPage = Number(query[key('page')] ?? 1);
  const rawSize = Number(query[key('pageSize')] ?? defaultPageSize);
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const pageSize = Number.isFinite(rawSize)
    ? Math.min(maxPageSize, Math.max(1, Math.floor(rawSize)))
    : defaultPageSize;
  const raw = query[key('q')];
  const q = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined;
  return { page, pageSize, skip: (page - 1) * pageSize, q };
}

/**
 * Appends `_id` to a sort so the ordering is TOTAL.
 *
 * Mongo's skip/limit is only stable over a total order. Sorting a paged query by
 * a non-unique key alone — `lastActivityAt`, `name`, `submittedAt` — lets tied
 * documents move between pages, so page 2 can repeat a row from page 1 and
 * silently drop another. Every paged query goes through here.
 */
export function stableSort(sort: Record<string, 1 | -1>): Record<string, 1 | -1> {
  return '_id' in sort ? sort : { ...sort, _id: 1 };
}

/** The pagination block for `meta`. Mirrors `paginate()` without the empty items array. */
export function pageMeta(params: ListParams, total: number) {
  return {
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}
