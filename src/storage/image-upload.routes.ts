import { Router } from 'express';
import { requireAuth } from '../common/middleware/auth.middleware';
import { validateRequest } from '../common/middleware/validate.middleware';
import { createImageUploadSignatureController, deleteUploadedImageController } from './image-upload.controller';
import { deleteUploadedImageSchema, imageUploadSignatureSchema } from './image-upload.schemas';

export const imageUploadRouter = Router();

imageUploadRouter.use(requireAuth);

imageUploadRouter.post(
  '/images/signature',
  validateRequest({ body: imageUploadSignatureSchema }),
  createImageUploadSignatureController,
);

imageUploadRouter.delete(
  '/images',
  validateRequest({ body: deleteUploadedImageSchema }),
  deleteUploadedImageController,
);
