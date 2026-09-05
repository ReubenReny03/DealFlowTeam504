import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of, delay } from 'rxjs';
import type { ApiResponse } from '@dealflow/shared';
import { environment } from '../../../environments/environment';
import { MOCK_RESPONSES } from './mock.data';

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/**
 * The single typed HTTP client. Every feature store goes through here.
 *
 * Two things happen in this file that happen nowhere else:
 *  1. the `{success, data, error, meta}` envelope is unwrapped, so callers only
 *     ever see `data`;
 *  2. when `environment.useMocks` is on, requests are answered from in-memory
 *     fixtures instead — which is how a frontend workstream keeps moving while
 *     its backend counterpart is still building.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  get<T>(path: string, params?: QueryParams): Observable<T> {
    if (environment.useMocks) return this.mock<T>('GET', path);
    return this.http
      .get<ApiResponse<T>>(`${this.base}${path}`, { params: toParams(params) })
      .pipe(map((r) => r.data as T));
  }

  /** Same as `get`, but keeps the `meta` block (pagination, counts). */
  getWithMeta<T>(path: string, params?: QueryParams): Observable<{ data: T; meta?: ApiResponse<T>['meta'] }> {
    if (environment.useMocks) return this.mock<T>('GET', path).pipe(map((data) => ({ data })));
    return this.http
      .get<ApiResponse<T>>(`${this.base}${path}`, { params: toParams(params) })
      .pipe(map((r) => ({ data: r.data as T, meta: r.meta })));
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    if (environment.useMocks) return this.mock<T>('POST', path);
    return this.http.post<ApiResponse<T>>(`${this.base}${path}`, body ?? {}).pipe(map((r) => r.data as T));
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    if (environment.useMocks) return this.mock<T>('PUT', path);
    return this.http.put<ApiResponse<T>>(`${this.base}${path}`, body ?? {}).pipe(map((r) => r.data as T));
  }

  patch<T>(path: string, body?: unknown): Observable<T> {
    if (environment.useMocks) return this.mock<T>('PATCH', path);
    return this.http.patch<ApiResponse<T>>(`${this.base}${path}`, body ?? {}).pipe(map((r) => r.data as T));
  }

  delete<T>(path: string): Observable<T> {
    if (environment.useMocks) return this.mock<T>('DELETE', path);
    return this.http.delete<ApiResponse<T>>(`${this.base}${path}`).pipe(map((r) => r.data as T));
  }

  private mock<T>(method: string, path: string): Observable<T> {
    const key = Object.keys(MOCK_RESPONSES).find((pattern) => new RegExp(pattern).test(path));
    const value = key ? MOCK_RESPONSES[key] : null;
    // A small delay keeps loading states honest while mocked.
    return of(value as T).pipe(delay(120));
  }
}

function toParams(params?: QueryParams): HttpParams {
  let out = new HttpParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    out = out.set(key, String(value));
  }
  return out;
}
