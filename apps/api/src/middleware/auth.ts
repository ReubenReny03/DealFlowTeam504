import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { PORTAL_TOKEN_HEADER, type Role } from '@dealflow/shared';
import { env } from '../config/env.js';
import { PortalToken, User } from '../db/models.js';
import { forbidden, portalTokenExpired, portalTokenInvalid, unauthenticated } from '../utils/apiError.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  customerId?: string;
}

export interface PortalContext {
  token: string;
  quotationId: string;
  customerId: string;
  userId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      portal?: PortalContext;
    }
  }
}

export interface JwtPayload {
  sub: string;
  role: Role;
  name: string;
  email: string;
  customerId?: string;
}

export function signToken(payload: JwtPayload): { token: string; expiresAt: string } {
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
  const decoded = jwt.decode(token) as { exp: number };
  return { token, expiresAt: new Date(decoded.exp * 1000).toISOString() };
}

/** Attach `req.user` when a valid Bearer token is present. Never throws. */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret) as JwtPayload;
    req.user = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      customerId: payload.customerId,
    };
  } catch {
    /* an invalid token is simply "not logged in"; requireAuth turns it into a 401 */
  }
  next();
}

/**
 * Gate a route on authentication and, optionally, on a set of roles.
 * `requireAuth()` = any logged-in user. `requireAuth([Role.FINANCE])` = Finance only.
 *
 * A valid signature is NOT the same as a valid account, so every guarded request
 * re-reads the user. A JWT is a bearer token we cannot recall: without this, an
 * account deactivated on the admin Users screen keeps working until its token
 * expires, and a demoted user keeps the rights their old token was minted with.
 * The role enforced below is therefore the one in the database, not the one in
 * the token — one indexed lookup per request, which is the price of being able
 * to revoke access at all.
 */
export function requireAuth(roles?: Role[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) return next(unauthenticated());
    try {
      const account: any = await User.findById(req.user.id).select('role active customerId name email').lean();
      if (!account || account.active === false) {
        return next(unauthenticated('Your account is no longer active. Please sign in again.'));
      }
      // The token is a snapshot; the row is the truth.
      req.user = {
        id: String(account._id),
        name: account.name,
        email: account.email,
        role: account.role,
        customerId: account.customerId ? String(account.customerId) : undefined,
      };
      if (roles && roles.length > 0 && !roles.includes(req.user.role)) {
        return next(
          forbidden(`This action requires one of: ${roles.join(', ')}. You are signed in as ${req.user.role}.`),
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * The customer portal's own guard. Accepts EITHER a magic-link token in the
 * X-Portal-Token header, OR a logged-in CUSTOMER user whose customerId matches
 * the quotation. Internal JWTs never satisfy this guard, and a portal token can
 * only ever unlock the single quotation it was minted for.
 */
export async function requirePortalToken(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = (req.headers[PORTAL_TOKEN_HEADER] as string | undefined) ?? (req.query.token as string | undefined);

    if (raw) {
      const record = await PortalToken.findOne({ token: raw });
      if (!record || record.revoked) return next(portalTokenInvalid());
      if (record.expiresAt.getTime() < Date.now()) return next(portalTokenExpired());
      record.lastUsedAt = new Date();
      await record.save();
      req.portal = {
        token: raw,
        quotationId: String(record.quotationId),
        customerId: String(record.customerId),
        userId: String(record.userId),
      };
      return next();
    }

    // Password-login path: a CUSTOMER user is scoped to their own company only.
    if (req.user?.role === 'CUSTOMER' && req.user.customerId) {
      const user: any = await User.findById(req.user.id).lean();
      if (!user || !user.active) return next(unauthenticated());
      req.portal = {
        token: '',
        quotationId: '',
        customerId: String(req.user.customerId),
        userId: String(req.user.id),
      };
      return next();
    }

    next(portalTokenInvalid('A portal link or a customer login is required to view this quotation.'));
  } catch (err) {
    next(err);
  }
}

/**
 * The negative-auth test lives here: R. Das (Beta Industries) must never resolve
 * a quotation belonging to Acme Corp, whether by guessing the URL or by reusing
 * Priya's link under his own login.
 */
export function assertPortalScope(req: Request, quotation: { id?: string; _id?: unknown; customerId: unknown }): void {
  const portal = req.portal;
  if (!portal) throw portalTokenInvalid();
  const quotationId = String(quotation.id ?? quotation._id);
  if (portal.quotationId && portal.quotationId !== quotationId) {
    throw forbidden('This link does not grant access to that quotation.');
  }
  if (String(quotation.customerId) !== String(portal.customerId)) {
    throw forbidden('This quotation belongs to a different company.');
  }
}
