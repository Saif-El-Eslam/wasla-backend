import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  branchMenuParamsSchema,
  categoryParamsSchema,
  createCategorySchema,
  createItemSchema,
  createMenuSchema,
  itemParamsSchema,
  reorderCategoriesSchema,
  reorderItemsSchema,
  toggleAvailabilitySchema,
  updateCategorySchema,
  updateItemSchema,
  updateMenuSchema,
} from './menu.schemas';
import {
  createBranchMenuController,
  createCategoryController,
  createItemController,
  deleteBranchMenuController,
  deleteCategoryController,
  deleteItemController,
  getBranchMenuController,
  publishBranchMenuController,
  reorderCategoriesController,
  reorderItemsController,
  toggleItemAvailabilityController,
  unpublishBranchMenuController,
  updateBranchMenuController,
  updateCategoryController,
  updateItemController,
} from './menu.controller';

export const menuRouter = Router();

menuRouter.use(requireAuth);

menuRouter.get('/:branchId/menu', validateRequest({ params: branchMenuParamsSchema }), getBranchMenuController);
menuRouter.post('/:branchId/menu', validateRequest({ params: branchMenuParamsSchema, body: createMenuSchema }), createBranchMenuController);
menuRouter.patch('/:branchId/menu', validateRequest({ params: branchMenuParamsSchema, body: updateMenuSchema }), updateBranchMenuController);
menuRouter.delete('/:branchId/menu', validateRequest({ params: branchMenuParamsSchema }), deleteBranchMenuController);
menuRouter.post('/:branchId/menu/publish', validateRequest({ params: branchMenuParamsSchema }), publishBranchMenuController);
menuRouter.post('/:branchId/menu/unpublish', validateRequest({ params: branchMenuParamsSchema }), unpublishBranchMenuController);

menuRouter.post(
  '/:branchId/menu/categories',
  validateRequest({ params: branchMenuParamsSchema, body: createCategorySchema }),
  createCategoryController,
);
menuRouter.post(
  '/:branchId/menu/categories/reorder',
  validateRequest({ params: branchMenuParamsSchema, body: reorderCategoriesSchema }),
  reorderCategoriesController,
);
menuRouter.patch(
  '/:branchId/menu/categories/:categoryId',
  validateRequest({ params: categoryParamsSchema, body: updateCategorySchema }),
  updateCategoryController,
);
menuRouter.delete(
  '/:branchId/menu/categories/:categoryId',
  validateRequest({ params: categoryParamsSchema }),
  deleteCategoryController,
);

menuRouter.post(
  '/:branchId/menu/categories/:categoryId/items',
  validateRequest({ params: categoryParamsSchema, body: createItemSchema }),
  createItemController,
);
menuRouter.post(
  '/:branchId/menu/categories/:categoryId/items/reorder',
  validateRequest({ params: categoryParamsSchema, body: reorderItemsSchema }),
  reorderItemsController,
);
menuRouter.patch(
  '/:branchId/menu/categories/:categoryId/items/:itemId',
  validateRequest({ params: itemParamsSchema, body: updateItemSchema }),
  updateItemController,
);
menuRouter.delete(
  '/:branchId/menu/categories/:categoryId/items/:itemId',
  validateRequest({ params: itemParamsSchema }),
  deleteItemController,
);
menuRouter.post(
  '/:branchId/menu/categories/:categoryId/items/:itemId/toggle-availability',
  validateRequest({ params: itemParamsSchema, body: toggleAvailabilitySchema }),
  toggleItemAvailabilityController,
);
