import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  getAdvancedAnalyticsController,
  getAnalyticsSummaryController,
  getBasicAnalyticsController,
} from './analytics.controller';
import { analyticsQuerySchema } from './analytics.schemas';

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);
analyticsRouter.get('/basic', validateRequest({ query: analyticsQuerySchema }), getBasicAnalyticsController);
analyticsRouter.get('/advanced', validateRequest({ query: analyticsQuerySchema }), getAdvancedAnalyticsController);
analyticsRouter.get('/', validateRequest({ query: analyticsQuerySchema }), getAnalyticsSummaryController);
