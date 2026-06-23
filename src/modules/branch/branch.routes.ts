import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { paginationMiddleware } from '../../common/middleware/pagination.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import { branchListQuerySchema, branchParamsSchema, createBranchSchema, updateBranchSchema } from './branch.schemas';
import {
  createBranchController,
  deleteBranchController,
  getBranchesOverviewController,
  getBranchController,
  getBranchQrController,
  listBranchesController,
  setMainBranchController,
  updateBranchController,
} from './branch.controller';

export const branchRouter = Router();

branchRouter.use(requireAuth);

branchRouter.get('/overview', getBranchesOverviewController);
branchRouter.get('/', paginationMiddleware, validateRequest({ query: branchListQuerySchema }), listBranchesController);
branchRouter.post('/', validateRequest({ body: createBranchSchema }), createBranchController);
branchRouter.get('/:branchId/qr', validateRequest({ params: branchParamsSchema }), getBranchQrController);
branchRouter.get('/:branchId', validateRequest({ params: branchParamsSchema }), getBranchController);
branchRouter.patch(
  '/:branchId',
  validateRequest({ params: branchParamsSchema, body: updateBranchSchema }),
  updateBranchController,
);
branchRouter.post('/:branchId/set-main', validateRequest({ params: branchParamsSchema }), setMainBranchController);
branchRouter.delete('/:branchId', validateRequest({ params: branchParamsSchema }), deleteBranchController);
