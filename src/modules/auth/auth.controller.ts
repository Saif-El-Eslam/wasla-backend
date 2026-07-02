import { env } from '../../config/env';
import { asyncHandler } from '../../common/http/async-handler';
import { created, ok } from '../../common/http/response';
import type { CookieOptions } from 'express';
import {
  getCurrentUser,
  listAdminVerificationCodes,
  login,
  register,
  regenerateAdminVerificationCode,
  resendOtp,
  updateCurrentUser,
  updateCurrentUserPassword,
  verifyOtp,
} from './auth.service';

function sessionMaxAgeMs(expiresIn: string) {
  const match = expiresIn.trim().match(/^(\d+)(ms|s|m|h|d)?$/i);

  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? 's';
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
};

const sessionCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: sessionMaxAgeMs(env.JWT_EXPIRES_IN),
};

export const registerController = asyncHandler(async (req, res) => {
  const result = await register(req.body);
  created(res, result);
});

export const loginController = asyncHandler(async (req, res) => {
  const result = await login(req.body);
  res.cookie(env.COOKIE_NAME, result.token, sessionCookieOptions);
  ok(res, { user: result.user });
});

export const verifyOtpController = asyncHandler(async (req, res) => {
  const result = await verifyOtp(req.body);
  res.cookie(env.COOKIE_NAME, result.token, sessionCookieOptions);
  ok(res, { user: result.user });
});

export const resendOtpController = asyncHandler(async (req, res) => {
  const result = await resendOtp(req.body);
  ok(res, result);
});

export const listAdminVerificationCodesController = asyncHandler(async (req, res) => {
  ok(
    res,
    await listAdminVerificationCodes(req.user, {
      search: String(req.query.search ?? '').trim() || undefined,
    }),
  );
});

export const regenerateAdminVerificationCodeController = asyncHandler(async (req, res) => {
  ok(res, await regenerateAdminVerificationCode(req.user, String(req.params.userId)));
});

export const meController = asyncHandler(async (req, res) => {
  const user = await getCurrentUser(req.user);
  ok(res, { user });
});

export const updateMeController = asyncHandler(async (req, res) => {
  const user = await updateCurrentUser(req.user, req.body);
  ok(res, { user });
});

export const updatePasswordController = asyncHandler(async (req, res) => {
  const user = await updateCurrentUserPassword(req.user, req.body);
  ok(res, { user });
});

export const logoutController = asyncHandler(async (_req, res) => {
  res.clearCookie(env.COOKIE_NAME, baseCookieOptions);
  ok(res, { loggedOut: true });
});
