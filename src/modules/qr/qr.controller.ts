import type { Request } from 'express';
import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { localizeResponse } from '../../common/i18n/localize-response';
import { getBranchQrAssets, regenerateBranchQr, renderBranchQrAsset } from './qr.service';

function requestApiOrigin(req: Request) {
  const forwardedProto = req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get('host');

  if (!host) {
    return undefined;
  }

  return `${protocol}://${host}`;
}

export const getBranchQrController = asyncHandler(async (req, res) => {
  const result = await getBranchQrAssets(req.user, String(req.params.branchId), req.locale, {
    apiOrigin: requestApiOrigin(req),
  });
  ok(res, localizeResponse(result, req.locale));
});

export const regenerateBranchQrController = asyncHandler(async (req, res) => {
  const result = await regenerateBranchQr(req.user, String(req.params.branchId), req.locale, {
    apiOrigin: requestApiOrigin(req),
  });
  ok(res, localizeResponse(result, req.locale));
});

export const downloadBranchQrPngController = asyncHandler(async (req, res) => {
  const asset = await renderBranchQrAsset(req.user, String(req.params.branchId), 'png', req.locale, {
    apiOrigin: requestApiOrigin(req),
  });
  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${asset.filename}"`);
  res.send(asset.body);
});

export const downloadBranchQrSvgController = asyncHandler(async (req, res) => {
  const asset = await renderBranchQrAsset(req.user, String(req.params.branchId), 'svg', req.locale, {
    apiOrigin: requestApiOrigin(req),
  });
  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${asset.filename}"`);
  res.send(asset.body);
});

export const downloadBranchQrPosterController = asyncHandler(async (req, res) => {
  const asset = await renderBranchQrAsset(req.user, String(req.params.branchId), 'poster', req.locale, {
    apiOrigin: requestApiOrigin(req),
  });
  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${asset.filename}"`);
  res.send(asset.body);
});
