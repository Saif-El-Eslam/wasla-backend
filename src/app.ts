import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOrigins, env } from './config/env';
import { errorMiddleware } from './common/middleware/error.middleware';
import { i18nMiddleware } from './common/middleware/i18n.middleware';
import { notFoundMiddleware } from './common/middleware/not-found.middleware';
import { requestContextMiddleware } from './common/middleware/request-context.middleware';
import { requestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { authRouter } from './modules/auth/auth.routes';
import { branchRouter } from './modules/branch/branch.routes';
import { extractionRouter } from './modules/extraction/extraction.routes';
import { healthRouter } from './modules/health/health.routes';
import { menuRouter } from './modules/menu/menu.routes';
import { publicRouter } from './modules/publicMenu/public.routes';
import { userRouter } from './modules/user/user.routes';
import { venueRouter } from './modules/venue/venue.routes';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(requestContextMiddleware);
app.use(i18nMiddleware);
app.use(requestLoggerMiddleware);

const apiRouter = express.Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/public', publicRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/venue', venueRouter);
apiRouter.use('/branches', branchRouter);
apiRouter.use('/branches', menuRouter);
apiRouter.use('/branches', extractionRouter);

app.use(`/${env.API_PREFIX}`, apiRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);
