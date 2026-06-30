import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import {
  createAdminFeature,
  createAdminMapping,
  createAdminPlan,
  deleteAdminFeature,
  deleteAdminMapping,
  deleteAdminPlan,
  getAdminSubscriptionOverview,
  getTenantSubscription,
  listAdminFeatures,
  listAdminPlans,
  listAdminVenues,
  updateAdminFeature,
  updateAdminMapping,
  updateAdminPlan,
  updateVenueSubscription,
} from './subscription.service';

export const getTenantSubscriptionController = asyncHandler(async (req, res) => {
  ok(res, await getTenantSubscription(req.user));
});

export const getAdminSubscriptionOverviewController = asyncHandler(async (req, res) => {
  ok(res, await getAdminSubscriptionOverview(req.user));
});

export const listAdminVenuesController = asyncHandler(async (req, res) => {
  ok(
    res,
    await listAdminVenues(req.user, {
      search: String(req.query.search ?? '').trim() || undefined,
      status: req.query.status as never,
      plan: req.query.plan as never,
    }),
  );
});

export const updateVenueSubscriptionController = asyncHandler(async (req, res) => {
  const subscription = await updateVenueSubscription(req.user, String(req.params.venueId), req.body);
  ok(res, { subscription });
});

export const listAdminPlansController = asyncHandler(async (req, res) => {
  ok(res, await listAdminPlans(req.user));
});

export const createAdminPlanController = asyncHandler(async (req, res) => {
  const plan = await createAdminPlan(req.user, req.body);
  ok(res, { plan }, 201);
});

export const updateAdminPlanController = asyncHandler(async (req, res) => {
  const plan = await updateAdminPlan(req.user, String(req.params.planId), req.body);
  ok(res, { plan });
});

export const deleteAdminPlanController = asyncHandler(async (req, res) => {
  ok(res, await deleteAdminPlan(req.user, String(req.params.planId)));
});

export const listAdminFeaturesController = asyncHandler(async (req, res) => {
  ok(res, await listAdminFeatures(req.user));
});

export const createAdminFeatureController = asyncHandler(async (req, res) => {
  const feature = await createAdminFeature(req.user, req.body);
  ok(res, { feature }, 201);
});

export const updateAdminFeatureController = asyncHandler(async (req, res) => {
  const feature = await updateAdminFeature(req.user, String(req.params.featureId), req.body);
  ok(res, { feature });
});

export const deleteAdminFeatureController = asyncHandler(async (req, res) => {
  ok(res, await deleteAdminFeature(req.user, String(req.params.featureId)));
});

export const createAdminMappingController = asyncHandler(async (req, res) => {
  const mapping = await createAdminMapping(req.user, req.body);
  ok(res, { mapping }, 201);
});

export const updateAdminMappingController = asyncHandler(async (req, res) => {
  const mapping = await updateAdminMapping(req.user, String(req.params.mappingId), req.body);
  ok(res, { mapping });
});

export const deleteAdminMappingController = asyncHandler(async (req, res) => {
  ok(res, await deleteAdminMapping(req.user, String(req.params.mappingId)));
});
