import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { localizeResponse } from '../../common/i18n/localize-response';
import {
  createBranchMenu,
  createCategory,
  createItem,
  deleteBranchMenu,
  deleteCategory,
  deleteItem,
  getBranchMenu,
  publishBranchMenu,
  reorderCategories,
  reorderItems,
  toggleItemAvailability,
  unpublishBranchMenu,
  updateBranchMenu,
  updateCategory,
  updateItem,
} from './menu.service';

export const getBranchMenuController = asyncHandler(async (req, res) => {
  const menu = await getBranchMenu(req.user, String(req.params.branchId));
  ok(res, localizeResponse({ menu }, req.locale));
});

export const createBranchMenuController = asyncHandler(async (req, res) => {
  const menu = await createBranchMenu(req.user, String(req.params.branchId), req.body);
  ok(res, localizeResponse({ menu }, req.locale), 201);
});

export const updateBranchMenuController = asyncHandler(async (req, res) => {
  const menu = await updateBranchMenu(req.user, String(req.params.branchId), req.body);
  ok(res, localizeResponse({ menu }, req.locale));
});

export const deleteBranchMenuController = asyncHandler(async (req, res) => {
  const result = await deleteBranchMenu(req.user, String(req.params.branchId));
  ok(res, result);
});

export const publishBranchMenuController = asyncHandler(async (req, res) => {
  const menu = await publishBranchMenu(req.user, String(req.params.branchId));
  ok(res, localizeResponse({ menu }, req.locale));
});

export const unpublishBranchMenuController = asyncHandler(async (req, res) => {
  const menu = await unpublishBranchMenu(req.user, String(req.params.branchId));
  ok(res, localizeResponse({ menu }, req.locale));
});

export const createCategoryController = asyncHandler(async (req, res) => {
  const category = await createCategory(req.user, String(req.params.branchId), req.body);
  ok(res, localizeResponse({ category }, req.locale), 201);
});

export const updateCategoryController = asyncHandler(async (req, res) => {
  const category = await updateCategory(req.user, String(req.params.branchId), String(req.params.categoryId), req.body);
  ok(res, localizeResponse({ category }, req.locale));
});

export const deleteCategoryController = asyncHandler(async (req, res) => {
  const result = await deleteCategory(req.user, String(req.params.branchId), String(req.params.categoryId));
  ok(res, result);
});

export const reorderCategoriesController = asyncHandler(async (req, res) => {
  const menu = await reorderCategories(req.user, String(req.params.branchId), req.body);
  ok(res, localizeResponse({ menu }, req.locale));
});

export const createItemController = asyncHandler(async (req, res) => {
  const item = await createItem(req.user, String(req.params.branchId), String(req.params.categoryId), req.body);
  ok(res, localizeResponse({ item }, req.locale), 201);
});

export const updateItemController = asyncHandler(async (req, res) => {
  const item = await updateItem(
    req.user,
    String(req.params.branchId),
    String(req.params.categoryId),
    String(req.params.itemId),
    req.body,
  );
  ok(res, localizeResponse({ item }, req.locale));
});

export const deleteItemController = asyncHandler(async (req, res) => {
  const result = await deleteItem(
    req.user,
    String(req.params.branchId),
    String(req.params.categoryId),
    String(req.params.itemId),
  );
  ok(res, result);
});

export const reorderItemsController = asyncHandler(async (req, res) => {
  const menu = await reorderItems(req.user, String(req.params.branchId), String(req.params.categoryId), req.body);
  ok(res, localizeResponse({ menu }, req.locale));
});

export const toggleItemAvailabilityController = asyncHandler(async (req, res) => {
  const item = await toggleItemAvailability(
    req.user,
    String(req.params.branchId),
    String(req.params.categoryId),
    String(req.params.itemId),
    req.body,
  );
  ok(res, localizeResponse({ item }, req.locale));
});
