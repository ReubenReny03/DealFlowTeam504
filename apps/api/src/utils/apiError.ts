import { ErrorCode } from '@dealflow/shared';

/** Every failure the API produces on purpose is one of these. */
export class ApiException extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiException';
  }
}

export const badRequest = (m: string, d?: unknown) => new ApiException(400, ErrorCode.VALIDATION_ERROR, m, d);
export const unauthenticated = (m = 'Authentication required') => new ApiException(401, ErrorCode.UNAUTHENTICATED, m);
export const forbidden = (m = 'You do not have access to this resource') => new ApiException(403, ErrorCode.FORBIDDEN, m);
export const notFound = (m = 'Not found') => new ApiException(404, ErrorCode.NOT_FOUND, m);
export const conflict = (m: string, d?: unknown) => new ApiException(409, ErrorCode.CONFLICT, m, d);
export const staleVersion = (m = 'This record changed while you were editing it. Reload and try again.') =>
  new ApiException(409, ErrorCode.STALE_VERSION, m);
export const insufficientStock = (m: string, d?: unknown) => new ApiException(409, ErrorCode.INSUFFICIENT_STOCK, m, d);
export const invalidState = (m: string, d?: unknown) => new ApiException(409, ErrorCode.INVALID_STATE, m, d);
export const portalTokenInvalid = (m = 'This quotation link is not valid.') =>
  new ApiException(403, ErrorCode.PORTAL_TOKEN_INVALID, m);
export const portalTokenExpired = (m = 'This quotation link has expired. Ask your account manager for a new one.') =>
  new ApiException(403, ErrorCode.PORTAL_TOKEN_EXPIRED, m);
