import QRCode from 'qrcode';
import sharp from 'sharp';
import TextToSVG from 'text-to-svg';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../database/prisma';
import { requireBranchAccess } from '../../common/auth/branch-access';
import { HttpError } from '../../common/http/http-error';
import { resolveLocalizedText } from '../../common/i18n/localized-text';
import type { LocalizedText } from '../../common/i18n/localized-text';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { assertQrAssetAllowed } from '../subscription/subscription.service';

export type QrUrlContext = {
  apiOrigin?: string;
};

const qrInclude = Prisma.validator<Prisma.MenuInclude>()({
  qrCode: true,
  analytics: true,
  branch: {
    include: {
      venue: true,
    },
  },
});

type QrMenu = Prisma.MenuGetPayload<{ include: typeof qrInclude }>;

type QrFormat = 'png' | 'svg' | 'poster';

const qrColors = {
  ink: '#042f2e',
  inkSoft: '#0f766e',
  background: '#f8fafa',
  paper: '#ffffff',
  amber: '#fbbf24',
  stone: '#1c1917',
  muted: '#78716c',
};
const qrFontFamily =
  'DejaVu Sans, Noto Sans Arabic, Noto Sans, Tahoma, Arial, Helvetica, sans-serif';
function fontAssetPath(fileName: string) {
  const candidates = [
    path.resolve(process.cwd(), 'assets/fonts', fileName),
    path.resolve(process.cwd(), 'backend/assets/fonts', fileName),
    path.resolve(__dirname, '../../../assets/fonts', fileName),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const qrFontRegularFile = fontAssetPath('NotoSansArabic-Regular.ttf');
const qrFontBoldFile = fontAssetPath('NotoSansArabic-Bold.ttf');
const qrLatinFontRegularFile = fontAssetPath('NotoSans-Regular.ttf');
const qrLatinFontBoldFile = fontAssetPath('NotoSans-Bold.ttf');
const textPathRenderers = {
  arabic: {
    regular: TextToSVG.loadSync(qrFontRegularFile),
    bold: TextToSVG.loadSync(qrFontBoldFile),
  },
  latin: {
    regular: TextToSVG.loadSync(qrLatinFontRegularFile),
    bold: TextToSVG.loadSync(qrLatinFontBoldFile),
  },
};
type TextScript = keyof typeof textPathRenderers;

function firstFrontendOrigin() {
  return env.FRONTEND_ORIGIN.split(',')[0]?.trim() || 'http://localhost:3000';
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

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textDirection(value: string) {
  return /[\u0590-\u08FF]/.test(value) ? 'rtl' : 'ltr';
}

function textAttrs(value = '') {
  return `font-family="${qrFontFamily}" direction="${textDirection(value)}" unicode-bidi="plaintext"`;
}

function glyphScript(glyph: string, fallback: TextScript): TextScript {
  if (/[\u0590-\u08FF]/.test(glyph)) {
    return 'arabic';
  }

  if (/\s/.test(glyph)) {
    return fallback;
  }

  return 'latin';
}

function textPathSegments(text: string): { script: TextScript; text: string }[] {
  const fallbackScript = textDirection(text) === 'rtl' ? 'arabic' : 'latin';
  const segments: { script: TextScript; text: string }[] = [];

  for (const glyph of [...text]) {
    const script = glyphScript(glyph, segments.at(-1)?.script ?? fallbackScript);
    const previous = segments.at(-1);

    if (previous?.script === script) {
      previous.text += glyph;
    } else {
      segments.push({ script, text: glyph });
    }
  }

  if (fallbackScript === 'latin') {
    return segments;
  }

  return [...segments].reverse().map((segment) => ({
    ...segment,
    text: segment.script === 'arabic' ? [...segment.text].reverse().join('') : segment.text,
  }));
}

async function rasterText(input: {
  text: string;
  fontSize: number;
  color: string;
  weight?: 'regular' | 'bold';
  width?: number;
  align?: 'left' | 'center' | 'right';
  opacity?: number;
}) {
  const segments = textPathSegments(input.text);
  const paths: string[] = [];
  let cursor = 0;
  let height = input.fontSize;

  for (const segment of segments) {
    const renderer = textPathRenderers[segment.script][input.weight ?? 'bold'];
    const metrics = renderer.getMetrics(segment.text, {
      fontSize: input.fontSize,
      anchor: 'left top',
    });
    const d = renderer.getD(segment.text, {
      x: cursor,
      y: 0,
      fontSize: input.fontSize,
      anchor: 'left top',
    });

    paths.push(`<path d="${d}" fill="${input.color}"/>`);
    cursor += metrics.width;
    height = Math.max(height, metrics.height);
  }

  const svgWidth = Math.max(1, Math.ceil(cursor));
  const svgHeight = Math.max(1, Math.ceil(height));
  const svg = `
    <svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <g${input.opacity !== undefined ? ` opacity="${input.opacity}"` : ''}>
        ${paths.join('')}
      </g>
    </svg>
  `;
  const base = await sharp(Buffer.from(svg)).png().toBuffer();

  if (!input.width) {
    return base;
  }

  const metadata = await sharp(base).metadata();
  const width = metadata.width ?? 0;

  if (width <= input.width) {
    return base;
  }

  return sharp(base).resize({ width: input.width, withoutEnlargement: true }).png().toBuffer();
}

async function textComposite(input: {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  weight?: 'regular' | 'bold';
  width?: number;
  align?: 'left' | 'center' | 'right';
  anchor?: 'start' | 'middle' | 'end';
}) {
  const buffer = await rasterText(input);
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? input.width ?? 0;
  const height = metadata.height ?? input.fontSize;
  const anchor = input.anchor ?? 'start';
  const left =
    anchor === 'middle' ? input.x - width / 2 : anchor === 'end' ? input.x - width : input.x;

  return {
    input: buffer,
    left: Math.round(left),
    top: Math.round(input.y - height / 2),
  } satisfies sharp.OverlayOptions;
}

function labelText(value: string, fallback: string, maxLength = 36) {
  const text = value.trim() || fallback;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function localizedJson(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LocalizedText)
    : undefined;
}

function brandForMenu(menu: QrMenu, requestedLocale?: string, allowVenueLogo = true) {
  const venueName = resolveLocalizedText(localizedJson(menu.branch.venue.name), {
    requestedLocale,
    defaultLocale: menu.branch.venue.defaultLocale,
  });
  const branchName = resolveLocalizedText(localizedJson(menu.branch.name), {
    requestedLocale,
    defaultLocale: menu.branch.venue.defaultLocale,
  });

  return {
    venueName: labelText(venueName, 'Venue'),
    branchName: labelText(branchName, 'Main branch'),
    venueLogoUrl: allowVenueLogo ? (menu.branch.logoUrl ?? menu.branch.venue.logoUrl) : null,
    waslaMark: 'W',
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

async function centerMarkPng(size: number) {
  const radius = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.46);
  const base = Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" fill="#ffffff"/>
      <rect x="8" y="8" width="${size - 16}" height="${size - 16}" rx="${radius - 5}" fill="${qrColors.ink}"/>
    </svg>
  `);

  return sharp(base)
    .composite([
      await textComposite({
        text: 'W',
        x: size / 2,
        y: size / 2 + 4,
        fontSize,
        color: '#ffffff',
        anchor: 'middle',
      }),
    ])
    .png()
    .toBuffer();
}

async function fetchLogo(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3500) });

    if (!response.ok) {
      return null;
    }

    const type = response.headers.get('content-type') ?? '';

    if (!type.startsWith('image/')) {
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function brandFooterBaseSvg(input: { width: number; height: number }) {
  const { width, height } = input;

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" rx="32" fill="#ffffff"/>
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="31" fill="none" stroke="#d6f3ef" stroke-width="2"/>
      <circle cx="68" cy="${height / 2}" r="38" fill="#ccfbf1"/>
    </svg>
  `);
}

async function brandFooterPng(input: {
  width: number;
  height: number;
  venueName: string;
  branchName: string;
  logoInitial: string;
}) {
  const { width, height, venueName, branchName, logoInitial } = input;
  const safeVenue = labelText(venueName, 'Venue', 34);
  const safeBranch = labelText(branchName, 'Branch', 40);
  const safeInitial = logoInitial || 'V';
  const venueRtl = textDirection(venueName) === 'rtl';
  const branchRtl = textDirection(branchName) === 'rtl';

  return sharp(brandFooterBaseSvg({ width, height }))
    .composite([
      await textComposite({
        text: safeInitial,
        x: 68,
        y: height / 2 + 2,
        fontSize: 34,
        color: qrColors.ink,
        anchor: 'middle',
      }),
      await textComposite({
        text: safeVenue,
        x: venueRtl ? width - 124 : 124,
        y: 48,
        fontSize: 30,
        color: qrColors.stone,
        width: width - 260,
        align: venueRtl ? 'right' : 'left',
        anchor: venueRtl ? 'end' : 'start',
      }),
      await textComposite({
        text: safeBranch,
        x: branchRtl ? width - 124 : 124,
        y: 84,
        fontSize: 20,
        color: qrColors.muted,
        weight: 'regular',
        width: width - 260,
        align: branchRtl ? 'right' : 'left',
        anchor: branchRtl ? 'end' : 'start',
      }),
      await textComposite({
        text: 'Wasla',
        x: width - 34,
        y: height - 38,
        fontSize: 18,
        color: qrColors.inkSoft,
        anchor: 'end',
      }),
    ])
    .png()
    .toBuffer();
}

async function logoComposite(input: {
  logoUrl?: string | null;
  left: number;
  top: number;
  size: number;
  fallbackInitial: string;
}) {
  const logo = await fetchLogo(input.logoUrl);

  if (!logo) {
    return null;
  }

  const roundedMask = Buffer.from(`
    <svg width="${input.size}" height="${input.size}" viewBox="0 0 ${input.size} ${input.size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${input.size / 2}" cy="${input.size / 2}" r="${input.size / 2}" fill="#fff"/>
    </svg>
  `);
  const body = await sharp(logo)
    .resize(input.size, input.size, { fit: 'cover' })
    .composite([{ input: roundedMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  return { input: body, left: input.left, top: input.top };
}

async function renderQrPng(
  menu: QrMenu,
  requestedLocale?: string,
  context: QrUrlContext = {},
  allowVenueLogo = true,
) {
  const qrRecord = qrRecordPayload(menu, context);
  const brand = brandForMenu(menu, requestedLocale, allowVenueLogo);
  const qrSize = 720;
  const qrLeft = 120;
  const qrTop = 104;
  const footerTop = 886;
  const codeBuffer = await QRCode.toBuffer(qrRecord.shortUrl, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: qrSize,
    color: {
      dark: qrColors.ink,
      light: '#ffffff',
    },
  });
  const baseSvg = Buffer.from(`
    <svg width="960" height="1160" viewBox="0 0 960 1160" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="1160" fill="${qrColors.background}"/>
      <rect x="72" y="56" width="816" height="1038" rx="44" fill="#ffffff"/>
      <rect x="73" y="57" width="814" height="1036" rx="43" fill="none" stroke="#d9f3ef" stroke-width="2"/>
      <rect x="${qrLeft - 18}" y="${qrTop - 18}" width="${qrSize + 36}" height="${qrSize + 36}" rx="36" fill="#ffffff" stroke="#ecfdf5" stroke-width="8"/>
      <rect x="346" y="74" width="268" height="30" rx="15" fill="#ffffff"/>
    </svg>
  `);
  const watermark = await rasterText({
    text: 'Wasla',
    fontSize: 102,
    color: '#d6f3ef',
    weight: 'bold',
    opacity: 0.42,
  });
  const footer = await brandFooterPng({
    width: 724,
    height: 132,
    venueName: brand.venueName,
    branchName: brand.branchName,
    logoInitial: brand.venueName.charAt(0).toUpperCase(),
  });
  const logo = await logoComposite({
    logoUrl: brand.venueLogoUrl,
    left: 140,
    top: footerTop + 28,
    size: 76,
    fallbackInitial: brand.venueName.charAt(0).toUpperCase(),
  });
  const composites: sharp.OverlayOptions[] = [
    { input: baseSvg, left: 0, top: 0 },
    {
      input: await sharp(watermark).rotate(-24, { background: '#00000000' }).png().toBuffer(),
      left: 326,
      top: 152,
    },
    await textComposite({
      text: 'WASLA MENU QR',
      x: 480,
      y: 92,
      fontSize: 18,
      color: qrColors.inkSoft,
      width: 268,
      align: 'center',
      anchor: 'middle',
    }),
    { input: codeBuffer, left: qrLeft, top: qrTop },
    { input: await centerMarkPng(116), left: qrLeft + qrSize / 2 - 58, top: qrTop + qrSize / 2 - 58 },
    { input: footer, left: 118, top: footerTop },
    await textComposite({
      text: 'Scan to open the menu',
      x: 480,
      y: 1078,
      fontSize: 18,
      color: qrColors.muted,
      width: 360,
      align: 'center',
      anchor: 'middle',
    }),
  ];

  if (logo) {
    composites.push(logo);
  }

  return sharp({
    create: {
      width: 960,
      height: 1160,
      channels: 4,
      background: qrColors.background,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

function qrSvgModules(targetUrl: string) {
  const qr = QRCode.create(targetUrl, { errorCorrectionLevel: 'H' });
  const modules = qr.modules;
  const quiet = 4;
  const qrSize = 720;
  const moduleSize = qrSize / (modules.size + quiet * 2);
  const offset = 120;
  const top = 104;
  const rects: string[] = [];

  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col)) {
        rects.push(
          `<rect x="${(offset + (col + quiet) * moduleSize).toFixed(3)}" y="${(top + (row + quiet) * moduleSize).toFixed(3)}" width="${moduleSize.toFixed(3)}" height="${moduleSize.toFixed(3)}" fill="${qrColors.ink}"/>`,
        );
      }
    }
  }

  return rects.join('');
}

function renderQrSvg(
  menu: QrMenu,
  requestedLocale?: string,
  context: QrUrlContext = {},
  allowVenueLogo = true,
) {
  const qrRecord = qrRecordPayload(menu, context);
  const brand = brandForMenu(menu, requestedLocale, allowVenueLogo);
  const venueInitial = escapeXml(brand.venueName.charAt(0).toUpperCase() || 'V');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="960" height="1160" viewBox="0 0 960 1160" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="960" height="1160" fill="${qrColors.background}"/>
  <text x="480" y="210" text-anchor="middle" transform="rotate(-24 480 210)" font-family="Arial, Helvetica, sans-serif" font-size="102" font-weight="900" fill="#d6f3ef" opacity="0.42">Wasla</text>
  <rect x="72" y="56" width="816" height="1038" rx="44" fill="#ffffff"/>
  <rect x="73" y="57" width="814" height="1036" rx="43" stroke="#d9f3ef" stroke-width="2"/>
  <rect x="102" y="86" width="756" height="756" rx="36" fill="#ffffff" stroke="#ecfdf5" stroke-width="8"/>
  <rect x="346" y="74" width="268" height="30" rx="15" fill="#ffffff"/>
  <text x="480" y="95" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="900" letter-spacing="3" fill="${qrColors.inkSoft}">WASLA MENU QR</text>
  ${qrSvgModules(qrRecord.shortUrl)}
  <rect x="422" y="406" width="116" height="116" rx="26" fill="#ffffff"/>
  <rect x="430" y="414" width="100" height="100" rx="21" fill="${qrColors.ink}"/>
  <text x="480" y="474" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="900" fill="#ffffff">W</text>
  <rect x="118" y="886" width="724" height="132" rx="32" fill="#ffffff" stroke="#d6f3ef" stroke-width="2"/>
  <circle cx="186" cy="952" r="38" fill="#ccfbf1"/>
  <text x="186" y="954" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="900" fill="${qrColors.ink}">${venueInitial}</text>
  <text x="242" y="938" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900" fill="${qrColors.stone}">${escapeXml(labelText(brand.venueName, 'Venue', 34))}</text>
  <text x="242" y="974" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="${qrColors.muted}">${escapeXml(labelText(brand.branchName, 'Branch', 40))}</text>
  <text x="808" y="984" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="900" fill="${qrColors.inkSoft}">Wasla</text>
  <text x="480" y="1080" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="900" fill="${qrColors.muted}">Scan to open the menu</text>
</svg>`;
}

async function renderPosterPng(
  menu: QrMenu,
  requestedLocale?: string,
  context: QrUrlContext = {},
  allowVenueLogo = true,
) {
  const qrPng = await renderQrPng(menu, requestedLocale, context, allowVenueLogo);
  const brand = brandForMenu(menu, requestedLocale, allowVenueLogo);
  const safeVenue = labelText(brand.venueName, 'Venue', 26);
  const safeBranch = labelText(brand.branchName, 'Branch', 34);
  const header = Buffer.from(`
    <svg width="1200" height="1600" viewBox="0 0 1200 1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="1600" fill="${qrColors.ink}"/>
      <rect x="116" y="358" width="968" height="1170" rx="56" fill="#ffffff"/>
    </svg>
  `);
  const posterWatermark = await rasterText({
    text: 'Wasla',
    fontSize: 150,
    color: '#115e59',
    weight: 'bold',
    opacity: 0.36,
  });

  return sharp({
    create: {
      width: 1200,
      height: 1600,
      channels: 4,
      background: qrColors.ink,
    },
  })
    .composite([
      { input: header, left: 0, top: 0 },
      {
        input: await sharp(posterWatermark).rotate(-18, { background: '#00000000' }).png().toBuffer(),
        left: 380,
        top: 202,
      },
      await textComposite({
        text: 'SCAN THE MENU',
        x: 600,
        y: 134,
        fontSize: 24,
        color: qrColors.amber,
        width: 360,
        align: 'center',
        anchor: 'middle',
      }),
      await textComposite({
        text: safeVenue,
        x: 600,
        y: 218,
        fontSize: 68,
        color: '#ffffff',
        width: 880,
        align: 'center',
        anchor: 'middle',
      }),
      await textComposite({
        text: safeBranch,
        x: 600,
        y: 272,
        fontSize: 28,
        color: '#99f6e4',
        width: 760,
        align: 'center',
        anchor: 'middle',
      }),
      { input: await sharp(qrPng).resize(840, 1015).png().toBuffer(), left: 180, top: 430 },
      await textComposite({
        text: 'Powered by Wasla',
        x: 600,
        y: 1480,
        fontSize: 22,
        color: '#ccfbf1',
        width: 360,
        align: 'center',
        anchor: 'middle',
      }),
    ])
    .png()
    .toBuffer();
}

export async function getBranchQrAssets(
  session: SessionPayload | undefined,
  branchId: string,
  requestedLocale?: string,
  context: QrUrlContext = {},
) {
  const menu = await getMenuForBranch(session, branchId);
  const plan = await assertQrAssetAllowed(menu.branch.venueId);
  const preview = await renderQrPng(
    menu,
    requestedLocale,
    context,
    plan.qrBranding !== 'WASLA_SIGNED',
  );

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
      qrCode: qrRecordPayload(menu, context),
      analytics: menu.analytics,
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
  const allowVenueLogo = plan.qrBranding !== 'WASLA_SIGNED';

  if (format === 'svg') {
    return {
      contentType: 'image/svg+xml; charset=utf-8',
      filename: `wasla-${menu.branch.slug}-qr.svg`,
      body: Buffer.from(renderQrSvg(menu, requestedLocale, context, allowVenueLogo)),
    };
  }

  if (format === 'poster') {
    return {
      contentType: 'image/png',
      filename: `wasla-${menu.branch.slug}-poster.png`,
      body: await renderPosterPng(menu, requestedLocale, context, allowVenueLogo),
    };
  }

  return {
    contentType: 'image/png',
    filename: `wasla-${menu.branch.slug}-qr.png`,
    body: await renderQrPng(menu, requestedLocale, context, allowVenueLogo),
  };
}
