import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.middleware';
import {
  authenticatedRateLimit,
  authRateLimit,
  codeRateLimit,
} from '../../common/middleware/rate-limit.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  listAdminVerificationCodesController,
  loginController,
  logoutController,
  meController,
  registerController,
  regenerateAdminVerificationCodeController,
  resendOtpController,
  updateMeController,
  updatePasswordController,
  verifyOtpController,
} from './auth.controller';
import {
  adminVerificationQuerySchema,
  adminVerificationUserParamsSchema,
  loginSchema,
  registerSchema,
  resendOtpSchema,
  updateMeSchema,
  updatePasswordSchema,
  verifyOtpSchema,
} from './auth.schemas';

export const authRouter = Router();
export const adminAuthRouter = Router();

authRouter.post('/register', authRateLimit, codeRateLimit, validateRequest({ body: registerSchema }), registerController);
authRouter.post('/login', authRateLimit, validateRequest({ body: loginSchema }), loginController);
authRouter.post('/verify-otp', authRateLimit, codeRateLimit, validateRequest({ body: verifyOtpSchema }), verifyOtpController);
authRouter.post('/resend-otp', authRateLimit, codeRateLimit, validateRequest({ body: resendOtpSchema }), resendOtpController);
authRouter.get('/me', requireAuth, authenticatedRateLimit, meController);
authRouter.patch('/me', requireAuth, authenticatedRateLimit, validateRequest({ body: updateMeSchema }), updateMeController);
authRouter.patch(
  '/me/password',
  requireAuth,
  authenticatedRateLimit,
  validateRequest({ body: updatePasswordSchema }),
  updatePasswordController,
);
authRouter.post('/logout', logoutController);

adminAuthRouter.use(requireAuth, authenticatedRateLimit);
adminAuthRouter.get(
  '/verification-codes',
  validateRequest({ query: adminVerificationQuerySchema }),
  listAdminVerificationCodesController,
);
adminAuthRouter.post(
  '/users/:userId/verification-code/regenerate',
  validateRequest({ params: adminVerificationUserParamsSchema }),
  regenerateAdminVerificationCodeController,
);
