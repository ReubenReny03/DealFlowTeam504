/** The response envelope every endpoint returns. Non-negotiable. */
import type { ErrorCode } from '../enums/index.js';

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface ApiMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta?: ApiMeta;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const API_BASE = '/api/v1';
export const PORTAL_TOKEN_HEADER = 'x-portal-token';
