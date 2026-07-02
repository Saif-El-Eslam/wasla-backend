import { randomBytes, randomUUID } from 'node:crypto';
import { env, frontendUrl } from '../../config/env';
import { prisma } from '../../database/prisma';
import { requireBranchAccess } from '../../common/auth/branch-access';
import { HttpError } from '../../common/http/http-error';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { assertQrAssetAllowed } from '../subscription/plan-guards';
import { qrBrandingLevels } from '../subscription/subscription.constants';
import { renderPosterPng, renderQrPng, renderQrSvg } from './qr.renderer';
import { qrInclude, type QrFormat, type QrMenu, type QrUrlContext } from './qr.types';

function firstFrontendOrigin() {
  return frontendUrl.toString() || 'http://localhost:3000';
}

function publicApiOrigin() {
  return env.PUBLIC_API_ORIGIN ?? `http://localhost:${env.PORT}`;
}

function apiPrefix() {
  return env.API_PREFIX.replace(/^\/|\/$/g, '');
}

function absoluteApiUrl(path: string, context: QrUrlContext = {}) {
  return `${(context.apiOrigin ?? publicApiOrigin()).replace(/\/$/, '')}/${apiPrefix()}${path}`;
}

function publicMenuUrl(menu: QrMenu) {
  return `${firstFrontendOrigin().replace(/\/$/, '')}/en/venues/${menu.branch.venue.slug}/${menu.branch.slug}/menu`;
}

function shortPath(shortCode: string) {
  return `/public/m/${shortCode}`;
}

