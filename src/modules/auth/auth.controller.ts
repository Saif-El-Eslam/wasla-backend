import { env } from '../../config/env';
import { asyncHandler } from '../../common/http/async-handler';
import { created, ok } from '../../common/http/response';
import {
  getCurrentUser,
  login,
  register,
  resendOtp,
  updateCurrentUser,
  updateCurrentUserPassword,
  verifyOtp,
} from './auth.service';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
};

export const registerController = asyncHandler(async (req, res) => {
  const result = await register(req.body);
  created(res, result);
});

export const loginController = asyncHandler(async (req, res) => {
  const result = await login(req.body);
  res.cookie(env.COOKIE_NAME, result.token, cookieOptions);
  ok(res, { user: result.user });
});

export const verifyOtpController = asyncHandler(async (req, res) => {
  const result = await verifyOtp(req.body);
  res.cookie(env.COOKIE_NAME, result.token, cookieOptions);
  ok(res, { user: result.user });
});

export const resendOtpController = asyncHandler(async (req, res) => {
  const result = await resendOtp(req.body);
  ok(res, result);
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
  res.clearCookie(env.COOKIE_NAME, cookieOptions);
  ok(res, { loggedOut: true });
});
