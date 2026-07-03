import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env, isAllowedCorsOrigin } from './config/env';
import { errorMiddleware } from './common/middleware/error.middleware';
import { i18nMiddleware } from './common/middleware/i18n.middleware';
import { notFoundMiddleware } from './common/middleware/not-found.middleware';
import { requestContextMiddleware } from './common/middleware/request-context.middleware';
import { requestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { apiRateLimit } from './common/middleware/rate-limit.middleware';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { adminAuthRouter, authRouter } from './modules/auth/auth.routes';
import { branchRouter } from './modules/branch/branch.routes';
import { extractionRouter } from './modules/extraction/extraction.routes';
import { financialRouter } from './modules/financial/financial.routes';
import { healthRouter } from './modules/health/health.routes';
import { menuRouter } from './modules/menu/menu.routes';
import { publicRouter } from './modules/publicMenu/public.routes';
import { qrRouter } from './modules/qr/qr.routes';
import {
  adminSubscriptionRouter,
  subscriptionRouter,
} from './modules/subscription/subscription.routes';
import { userRouter } from './modules/user/user.routes';
import { venueRouter } from './modules/venue/venue.routes';
import { imageUploadRouter } from './storage/image-upload.routes';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(requestContextMiddleware);
app.use(i18nMiddleware);
app.use(requestLoggerMiddleware);

const apiRouter = express.Router();
apiRouter.use(apiRateLimit); // Apply rate limiting to all API routes (overwriting specific rate limits for certain routes if needed)
apiRouter.use('/health', healthRouter);
apiRouter.use('/public', publicRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/admin/auth', adminAuthRouter);
apiRouter.use('/uploads', imageUploadRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/financial', financialRouter);
apiRouter.use('/subscription', subscriptionRouter);
apiRouter.use('/admin/subscriptions', adminSubscriptionRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/venue', venueRouter);
apiRouter.use('/branches', qrRouter);
apiRouter.use('/branches', branchRouter);
apiRouter.use('/branches', menuRouter);
apiRouter.use('/branches', extractionRouter);

app.use(`/${env.API_PREFIX}`, apiRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
