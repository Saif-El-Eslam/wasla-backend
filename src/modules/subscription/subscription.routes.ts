import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { authenticatedRateLimit } from '../../common/middleware/rate-limit.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  createAdminFeatureController,
  createAdminMappingController,
  createAdminPlanController,
  deleteAdminFeatureController,
  deleteAdminMappingController,
  deleteAdminPlanController,
  getAdminSubscriptionOverviewController,
  getTenantSubscriptionController,
  listAdminFeaturesController,
  listAdminPlansController,
  listAdminVenuesController,
  updateAdminFeatureController,
  updateAdminMappingController,
  updateAdminPlanController,
  updateVenueSubscriptionController,
} from './subscription.controller';
import {
  adminVenueQuerySchema,
  featureIdParamsSchema,
  mappingIdParamsSchema,
  planIdParamsSchema,
  updateFeatureSchema,
  updatePlanFeatureMappingSchema,
  updatePlanSchema,
  updateVenueSubscriptionSchema,
  upsertFeatureSchema,
  upsertPlanFeatureMappingSchema,
  upsertPlanSchema,
  venueIdParamsSchema,
} from './subscription.schemas';

export const subscriptionRouter = Router();
export const adminSubscriptionRouter = Router();

subscriptionRouter.use(requireAuth, authenticatedRateLimit);
subscriptionRouter.get('/', getTenantSubscriptionController);

adminSubscriptionRouter.use(requireAuth, authenticatedRateLimit);
adminSubscriptionRouter.get('/overview', getAdminSubscriptionOverviewController);
adminSubscriptionRouter.get(
  '/venues',
  validateRequest({ query: adminVenueQuerySchema }),
  listAdminVenuesController,
);
adminSubscriptionRouter.patch(
  '/venues/:venueId/subscription',
  validateRequest({ params: venueIdParamsSchema, body: updateVenueSubscriptionSchema }),
  updateVenueSubscriptionController,
);
adminSubscriptionRouter.get('/plans', listAdminPlansController);
adminSubscriptionRouter.post(
  '/plans',
  validateRequest({ body: upsertPlanSchema }),
  createAdminPlanController,
);
adminSubscriptionRouter.patch(
  '/plans/:planId',
  validateRequest({ params: planIdParamsSchema, body: updatePlanSchema }),
  updateAdminPlanController,
);
adminSubscriptionRouter.delete(
  '/plans/:planId',
  validateRequest({ params: planIdParamsSchema }),
  deleteAdminPlanController,
);
adminSubscriptionRouter.get('/features', listAdminFeaturesController);
adminSubscriptionRouter.post(
  '/features',
  validateRequest({ body: upsertFeatureSchema }),
  createAdminFeatureController,
);
adminSubscriptionRouter.patch(
  '/features/:featureId',
  validateRequest({ params: featureIdParamsSchema, body: updateFeatureSchema }),
  updateAdminFeatureController,
);
adminSubscriptionRouter.delete(
  '/features/:featureId',
  validateRequest({ params: featureIdParamsSchema }),
  deleteAdminFeatureController,
);
adminSubscriptionRouter.post(
  '/mappings',
  validateRequest({ body: upsertPlanFeatureMappingSchema }),
  createAdminMappingController,
);
adminSubscriptionRouter.patch(
  '/mappings/:mappingId',
  validateRequest({ params: mappingIdParamsSchema, body: updatePlanFeatureMappingSchema }),
  updateAdminMappingController,
);
adminSubscriptionRouter.delete(
  '/mappings/:mappingId',
  validateRequest({ params: mappingIdParamsSchema }),
  deleteAdminMappingController,
);
