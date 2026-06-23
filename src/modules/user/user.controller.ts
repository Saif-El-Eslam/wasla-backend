import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { localizeResponse } from '../../common/i18n/localize-response';
import { createVenueUser, listVenueUsers, updateUserBranches } from './user.service';

export const listUsersController = asyncHandler(async (req, res) => {
  const result = await listVenueUsers(req.user, req.pagination, {
    search: String(req.query.search ?? '').trim() || undefined,
  });
  ok(res, localizeResponse(result, req.locale));
});

export const createUserController = asyncHandler(async (req, res) => {
  const user = await createVenueUser(req.user, req.body);
  ok(res, localizeResponse({ user }, req.locale), 201);
});

export const updateUserBranchesController = asyncHandler(async (req, res) => {
  const user = await updateUserBranches(req.user, String(req.params.userId), req.body);
  ok(res, localizeResponse({ user }, req.locale));
});
