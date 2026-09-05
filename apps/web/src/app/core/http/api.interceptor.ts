import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { PORTAL_TOKEN_HEADER } from '@dealflow/shared';
import { SessionStore } from '../state/session.store';
import { ToastStore } from '../state/toast.store';

/**
 * Attaches credentials, turns API errors into a toast, and handles 401/403.
 *
 * A portal request carries X-Portal-Token; every other request carries the JWT.
 * They are never sent together — the portal is a separate surface, and mixing
 * the two would blur exactly the boundary the product is meant to enforce.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionStore);
  const toast = inject(ToastStore);
  const router = inject(Router);

  const isPortalCall = req.url.includes('/portal/');
  const portalToken = session.portalToken();
  const jwt = session.token();

  let headers = req.headers;
  if (isPortalCall && portalToken) {
    headers = headers.set(PORTAL_TOKEN_HEADER, portalToken);
  } else if (jwt) {
    headers = headers.set('Authorization', `Bearer ${jwt}`);
  }

  return next(req.clone({ headers })).pipe(
    catchError((err: HttpErrorResponse) => {
      const apiError = err.error?.error as { code?: string; message?: string } | undefined;
      const message = apiError?.message ?? err.message ?? 'Something went wrong.';

      if (err.status === 0) {
        toast.error(
          'Cannot reach the server',
          'The API is not responding. Check that `npm run dev:api` is running, or switch on mock mode in environment.ts.',
        );
      } else if (err.status === 401) {
        // Remember where they were, so signing in again returns them to it
        // rather than dumping them on their landing screen (USER_FLOWS §E13).
        const from = router.url;
        session.logout(false);
        void router.navigate(['/login'], {
          queryParams: {
            reason: 'expired',
            ...(from && !from.startsWith('/login') ? { redirect: from } : {}),
          },
        });
        toast.error('Your session has ended', 'Please sign in again.');
      } else if (err.status === 403) {
        toast.error('Not allowed', message);
      } else if (err.status >= 500) {
        toast.error('Server error', message);
      } else if (err.status === 409 && apiError?.code === 'STALE_VERSION') {
        // The caller (the quotation builder) owns this one — it shows a proper
        // "reload the latest version" dialog rather than a transient toast.
      } else if (err.status !== 404) {
        toast.error('That did not work', message);
      }

      return throwError(() => err);
    }),
  );
};
