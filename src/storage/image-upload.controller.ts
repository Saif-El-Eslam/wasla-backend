import { requireAccessUser } from '../common/auth/branch-access';
import { asyncHandler } from '../common/http/async-handler';
import { ok } from '../common/http/response';
import { createImageUploadSignature, deleteImageByUrl } from './image-storage.service';

export const createImageUploadSignatureController = asyncHandler(async (req, res) => {
  const user = await requireAccessUser(req.user);
  const signature = createImageUploadSignature({
    venueId: user.venueId,
    scope: req.body.scope,
  });

  ok(res, { upload: signature });
});

export const deleteUploadedImageController = asyncHandler(async (req, res) => {
  const user = await requireAccessUser(req.user);
  await deleteImageByUrl(req.body.imageUrl, { venueId: user.venueId });

  ok(res, { deleted: true });
});
