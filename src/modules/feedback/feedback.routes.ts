import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.middleware';
import {
  authenticatedRateLimit,
  publicAnalyticsRateLimit,
} from '../../common/middleware/rate-limit.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  createPublicFeedbackController,
  getFeedbackDashboardController,
  markGoogleReviewClickController,
  updateFeedbackStatusController,
} from './feedback.controller';
import {
  feedbackParamsSchema,
  feedbackQuerySchema,
  publicFeedbackClickSchema,
  publicFeedbackSchema,
  updateFeedbackStatusSchema,
} from './feedback.schemas';

export const publicFeedbackRouter = Router();
export const feedbackRouter = Router();

publicFeedbackRouter.post(
  '/',
  publicAnalyticsRateLimit,
  validateRequest({ body: publicFeedbackSchema }),
  createPublicFeedbackController,
);
publicFeedbackRouter.post(
  '/google-click',
  publicAnalyticsRateLimit,
  validateRequest({ body: publicFeedbackClickSchema }),
  markGoogleReviewClickController,
);

feedbackRouter.use(requireAuth, authenticatedRateLimit);
feedbackRouter.get(
  '/',
  validateRequest({ query: feedbackQuerySchema }),
  getFeedbackDashboardController,
);
feedbackRouter.patch(
  '/:feedbackId/status',
  validateRequest({ params: feedbackParamsSchema, body: updateFeedbackStatusSchema }),
  updateFeedbackStatusController,
);
