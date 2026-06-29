import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { localizeResponse } from '../../common/i18n/localize-response';
import { getBranchQrAssets, regenerateBranchQr, renderBranchQrAsset } from './qr.service';

export const getBranchQrController = asyncHandler(async (req, res) => {
  const result = await getBranchQrAssets(req.user, String(req.params.branchId), req.locale);
  ok(res, localizeResponse(result, req.locale));
});

export const regenerateBranchQrController = asyncHandler(async (req, res) => {
  const result = await regenerateBranchQr(req.user, String(req.params.branchId), req.locale);
  ok(res, localizeResponse(result, req.locale));
});

export const downloadBranchQrPngController = asyncHandler(async (req, res) => {
  const asset = await renderBranchQrAsset(req.user, String(req.params.branchId), 'png', req.locale);
  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${asset.filename}"`);
  res.send(asset.body);
});

export const downloadBranchQrSvgController = asyncHandler(async (req, res) => {
  const asset = await renderBranchQrAsset(req.user, String(req.params.branchId), 'svg', req.locale);
  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${asset.filename}"`);
  res.send(asset.body);
});

export const downloadBranchQrPosterController = asyncHandler(async (req, res) => {
  const asset = await renderBranchQrAsset(req.user, String(req.params.branchId), 'poster', req.locale);
  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${asset.filename}"`);
  res.send(asset.body);
});
