import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { authenticatedRateLimit } from '../../common/middleware/rate-limit.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  downloadBranchQrPngController,
  downloadBranchQrPosterController,
  downloadBranchQrSvgController,
  getBranchQrController,
  regenerateBranchQrController,
} from './qr.controller';
import { qrParamsSchema } from './qr.schemas';

export const qrRouter = Router();

qrRouter.use(requireAuth, authenticatedRateLimit);

qrRouter.get('/:branchId/qr', validateRequest({ params: qrParamsSchema }), getBranchQrController);
qrRouter.post('/:branchId/qr/regenerate', validateRequest({ params: qrParamsSchema }), regenerateBranchQrController);
qrRouter.get('/:branchId/qr.png', validateRequest({ params: qrParamsSchema }), downloadBranchQrPngController);
qrRouter.get('/:branchId/qr.svg', validateRequest({ params: qrParamsSchema }), downloadBranchQrSvgController);
qrRouter.get('/:branchId/qr/poster.png', validateRequest({ params: qrParamsSchema }), downloadBranchQrPosterController);
