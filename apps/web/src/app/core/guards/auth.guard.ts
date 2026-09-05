import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { Role } from '@dealflow/shared';
import { SessionStore } from '../state/session.store';
import { ToastStore } from '../state/toast.store';

/** Must be signed in. */
export const authGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (session.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};

/**
 * Must be signed in AND hold one of the listed roles.
 * A rep who types /app/approvals into the address bar is bounced with an
 * explanation rather than shown an empty screen — see docs/USER_FLOWS.md §E.
 */
export function roleGuard(roles: Role[]): CanActivateFn {
  return (_route, state) => {
    const session = inject(SessionStore);
    const router = inject(Router);
    const toast = inject(ToastStore);

    if (!session.isAuthenticated()) {
      return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
    }
    const role = session.role();
    if (role && roles.includes(role)) return true;

    toast.error(
      'You do not have access to that screen',
      `That area is limited to ${roles.join(', ')}. You are signed in as ${role}.`,
    );
    return router.createUrlTree([session.landingRoute()]);
  };
}

/** Internal users only — the portal is never an internal screen. */
export const internalGuard: CanActivateFn = (route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (!session.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
  }
  if (session.role() === Role.CUSTOMER) return router.createUrlTree(['/portal']);
  return true;
};

/**
 * The portal guard. Accepts a `?token=` magic link (which it stashes for the
 * interceptor) or a signed-in CUSTOMER. An internal user is sent back to the
 * internal app: the portal is deliberately not reachable from inside.
 */
export const portalGuard: CanActivateFn = (route) => {
  const session = inject(SessionStore);
  const router = inject(Router);

  const token = route.queryParamMap.get('token');
  if (token) {
    session.setPortalToken(token);
    return true;
  }
  if (session.portalToken()) return true;
  if (session.isAuthenticated() && session.role() === Role.CUSTOMER) return true;
  if (session.isAuthenticated()) return router.createUrlTree(['/app/dashboard']);
  return router.createUrlTree(['/login'], { queryParams: { reason: 'portal' } });
};
