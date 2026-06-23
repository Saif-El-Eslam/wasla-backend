import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { localizeResponse } from '../../common/i18n/localize-response';
import { getAnalyticsSummary } from './analytics.service';

export const getAnalyticsSummaryController = asyncHandler(async (req, res) => {
  const analytics = await getAnalyticsSummary(req.user, req.query as { period: '7d' | '30d'; branchId?: string });
  ok(res, localizeResponse({ analytics }, req.locale));
});
