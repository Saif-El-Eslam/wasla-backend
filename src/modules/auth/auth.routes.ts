import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  loginController,
  logoutController,
  meController,
  registerController,
  resendOtpController,
  updateMeController,
  updatePasswordController,
  verifyOtpController,
} from './auth.controller';
import {
  loginSchema,
  registerSchema,
  resendOtpSchema,
  updateMeSchema,
  updatePasswordSchema,
  verifyOtpSchema,
} from './auth.schemas';

export const authRouter = Router();

authRouter.post('/register', validateRequest({ body: registerSchema }), registerController);
authRouter.post('/login', validateRequest({ body: loginSchema }), loginController);
authRouter.post('/verify-otp', validateRequest({ body: verifyOtpSchema }), verifyOtpController);
authRouter.post('/resend-otp', validateRequest({ body: resendOtpSchema }), resendOtpController);
authRouter.get('/me', requireAuth, meController);
authRouter.patch('/me', requireAuth, validateRequest({ body: updateMeSchema }), updateMeController);
authRouter.patch('/me/password', requireAuth, validateRequest({ body: updatePasswordSchema }), updatePasswordController);
authRouter.post('/logout', logoutController);
