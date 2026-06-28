import { Router } from 'express';
import { paginationMiddleware } from '../../common/middleware/pagination.middleware';
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

publicRouter.get(
  '/venues',
  paginationMiddleware,
  validateRequest({ query: publicVenueListQuerySchema }),
  listPublicVenuesController,
);
publicRouter.get('/venues/:venueSlug', validateRequest({ params: publicVenueParamsSchema }), getPublicVenueController);
publicRouter.get(
  '/venues/:venueSlug/:branchSlug/menu',
  validateRequest({ params: publicBranchMenuParamsSchema }),
  getPublicBranchMenuController,
);
publicRouter.post('/analytics', validateRequest({ body: publicAnalyticsEventSchema }), recordPublicAnalyticsController);
publicRouter.get('/m/:code', validateRequest({ params: publicShortCodeParamsSchema }), redirectPublicQrController);
