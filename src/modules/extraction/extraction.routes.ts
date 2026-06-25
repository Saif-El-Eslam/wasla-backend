import { Router } from 'express';
import multer from 'multer';
import { env } from '../../config/env';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import { HttpError } from '../../common/http/http-error';
import {
  approveExtractionController,
  getExtractionController,
  getLatestExtractionController,
  rejectExtractionController,
  retryExtractionController,
  startExtractionController,
} from './extraction.controller';
import {
  approveExtractionSchema,
  extractionJobParamsSchema,
  extractionParamsSchema,
  rejectExtractionSchema,
} from './schemas/extracted-menu.schema';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: env.GEMINI_MAX_IMAGES_PER_EXTRACTION,
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(new HttpError(400, 'errors.extractionInvalidImageType'));
      return;
    }

    callback(null, true);
  },
});

export const extractionRouter = Router();

extractionRouter.use(requireAuth);

extractionRouter.get(
  '/:branchId/menu/extractions/latest',
  validateRequest({ params: extractionParamsSchema }),
  getLatestExtractionController,
);
extractionRouter.get(
  '/:branchId/menu/extractions/:jobId',
  validateRequest({ params: extractionJobParamsSchema }),
  getExtractionController,
);
extractionRouter.post(
  '/:branchId/menu/extractions',
  validateRequest({ params: extractionParamsSchema }),
  upload.array('images', env.GEMINI_MAX_IMAGES_PER_EXTRACTION),
  startExtractionController,
);
extractionRouter.post(
  '/:branchId/menu/extractions/:jobId/retry',
  validateRequest({ params: extractionJobParamsSchema }),
  upload.array('images', env.GEMINI_MAX_IMAGES_PER_EXTRACTION),
  retryExtractionController,
);
extractionRouter.post(
  '/:branchId/menu/extractions/:jobId/approve',
  validateRequest({ params: extractionJobParamsSchema, body: approveExtractionSchema }),
  approveExtractionController,
);
extractionRouter.post(
  '/:branchId/menu/extractions/:jobId/reject',
  validateRequest({ params: extractionJobParamsSchema, body: rejectExtractionSchema }),
  rejectExtractionController,
);
