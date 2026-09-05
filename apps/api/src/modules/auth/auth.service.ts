import bcrypt from 'bcryptjs';
import { LANDING_ROUTE, QuoteStage, Role, type AuthSessionDto, type UserDto } from '@dealflow/shared';
import { env } from '../../config/env.js';
import { PortalToken, Quotation, User } from '../../db/models.js';
import { signToken } from '../../middleware/auth.js';
import { badRequest, unauthenticated } from '../../utils/apiError.js';
import { toDto } from '../../utils/serialize.js';

export function toUserDto(doc: any): UserDto {
  const dto = toDto<any>(doc);
  delete dto.passwordHash;
  return {
    ...dto,
    // Always a boolean on the wire: the UI branches on it right after login, and
    // an older row that predates the field has simply never been reset.
    mustChangePassword: dto.mustChangePassword === true,
    landingRoute: LANDING_ROUTE[dto.role as Role] ?? '/app/dashboard',
  };
}

/**
 * The account holder setting their own password.
 *
 * Requires the current one — an Admin reset (PATCH /users/:id) is the path that
 * does not, because an Admin resetting a forgotten password does not have it.
 * Clearing `mustChangePassword` here is the whole point: it is what makes the
 * first-sign-in prompt stop appearing.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<UserDto> {
  const user = await User.findById(userId);
  if (!user || !user.active) throw unauthenticated();

  const okPassword = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!okPassword) throw badRequest('That is not your current password.');
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw badRequest('Your new password must be different from the current one.');
  }

  user.passwordHash = await bcrypt.hash(newPassword, env.bcryptRounds);
  user.mustChangePassword = false;
  await user.save();
  return toUserDto(user);
}

export async function login(email: string, password: string): Promise<AuthSessionDto> {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  // Same message either way: never leak which half of the pair was wrong.
  if (!user || !user.active) throw unauthenticated('Email or password is incorrect.');
  const okPassword = await bcrypt.compare(password, user.passwordHash);
  if (!okPassword) throw unauthenticated('Email or password is incorrect.');

  const { token, expiresAt } = signToken({
    sub: String(user._id),
    role: user.role,
    name: user.name,
    email: user.email,
    customerId: user.customerId ? String(user.customerId) : undefined,
  });

  const session: AuthSessionDto = { token, expiresAt, user: toUserDto(user) };

  // A customer landing straight on a live quotation is the whole point of the
  // portal, so hand the UI one to open. Their most recent magic link wins; with
  // no live link we fall back to the company's most recently active quotation,
  // because a company has many and the portal must not dead-end on none of them.
  if (user.role === Role.CUSTOMER) {
    const portal = await PortalToken.findOne({ customerId: user.customerId, revoked: false })
      .sort({ createdAt: -1 })
      .lean();
    if (portal) {
      session.portalQuotationId = String((portal as any).quotationId);
    } else {
      const latest = await Quotation.findOne({
        customerId: user.customerId,
        stage: { $ne: QuoteStage.DRAFT },
      })
        .sort({ lastActivityAt: -1, createdAt: -1 })
        .select({ _id: 1 })
        .lean();
      if (latest) session.portalQuotationId = String((latest as any)._id);
    }
  }
  return session;
}
