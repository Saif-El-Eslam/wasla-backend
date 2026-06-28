import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { localizeResponse } from '../../common/i18n/localize-response';
import { recordPublicAnalytics } from './public-analytics.service';
import { getPublicBranchMenu, resolvePublicQrShortCode } from './public-menu.service';
import { getPublicVenue, listPublicVenues } from './public-venues.service';

export const listPublicVenuesController = asyncHandler(async (req, res) => {
  const result = await listPublicVenues(
    req.query as { search?: string; type?: never },
    req.pagination ?? { paginate: true, page: 1, limit: 20, skip: 0 },
  );
  ok(res, localizeResponse(result, req.locale));
});

export const getPublicVenueController = asyncHandler(async (req, res) => {
  const result = await getPublicVenue(String(req.params.venueSlug));
  ok(res, localizeResponse(result, req.locale));
});

export const getPublicBranchMenuController = asyncHandler(async (req, res) => {
  const result = await getPublicBranchMenu(String(req.params.venueSlug), String(req.params.branchSlug));
  ok(res, localizeResponse(result, req.locale));
});

export const recordPublicAnalyticsController = asyncHandler(async (req, res) => {
  const result = await recordPublicAnalytics(req.body);
  ok(res, result);
});

export const redirectPublicQrController = asyncHandler(async (req, res) => {
  const result = await resolvePublicQrShortCode(String(req.params.code));
  res.redirect(302, `/en/venues/${result.venueSlug}/${result.branchSlug}/menu`);
});
