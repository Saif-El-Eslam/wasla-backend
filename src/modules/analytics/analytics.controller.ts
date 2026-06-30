import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { localizeResponse } from '../../common/i18n/localize-response';
import { getAnalyticsSummary, getBasicAnalyticsSummary } from './analytics.service';

type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all';

export const getAnalyticsSummaryController = asyncHandler(async (req, res) => {
  const analytics = await getAnalyticsSummary(req.user, req.query as { period: AnalyticsPeriod; branchId?: string });
  ok(res, localizeResponse({ analytics }, req.locale));
});

export const getBasicAnalyticsController = asyncHandler(async (req, res) => {
  const analytics = await getBasicAnalyticsSummary(req.user, req.query as { period: AnalyticsPeriod; branchId?: string });
  ok(res, localizeResponse({ analytics }, req.locale));
});

export const getAdvancedAnalyticsController = asyncHandler(async (req, res) => {
  const analytics = await getAnalyticsSummary(
    req.user,
    req.query as { period: AnalyticsPeriod; branchId?: string },
    { advanced: true },
  );
  ok(res, localizeResponse({ analytics }, req.locale));
});