function relativeShortPath(shortCode: string, value?: string | null) {
  if (!value) {
    return shortPath(shortCode);
  }

  const apiPrefixPattern = new RegExp(`^/${apiPrefix().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const normalizePath = (path: string) => {
    const withoutApiPrefix = path.replace(apiPrefixPattern, '');

    return withoutApiPrefix === shortPath(shortCode) ? withoutApiPrefix : null;
  };

  if (value.startsWith('/')) {
    return normalizePath(value) ?? shortPath(shortCode);
  }

  try {
    return normalizePath(new URL(value).pathname) ?? shortPath(shortCode);
  } catch {
    return shortPath(shortCode);
  }
}

function shortUrl(shortCode: string, context: QrUrlContext = {}, value?: string | null) {
  return absoluteApiUrl(relativeShortPath(shortCode, value), context);
}

function assetUrl(branchId: string, format: QrFormat, context: QrUrlContext = {}) {
  const path =
    format === 'poster'
      ? `/branches/${branchId}/qr/poster.png`
      : `/branches/${branchId}/qr.${format}`;

  return absoluteApiUrl(path, context);
}

function qrBrandingRenderOptions(plan: { qrBranding: string; customQrAssets: boolean }) {
  const custom = plan.qrBranding === qrBrandingLevels.fullCustom || Boolean(plan.customQrAssets);

  return {
    custom,
    noWatermark: custom || plan.qrBranding === qrBrandingLevels.venueLogo,
    allowVenueLogo: custom || plan.qrBranding === qrBrandingLevels.venueLogo,
  };
}

function qrRecordPayload(menu: QrMenu, context: QrUrlContext = {}) {
  if (!menu.qrCode) {
    throw new HttpError(404, 'errors.menuNotFound');
  }

  const targetUrl = shortUrl(menu.qrCode.shortCode, context, menu.qrCode.targetUrl);

  return {
    id: menu.qrCode.id,
    menuId: menu.qrCode.menuId,
    shortCode: menu.qrCode.shortCode,
    targetUrl,
    shortUrl: targetUrl,
    imageUrl: menu.qrCode.imageUrl,
    pngUrl: assetUrl(menu.branchId, 'png', context),
    svgUrl: assetUrl(menu.branchId, 'svg', context),
    posterUrl: assetUrl(menu.branchId, 'poster', context),
  };
}

async function createShortCode() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomBytes(5).toString('base64url').slice(0, 8);
    const exists = await prisma.menuQrCode.findUnique({ where: { shortCode: code } });

    if (!exists) {
      return code;
    }
  }

  return randomUUID().slice(0, 12);
}

async function ensureQrCode(menuId: string) {
  const existing = await prisma.menuQrCode.findUnique({ where: { menuId } });

  if (existing) {
    const targetUrl = relativeShortPath(existing.shortCode, existing.targetUrl);

    if (existing.targetUrl !== targetUrl) {
      return prisma.menuQrCode.update({
        where: { id: existing.id },
        data: { targetUrl },
      });
    }

    return existing;
  }

  const shortCodeValue = await createShortCode();

  return prisma.menuQrCode.create({
    data: {
      menuId,
      shortCode: shortCodeValue,
      targetUrl: shortPath(shortCodeValue),
    },
  });
}

async function getMenuForBranch(session: SessionPayload | undefined, branchId: string) {
  await requireBranchAccess(session, branchId);
  const menu = await prisma.menu.findUnique({
    where: { branchId },
    include: qrInclude,
  });

  if (!menu) {
    throw new HttpError(404, 'errors.menuNotFound');
  }

  if (!menu.qrCode) {
    await ensureQrCode(menu.id);
    return prisma.menu.findUniqueOrThrow({
      where: { id: menu.id },
      include: qrInclude,
    });
  }

  if (menu.qrCode.targetUrl !== relativeShortPath(menu.qrCode.shortCode, menu.qrCode.targetUrl)) {
    await ensureQrCode(menu.id);
    return prisma.menu.findUniqueOrThrow({
      where: { id: menu.id },
      include: qrInclude,
    });
  }

  return menu;
}

export async function getBranchQrAssets(
  session: SessionPayload | undefined,
  branchId: string,
  requestedLocale?: string,
  context: QrUrlContext = {},
) {
  const menu = await getMenuForBranch(session, branchId);
  const plan = await assertQrAssetAllowed(menu.branch.venueId);
  const qrCode = qrRecordPayload(menu, context);
  const renderOptions = qrBrandingRenderOptions(plan);
  const preview = await renderQrPng({
    menu,
    requestedLocale,
    targetUrl: qrCode.shortUrl,
    ...renderOptions,
  });

  return {
    branch: {
      id: menu.branch.id,
      name: menu.branch.name,
      slug: menu.branch.slug,
      phone: menu.branch.phone,
      logoUrl: menu.branch.logoUrl,
      venueSlug: menu.branch.venue.slug,
    },
    venue: {
      id: menu.branch.venue.id,
      name: menu.branch.venue.name,
      slug: menu.branch.venue.slug,
      logoUrl: menu.branch.venue.logoUrl,
    },
    menu: {
      id: menu.id,
      publishedAt: menu.publishedAt,
      qrCode,
      analytics: menu.analytics,
    },
    qrBranding: {
      level: plan.qrBranding,
      custom: renderOptions.custom,
      allowVenueLogo: renderOptions.allowVenueLogo,
    },
    publicMenuUrl: publicMenuUrl(menu),
    previewDataUrl: `data:image/png;base64,${preview.toString('base64')}`,
    generatedAt: new Date().toISOString(),
  };
}

export async function regenerateBranchQr(
  session: SessionPayload | undefined,
  branchId: string,
  requestedLocale?: string,
  context: QrUrlContext = {},
) {
  const menu = await getMenuForBranch(session, branchId);
  await assertQrAssetAllowed(menu.branch.venueId);
  const nextShortCode = await createShortCode();

  await prisma.menuQrCode.update({
    where: { menuId: menu.id },
    data: {
      shortCode: nextShortCode,
      targetUrl: shortPath(nextShortCode),
      imageUrl: null,
    },
  });

  return getBranchQrAssets(session, branchId, requestedLocale, context);
}

export async function renderBranchQrAsset(
  session: SessionPayload | undefined,
  branchId: string,
  format: QrFormat,
  requestedLocale?: string,
  context: QrUrlContext = {},
) {
  const menu = await getMenuForBranch(session, branchId);
  const plan = await assertQrAssetAllowed(menu.branch.venueId);
  const qrCode = qrRecordPayload(menu, context);
  const renderInput = {
    menu,
    requestedLocale,
    targetUrl: qrCode.shortUrl,
    ...qrBrandingRenderOptions(plan),
  };

  if (format === 'svg') {
    return {
      contentType: 'image/svg+xml; charset=utf-8',
      filename: `wasla-${menu.branch.slug}-qr.svg`,
      body: Buffer.from(await renderQrSvg(renderInput)),
    };
  }

  if (format === 'poster') {
    return {
      contentType: 'image/png',
      filename: `wasla-${menu.branch.slug}-poster.png`,
      body: await renderPosterPng(renderInput),
    };
  }

  return {
    contentType: 'image/png',
    filename: `wasla-${menu.branch.slug}-qr.png`,
    body: await renderQrPng(renderInput),
  };
}
