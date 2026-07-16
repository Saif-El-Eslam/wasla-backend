import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { localizeResponse } from '../../common/i18n/localize-response';
import {
  createBranch,
  deleteBranch,
  getBranch,
  getBranchesOverview,
  listBranches,
  listBranchOptions,
  listManagementBranches,
  setMainBranch,
  updateBranch,
} from './branch.service';

export const listBranchesController = asyncHandler(async (req, res) => {
  if (req.query.view === 'options') {
    const result = await listBranchOptions(req.user);
    ok(res, localizeResponse(result, req.locale));
    return;
  }

  if (req.query.view === 'management') {
    const result = await listManagementBranches(req.user);
    ok(res, result);
    return;
  }

  const result = await listBranches(req.user, req.pagination, { search: String(req.query.search ?? '').trim() || undefined });
  ok(res, localizeResponse(result, req.locale));
});

export const getBranchesOverviewController = asyncHandler(async (req, res) => {
  const result = await getBranchesOverview(req.user);
  ok(res, localizeResponse(result, req.locale));
});

export const createBranchController = asyncHandler(async (req, res) => {
  const branch = await createBranch(req.user, req.body);
  ok(res, localizeResponse({ branch }, req.locale), 201);
});

export const getBranchController = asyncHandler(async (req, res) => {
  const branch = await getBranch(req.user, String(req.params.branchId));
  ok(res, localizeResponse({ branch }, req.locale));
});

export const updateBranchController = asyncHandler(async (req, res) => {
  const branch = await updateBranch(req.user, String(req.params.branchId), req.body);
  ok(res, localizeResponse({ branch }, req.locale));
});

export const setMainBranchController = asyncHandler(async (req, res) => {
  const branch = await setMainBranch(req.user, String(req.params.branchId));
  ok(res, localizeResponse({ branch }, req.locale));
});

export const deleteBranchController = asyncHandler(async (req, res) => {
  const result = await deleteBranch(req.user, String(req.params.branchId));
  ok(res, result);
});
