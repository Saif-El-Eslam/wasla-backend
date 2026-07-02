import { requireAccessUser } from '../common/auth/branch-access';
import { asyncHandler } from '../common/http/async-handler';
import { ok } from '../common/http/response';
import { assertQrAssetAllowed, assertVenueCanMutate } from '../modules/subscription/plan-guards';
import { createImageUploadSignature, deleteImageByUrl } from './image-storage.service';

export const createImageUploadSignatureController = asyncHandler(async (req, res) => {
  const user = await requireAccessUser(req.user);
  const scope = req.body.scope;

  if (scope === 'qr') {
    await assertQrAssetAllowed(user.venueId, true);
  } else {
    await assertVenueCanMutate(user.venueId);
  }

  const signature = createImageUploadSignature({
    venueId: user.venueId,
    scope,
  });

  ok(res, { upload: signature });
});

export const deleteUploadedImageController = asyncHandler(async (req, res) => {
  const user = await requireAccessUser(req.user);
  await assertVenueCanMutate(user.venueId);
  await deleteImageByUrl(req.body.imageUrl, { venueId: user.venueId });

  ok(res, { deleted: true });
});
