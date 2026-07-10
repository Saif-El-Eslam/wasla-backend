import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { localizeResponse } from '../../common/i18n/localize-response';
import {
  createPublicFeedback,
  getFeedbackDashboard,
  getPublicFeedbackList,
  markGoogleReviewClick,
  updateFeedbackStatus,
} from './feedback.service';

export const createPublicFeedbackController = asyncHandler(async (req, res) => {
  const result = await createPublicFeedback(req.body, {
    userAgent: req.get('user-agent') ?? undefined,
  });
  ok(res, localizeResponse(result, req.locale), 201);
});

export const getPublicFeedbackController = asyncHandler(async (req, res) => {
  const result = await getPublicFeedbackList(req.validated?.query as never);
  ok(res, localizeResponse(result, req.locale));
});

export const markGoogleReviewClickController = asyncHandler(async (req, res) => {
  const result = await markGoogleReviewClick(String(req.body.feedbackId));
  ok(res, result);
});

export const getFeedbackDashboardController = asyncHandler(async (req, res) => {
  const result = await getFeedbackDashboard(req.user, req.validated?.query as never);
  ok(res, localizeResponse(result, req.locale));
});

export const updateFeedbackStatusController = asyncHandler(async (req, res) => {
  const feedback = await updateFeedbackStatus(req.user, String(req.params.feedbackId), req.body);
  ok(res, localizeResponse({ feedback }, req.locale));
});


