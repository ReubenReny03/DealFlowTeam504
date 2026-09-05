import bcrypt from 'bcryptjs';
import { LANDING_ROUTE, Role, type AuthSessionDto, type UserDto } from '@dealflow/shared';
import { env } from '../../config/env.js';
import { PortalToken, User } from '../../db/models.js';
import { signToken } from '../../middleware/auth.js';
import { badRequest, unauthenticated } from '../../utils/apiError.js';
import { toDto } from '../../utils/serialize.js';

export function toUserDto(doc: any): UserDto {
  const dto = toDto<any>(doc);
  delete dto.passwordHash;
  return { ...dto, landingRoute: LANDING_ROUTE[dto.role as Role] ?? '/app/dashboard' };
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

  // A customer landing straight on their live quotation is the whole point of
  // the portal, so hand the UI the quotation their most recent link points at.
  if (user.role === Role.CUSTOMER) {
    const portal = await PortalToken.findOne({ customerId: user.customerId, revoked: false })
      .sort({ createdAt: -1 })
      .lean();
    if (portal) session.portalQuotationId = String((portal as any).quotationId);
  }
  return session;
}

export async function signup(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  customerId?: string;
}): Promise<AuthSessionDto> {
  const email = input.email.toLowerCase().trim();
  if (await User.exists({ email })) throw badRequest('An account with that email already exists.');
  if (input.role === Role.CUSTOMER && !input.customerId) {
    throw badRequest('A customer account must be linked to a company.');
  }
  const passwordHash = await bcrypt.hash(input.password, env.bcryptRounds);
  const user = await User.create({
    name: input.name,
    email,
    passwordHash,
    role: input.role,
    customerId: input.customerId,
    active: true,
  });
  const { token, expiresAt } = signToken({
    sub: String(user._id),
    role: user.role,
    name: user.name,
    email: user.email,
    customerId: user.customerId ? String(user.customerId) : undefined,
  });
  return { token, expiresAt, user: toUserDto(user) };
}
