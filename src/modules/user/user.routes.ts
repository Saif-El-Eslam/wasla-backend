import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { paginationMiddleware } from '../../common/middleware/pagination.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  createVenueUserSchema,
  updateUserBranchesSchema,
  userListQuerySchema,
  userParamsSchema,
} from './user.schemas';
import { createUserController, listUsersController, updateUserBranchesController } from './user.controller';

export const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get('/', paginationMiddleware, validateRequest({ query: userListQuerySchema }), listUsersController);
userRouter.post('/', validateRequest({ body: createVenueUserSchema }), createUserController);
userRouter.patch(
  '/:userId/branches',
  validateRequest({ params: userParamsSchema, body: updateUserBranchesSchema }),
  updateUserBranchesController,
);
