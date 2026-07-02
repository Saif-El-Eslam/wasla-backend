import { Router } from 'express';
import type { RequestHandler } from 'express';
import { paginationMiddleware } from '../../common/middleware/pagination.middleware';
import { publicAnalyticsRateLimit } from '../../common/middleware/rate-limit.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  getPublicBranchMenuController,
  getPublicVenueController,
  listPublicVenuesController,
  recordPublicAnalyticsController,
  redirectPublicQrController,
} from './public.controller';
import {
  publicAnalyticsEventSchema,
  publicBranchMenuParamsSchema,
  publicShortCodeParamsSchema,
  publicVenueListQuerySchema,
  publicVenueParamsSchema,
} from './public.schemas';

export const publicRouter = Router();

const cachePublicRead: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
  next();
};

publicRouter.get(
  '/venues',
  cachePublicRead,
  paginationMiddleware,
  validateRequest({ query: publicVenueListQuerySchema }),
  listPublicVenuesController,
);
publicRouter.get(
  '/venues/:venueSlug',
  cachePublicRead,
  validateRequest({ params: publicVenueParamsSchema }),
  getPublicVenueController,
);
publicRouter.get(
  '/venues/:venueSlug/:branchSlug/menu',
  cachePublicRead,
  validateRequest({ params: publicBranchMenuParamsSchema }),
  getPublicBranchMenuController,
);
publicRouter.post(
  '/analytics',
  publicAnalyticsRateLimit,
  validateRequest({ body: publicAnalyticsEventSchema }),
  recordPublicAnalyticsController,
);
publicRouter.get('/m/:code', validateRequest({ params: publicShortCodeParamsSchema }), redirectPublicQrController);
