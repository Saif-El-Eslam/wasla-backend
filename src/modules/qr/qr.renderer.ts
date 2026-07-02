import QRCode from 'qrcode';
import sharp from 'sharp';
import TextToSVG from 'text-to-svg';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { resolveLocalizedText } from '../../common/i18n/localized-text';
import type { LocalizedText } from '../../common/i18n/localized-text';
import type { QrMenu } from './qr.types';
import { frontendUrl } from '../../config/env';

type TextWeight = 'regular' | 'bold';
type TextAlign = 'left' | 'center' | 'right';
type TextAnchor = 'start' | 'middle' | 'end';

type QrRenderInput = {
  menu: QrMenu;
  targetUrl: string;
  requestedLocale?: string;
  allowVenueLogo?: boolean;
  custom?: boolean;
  noWatermark?: boolean;
};

const qrColors = {
  ink: '#042f2e',
  inkSoft: '#0f766e',
  background: '#f8fafa',
  paper: '#ffffff',
  amber: '#fbbf24',
  stone: '#1c1917',
  muted: '#78716c',
};

const qrCanvas = { width: 960, height: 1160 };
const qrCodeFrame = { left: 120, top: 104, size: 720 };
const qrFooterFrame = { left: 118, top: 886, width: 724, height: 132 };
const qrPosterCanvas = { width: 1200, height: 1600 };
const qrCenterMarkSize = 116;

function fontAssetPath(fileName: string) {
  const candidates = [
    path.resolve(process.cwd(), 'assets/fonts', fileName),
    path.resolve(process.cwd(), 'backend/assets/fonts', fileName),
    path.resolve(__dirname, '../../../assets/fonts', fileName),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function frontendPublicAssetPath(fileName: string) {
  return `${frontendUrl.toString().replace(/\/$/, '')}/${fileName.replace(/^\//, '')}`;
}

const qrFontRegularFile = fontAssetPath('NotoSansArabic-Regular.ttf');
const qrFontBoldFile = fontAssetPath('NotoSansArabic-Bold.ttf');
const qrLatinFontRegularFile = fontAssetPath('NotoSans-Regular.ttf');
const qrLatinFontBoldFile = fontAssetPath('NotoSans-Bold.ttf');
const waslaLogoSvgFiles = [frontendPublicAssetPath('favicon.svg')];
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

function glyphScript(glyph: string, fallback: TextScript): TextScript {
  if (/[\u0590-\u08FF]/.test(glyph)) {
    return 'arabic';
  }

  return /\s/.test(glyph) ? fallback : 'latin';
}

function textSegments(text: string): { script: TextScript; text: string }[] {
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

  return segments;
}

function textWidthEstimate(text: string, fontSize: number, weight: TextWeight) {
  return textSegments(text).reduce((width, segment) => {
    const renderer = textPathRenderers[segment.script][weight];
    const metrics = renderer.getMetrics(segment.text, { fontSize, anchor: 'left top' });

    return width + metrics.width;
  }, 0);
}

function sharpTextAlign(align: TextAlign | undefined) {
  return align === 'center' ? 'centre' : (align ?? 'left');
}

function anchoredPosition(input: {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: TextAnchor;
}) {
  const anchor = input.anchor ?? 'start';
  const left =
    anchor === 'middle'
      ? input.x - input.width / 2
      : anchor === 'end'
        ? input.x - input.width
        : input.x;

  return { left, top: input.y - input.height / 2 };
}

async function rasterText(input: {
  text: string;
  fontSize: number;
  color: string;
  weight?: TextWeight;
  width?: number;
  align?: TextAlign;
  opacity?: number;
}) {
  const weight = input.weight ?? 'bold';

  if (textDirection(input.text) === 'rtl') {
    const textWidth = Math.max(
      1,
      Math.ceil(
        input.width ?? textWidthEstimate(input.text, input.fontSize, weight) + input.fontSize,
      ),
    );
    const textHeight = Math.max(1, Math.ceil(input.fontSize * 1.8));
    const buffer = await sharp({
      text: {
        text: `<span foreground="${input.color}">${escapeXml(input.text)}</span>`,
        font: `Noto Sans Arabic ${weight === 'bold' ? 'Bold' : 'Regular'} ${input.fontSize}`,
        fontfile: weight === 'bold' ? qrFontBoldFile : qrFontRegularFile,
        width: textWidth,
        height: textHeight,
        align: sharpTextAlign(input.align),
        rgba: true,
      },
    })
      .png()
      .toBuffer();

    if (input.opacity === undefined) {
      return buffer;
    }

    const metadata = await sharp(buffer).metadata();
    const maskWidth = metadata.width ?? textWidth;
    const maskHeight = metadata.height ?? textHeight;

    return sharp(buffer)
      .composite([
        {
          input: Buffer.from(
            `<svg width="${maskWidth}" height="${maskHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff" opacity="${input.opacity}"/></svg>`,
          ),
          blend: 'dest-in',
        },
      ])
      .png()
      .toBuffer();
  }

  const paths: string[] = [];
  let cursor = 0;
  let height = input.fontSize;

  for (const segment of textSegments(input.text)) {
    const renderer = textPathRenderers[segment.script][weight];
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

  return width <= input.width
    ? base
    : sharp(base).resize({ width: input.width, withoutEnlargement: true }).png().toBuffer();
}

async function textComposite(input: {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  weight?: TextWeight;
  width?: number;
  align?: TextAlign;
  anchor?: TextAnchor;
}) {
  const buffer = await rasterText(input);
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? input.width ?? 0;
  const height = metadata.height ?? input.fontSize;
  const position = anchoredPosition({
    x: input.x,
    y: input.y,
    width,
    height,
    anchor: input.anchor,
  });

  return {
    input: buffer,
    left: Math.round(position.left),
    top: Math.round(position.top),
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

function brandForMenu(
  menu: QrMenu,
  requestedLocale?: string,
  allowVenueLogo = true,
  custom = false,
) {
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
    logoUrls: allowVenueLogo
      ? [menu.branch.logoUrl, menu.branch.venue.logoUrl].filter(Boolean)
      : [],
    custom,
  };
}

type QrBrand = ReturnType<typeof brandForMenu>;

function isRtlBrand(brand: Pick<QrBrand, 'venueName' | 'branchName'>) {
  return textDirection(brand.venueName) === 'rtl' || textDirection(brand.branchName) === 'rtl';
}

function qrCopy(useArabic: boolean) {
  return useArabic
    ? {
        wasla: '\u0648\u0635\u0644\u0629',
        menuQr:
          '\u0642\u0627\u0626\u0645\u0629 \u0648\u0635\u0644\u0629 \u0627\u0644\u0631\u0642\u0645\u064a\u0647',
        scanToOpen:
          '\u0627\u0645\u0633\u062d \u0627\u0644\u0643\u0648\u062f \u0644\u062a\u0641\u062a\u062d \u0627\u0644\u0642\u0627\u0626\u0645\u0647',
        posterScan:
          '\u0627\u0645\u0633\u062d \u0627\u0644\u0643\u0648\u062f \u0644\u062a\u0641\u062a\u062d \u0627\u0644\u0642\u0627\u0626\u0645\u0647',
        poweredBy: '\u0645\u062f\u0639\u0648\u0645 \u0645\u0646 \u0648\u0635\u0644\u0629',
      }
    : {
        wasla: 'Wasla',
        menuQr: 'WASLA MENU QR',
        scanToOpen: 'Scan to open the menu',
        posterScan: 'SCAN THE MENU',
        poweredBy: 'Powered by Wasla',
      };
}

function shouldUseArabicQrCopy(
  requestedLocale: string | undefined,
  brand: { venueName: string; branchName: string },
) {
  return (
    requestedLocale === 'ar' ||
    textDirection(brand.venueName) === 'rtl' ||
    textDirection(brand.branchName) === 'rtl'
  );
}

function qrRenderData(input: QrRenderInput) {
  const brand = brandForMenu(input.menu, input.requestedLocale, input.allowVenueLogo, input.custom);
  const useArabicCopy = shouldUseArabicQrCopy(input.requestedLocale, brand);

  return {
    brand,
    useArabicCopy,
    copy: qrCopy(useArabicCopy),
    isRtlBrand: isRtlBrand(brand),
  };
}

async function fallbackCenterMarkPng(size: number, mark = 'W') {
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
        text: mark,
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

async function loadRemoteAssetBuffer(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch asset ${url}: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function centerMarkPng(size: number) {
  return waslaCenterMarkPng(size);
}

async function customCenterMarkPng(size: number, brand: QrBrand) {
  const logo = await firstLogoBuffer({
    logoUrls: brand.logoUrls,
    logoUrl: brand.venueLogoUrl,
  });

  if (!logo) {
    return fallbackCenterMarkPng(size, brand.venueName.charAt(0).toUpperCase() || 'V');
  }

  const background = Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#ffffff"/>
    </svg>
  `);
  const logoBody = await sharp(logo)
    .resize(Math.round(size * 0.72), Math.round(size * 0.72), {
      fit: 'contain',
      background: '#00000000',
    })
    .png()
    .toBuffer();

  return sharp(background)
    .composite([
      {
        input: logoBody,
        left: Math.round(size * 0.14),
        top: Math.round(size * 0.14),
      },
    ])
    .png()
    .toBuffer();
}

async function waslaCenterMarkPng(size: number) {
  for (const logoFile of waslaLogoSvgFiles) {
    try {
      const logoBuffer = logoFile.startsWith('http')
        ? await loadRemoteAssetBuffer(logoFile)
        : readFileSync(logoFile);

      return await sharp(logoBuffer)
        .resize(size, size, { fit: 'contain', background: '#00000000' })
        .png()
        .toBuffer();
    } catch {
      continue;
    }
  }

  return fallbackCenterMarkPng(size);
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

async function firstLogoBuffer(input: {
  logoUrl?: string | null;
  logoUrls?: Array<string | null | undefined>;
}) {
  for (const url of input.logoUrls ?? [input.logoUrl]) {
    const logo = await fetchLogo(url);

    if (logo) {
      return logo;
    }
  }

  return null;
}

function footerLayout(input: {
  width: number;
  isRtl: boolean;
  left?: number;
  ltrLogoOffset?: number;
}) {
  const left = input.left ?? 0;
  const ltrLogoOffset = input.ltrLogoOffset ?? 68;

  return {
    logoX: left + (input.isRtl ? input.width - 68 : ltrLogoOffset),
    textX: left + (input.isRtl ? input.width - 124 : 124),
    textWidth: input.width - 260,
    waslaX: left + (input.isRtl ? 34 : input.width - 34),
    textAnchor: input.isRtl ? ('end' as const) : ('start' as const),
    textAlign: input.isRtl ? ('center' as const) : ('left' as const),
    logoSide: input.isRtl ? ('right' as const) : ('left' as const),
  };
}

function brandFooterBaseSvg(input: { width: number; height: number; logoSide: 'left' | 'right' }) {
  const { width, height, logoSide } = input;
  const logoX = logoSide === 'right' ? width - 68 : 68;

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" rx="32" fill="#ffffff"/>
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="31" fill="none" stroke="#d6f3ef" stroke-width="2"/>
      <circle cx="${logoX}" cy="${height / 2}" r="38" fill="#ccfbf1"/>
    </svg>
  `);
}

async function brandFooterPng(input: {
  width: number;
  height: number;
  venueName: string;
  branchName: string;
  logoInitial: string;
  waslaLabel: string;
  showLogo?: boolean;
}) {
  const { width, height, venueName, branchName, logoInitial, waslaLabel } = input;
  const showLogo = input.showLogo ?? true;
  const isRtl = textDirection(venueName) === 'rtl' || textDirection(branchName) === 'rtl';
  const layout = footerLayout({ width, isRtl });
  const textX = showLogo ? layout.textX : layout.logoX;

  return sharp(
    showLogo
      ? brandFooterBaseSvg({ width, height, logoSide: layout.logoSide })
      : Buffer.from(`
          <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${width}" height="${height}" rx="32" fill="#ffffff"/>
            <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="31" fill="none" stroke="#d6f3ef" stroke-width="2"/>
          </svg>
        `),
  )
    .composite([
      ...(showLogo
        ? [
            await textComposite({
              text: logoInitial || 'V',
              x: layout.logoX,
              y: height / 2 + 2,
              fontSize: 34,
              color: qrColors.ink,
              anchor: 'middle',
            }),
          ]
        : []),
      await textComposite({
        text: labelText(venueName, 'Venue', 34),
        x: textX,
        y: 46,
        fontSize: isRtl ? 20 : 30,
        color: qrColors.stone,
        width: layout.textWidth,
        align: layout.textAlign,
        anchor: layout.textAnchor,
      }),
      await textComposite({
        text: labelText(branchName, 'Branch', 40),
        x: textX,
        y: 90,
        fontSize: isRtl ? 17 : 20,
        color: qrColors.muted,
        weight: 'regular',
        width: layout.textWidth,
        align: layout.textAlign,
        anchor: layout.textAnchor,
      }),
      ...(waslaLabel
        ? [
            await textComposite({
              text: waslaLabel,
              x: layout.waslaX,
              y: height - 18,
              fontSize: textDirection(waslaLabel) === 'rtl' ? 13 : 14,
              color: qrColors.inkSoft,
              anchor: isRtl ? 'start' : 'end',
            }),
          ]
        : []),
    ])
    .png()
    .toBuffer();
}

async function logoComposite(input: {
  logoUrl?: string | null;
  logoUrls?: Array<string | null | undefined>;
  left: number;
  top: number;
  size: number;
}) {
  const logo = await firstLogoBuffer(input);

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

export async function renderQrPng(input: QrRenderInput) {
  const { brand, useArabicCopy, copy, isRtlBrand } = qrRenderData(input);
  const codeBuffer = await QRCode.toBuffer(input.targetUrl, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: qrCodeFrame.size,
    color: { dark: qrColors.ink, light: '#ffffff' },
  });
  const baseSvg = Buffer.from(`
    <svg width="${qrCanvas.width}" height="${qrCanvas.height}" viewBox="0 0 ${qrCanvas.width} ${qrCanvas.height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${qrCanvas.width}" height="${qrCanvas.height}" fill="${qrColors.background}"/>
      <rect x="72" y="56" width="816" height="1038" rx="44" fill="#ffffff"/>
      <rect x="73" y="57" width="814" height="1036" rx="43" fill="none" stroke="#d9f3ef" stroke-width="2"/>
      <rect x="${qrCodeFrame.left - 18}" y="${qrCodeFrame.top - 18}" width="${qrCodeFrame.size + 36}" height="${qrCodeFrame.size + 36}" rx="36" fill="#ffffff" stroke="#ecfdf5" stroke-width="8"/>
      <rect x="346" y="74" width="268" height="30" rx="15" fill="#ffffff"/>
    </svg>
  `);
  const watermark = input.noWatermark
    ? null
    : await rasterText({
        text: copy.wasla,
        fontSize: useArabicCopy ? 88 : 102,
        color: '#d6f3ef',
        weight: 'bold',
        opacity: 0.42,
      });
  const logo = await logoComposite({
    logoUrls: brand.logoUrls,
    logoUrl: brand.venueLogoUrl,
    left: isRtlBrand ? qrFooterFrame.left + qrFooterFrame.width - 106 : qrFooterFrame.left + 22,
    top: qrFooterFrame.top + 28,
    size: 76,
  });
  const footer = await brandFooterPng({
    width: qrFooterFrame.width,
    height: qrFooterFrame.height,
    venueName: brand.venueName,
    branchName: brand.branchName,
    logoInitial: brand.venueName.charAt(0).toUpperCase(),
    waslaLabel: copy.poweredBy,
    showLogo: Boolean(logo),
  });
  const headerComposites = brand.custom
    ? [
        await textComposite({
          text: brand.venueName,
          x: 480,
          y: 74,
          fontSize: useArabicCopy ? 18 : 20,
          color: qrColors.stone,
          width: 520,
          align: 'center',
          anchor: 'middle',
        }),
        await textComposite({
          text: brand.branchName,
          x: 480,
          y: 99,
          fontSize: useArabicCopy ? 13 : 14,
          color: qrColors.inkSoft,
          width: 480,
          align: 'center',
          anchor: 'middle',
        }),
      ]
    : [
        await textComposite({
          text: copy.menuQr,
          x: 480,
          y: 92,
          fontSize: useArabicCopy ? 16 : 18,
          color: qrColors.inkSoft,
          width: useArabicCopy ? 330 : 268,
          align: 'center',
          anchor: 'middle',
        }),
      ];
  const composites: sharp.OverlayOptions[] = [
    { input: baseSvg, left: 0, top: 0 },
    ...(watermark
      ? [
          {
            input: await sharp(watermark).rotate(-24, { background: '#00000000' }).png().toBuffer(),
            left: 326,
            top: 152,
          },
        ]
      : []),
    ...headerComposites,
    { input: codeBuffer, left: qrCodeFrame.left, top: qrCodeFrame.top },
    {
      input: brand.custom
        ? await customCenterMarkPng(qrCenterMarkSize, brand)
        : await centerMarkPng(qrCenterMarkSize),
      left: qrCodeFrame.left + qrCodeFrame.size / 2 - qrCenterMarkSize / 2,
      top: qrCodeFrame.top + qrCodeFrame.size / 2 - qrCenterMarkSize / 2,
    },
    { input: footer, left: qrFooterFrame.left, top: qrFooterFrame.top },
    await textComposite({
      text: copy.scanToOpen,
      x: 480,
      y: 1078,
      fontSize: useArabicCopy ? 16 : 18,
      color: qrColors.muted,
      width: useArabicCopy ? 480 : 360,
      align: 'center',
      anchor: 'middle',
    }),
  ];

  if (logo) {
    composites.push(logo);
  }

  return sharp({
    create: {
      width: qrCanvas.width,
      height: qrCanvas.height,
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
  const moduleSize = qrCodeFrame.size / (modules.size + quiet * 2);
  const rects: string[] = [];

  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col)) {
        rects.push(
          `<rect x="${(qrCodeFrame.left + (col + quiet) * moduleSize).toFixed(3)}" y="${(qrCodeFrame.top + (row + quiet) * moduleSize).toFixed(3)}" width="${moduleSize.toFixed(3)}" height="${moduleSize.toFixed(3)}" fill="${qrColors.ink}"/>`,
        );
      }
    }
  }

  return rects.join('');
}

async function logoSvg(input: {
  logoUrl?: string | null;
  logoUrls?: Array<string | null | undefined>;
  x: number;
  y: number;
  size: number;
  fallbackInitial: string;
}) {
  const logo = await firstLogoBuffer(input);

  if (!logo) {
    return null;
  }

  return `
    <defs>
      <clipPath id="footerLogoClip">
        <circle cx="${input.x}" cy="${input.y}" r="${input.size / 2}"/>
      </clipPath>
    </defs>
    <image
      href="data:image/png;base64,${logo.toString('base64')}"
      x="${input.x - input.size / 2}"
      y="${input.y - input.size / 2}"
      width="${input.size}"
      height="${input.size}"
      preserveAspectRatio="xMidYMid slice"
      clip-path="url(#footerLogoClip)"
    />
  `;
}

async function svgTextImage(input: {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  weight?: TextWeight;
  width?: number;
  align?: TextAlign;
  anchor?: TextAnchor;
  opacity?: number;
  rotate?: number;
}) {
  const buffer = await rasterText(input);
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? input.width ?? 0;
  const height = metadata.height ?? input.fontSize;
  const position = anchoredPosition({
    x: input.x,
    y: input.y,
    width,
    height,
    anchor: input.anchor,
  });
  const image = `
    <image
      href="data:image/png;base64,${buffer.toString('base64')}"
      x="${position.left}"
      y="${position.top}"
      width="${width}"
      height="${height}"
      preserveAspectRatio="xMidYMid meet"
    />
  `;

  return input.rotate
    ? `<g transform="rotate(${input.rotate} ${input.x} ${input.y})">${image}</g>`
    : image;
}

async function centerMarkSvg(input: { x: number; y: number; size: number; brand: QrBrand }) {
  const markPng = input.brand.custom
    ? await customCenterMarkPng(input.size, input.brand)
    : await centerMarkPng(input.size);

  return `
    <image
      href="data:image/png;base64,${markPng.toString('base64')}"
      x="${input.x - input.size / 2}"
      y="${input.y - input.size / 2}"
      width="${input.size}"
      height="${input.size}"
      preserveAspectRatio="xMidYMid meet"
    />
  `;
}

export async function renderQrSvg(input: QrRenderInput) {
  const { brand, useArabicCopy, copy, isRtlBrand } = qrRenderData(input);
  const layout = footerLayout({
    width: qrFooterFrame.width,
    left: qrFooterFrame.left,
    isRtl: isRtlBrand,
    ltrLogoOffset: 60,
  });
  const footerLogoSvg = await logoSvg({
    logoUrls: brand.logoUrls,
    logoUrl: brand.venueLogoUrl,
    x: layout.logoX,
    y: 952,
    size: 76,
    fallbackInitial: brand.venueName.charAt(0).toUpperCase(),
  });

  const watermarkSvg = input.noWatermark
    ? null
    : await svgTextImage({
        text: copy.wasla,
        x: 480,
        y: 210,
        fontSize: useArabicCopy ? 88 : 102,
        color: '#d6f3ef',
        weight: 'bold',
        opacity: 0.42,
        anchor: 'middle',
        rotate: -24,
      });
  const headerTextSvg = brand.custom
    ? `${await svgTextImage({
        text: brand.venueName,
        x: 480,
        y: 74,
        fontSize: useArabicCopy ? 18 : 20,
        color: qrColors.stone,
        width: 520,
        align: 'center',
        anchor: 'middle',
      })}
      ${await svgTextImage({
        text: brand.branchName,
        x: 480,
        y: 99,
        fontSize: useArabicCopy ? 13 : 14,
        color: qrColors.inkSoft,
        width: 480,
        align: 'center',
        anchor: 'middle',
      })}`
    : await svgTextImage({
        text: copy.menuQr,
        x: 480,
        y: 92,
        fontSize: useArabicCopy ? 16 : 18,
        color: qrColors.inkSoft,
        width: useArabicCopy ? 330 : 268,
        align: 'center',
        anchor: 'middle',
      });
  const venueTextSvg = await svgTextImage({
    text: labelText(brand.venueName, 'Venue', 34),
    x: footerLogoSvg ? layout.textX : layout.logoX,
    y: 932,
    fontSize: isRtlBrand ? 20 : 30,
    color: qrColors.stone,
    width: layout.textWidth,
    align: layout.textAlign,
    anchor: layout.textAnchor,
  });
  const branchTextSvg = await svgTextImage({
    text: labelText(brand.branchName, 'Branch', 40),
    x: footerLogoSvg ? layout.textX : layout.logoX,
    y: 976,
    fontSize: isRtlBrand ? 17 : 20,
    color: qrColors.muted,
    weight: 'regular',
    width: layout.textWidth,
    align: layout.textAlign,
    anchor: layout.textAnchor,
  });
  const waslaTextSvg = await svgTextImage({
    text: copy.poweredBy,
    x: layout.waslaX,
    y: 1000,
    fontSize: useArabicCopy ? 13 : 14,
    color: qrColors.inkSoft,
    anchor: isRtlBrand ? 'start' : 'end',
  });
  const scanTextSvg = await svgTextImage({
    text: copy.scanToOpen,
    x: 480,
    y: 1078,
    fontSize: useArabicCopy ? 16 : 18,
    color: qrColors.muted,
    width: useArabicCopy ? 480 : 360,
    align: 'center',
    anchor: 'middle',
  });
  const centerMarkSvgContent = await centerMarkSvg({
    x: 480,
    y: 464,
    size: qrCenterMarkSize,
    brand,
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
    <svg width="${qrCanvas.width}" height="${qrCanvas.height}" viewBox="0 0 ${qrCanvas.width} ${qrCanvas.height}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="${qrCanvas.width}" height="${qrCanvas.height}" fill="${qrColors.background}"/>
      ${watermarkSvg}
      <rect x="72" y="56" width="816" height="1038" rx="44" fill="#ffffff"/>
      <rect x="73" y="57" width="814" height="1036" rx="43" fill="none" stroke="#d9f3ef" stroke-width="2" />
      <rect x="${qrCodeFrame.left - 18}" y="${qrCodeFrame.top - 18}" width="${qrCodeFrame.size + 36}" height="${qrCodeFrame.size + 36}" rx="36" fill="#ffffff" stroke="#ecfdf5" stroke-width="8" />
      <rect x="346" y="74" width="268" height="30" rx="15" fill="#ffffff" />
      ${headerTextSvg}
      ${qrSvgModules(input.targetUrl)}
      ${centerMarkSvgContent}
      <rect x="${qrFooterFrame.left}" y="${qrFooterFrame.top}" width="${qrFooterFrame.width}" height="${qrFooterFrame.height}" rx="32" fill="#ffffff" stroke="#d6f3ef" stroke-width="2" />
      ${footerLogoSvg}
      ${venueTextSvg}
      ${branchTextSvg}
      ${waslaTextSvg}
      ${scanTextSvg}
    </svg>`;
}

export async function renderPosterPng(input: QrRenderInput) {
  const qrPng = await renderQrPng(input);
  const { brand, useArabicCopy, copy } = qrRenderData(input);
  const header = Buffer.from(`
    <svg width="${qrPosterCanvas.width}" height="${qrPosterCanvas.height}" viewBox="0 0 ${qrPosterCanvas.width} ${qrPosterCanvas.height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${qrPosterCanvas.width}" height="${qrPosterCanvas.height}" fill="${qrColors.ink}"/>
      <rect x="116" y="358" width="968" height="1170" rx="56" fill="#ffffff"/>
    </svg>
  `);
  const posterWatermark = input.noWatermark
    ? null
    : await rasterText({
        text: copy.wasla,
        fontSize: useArabicCopy ? 130 : 150,
        color: '#115e59',
        weight: 'bold',
        opacity: 0.36,
      });

  return sharp({
    create: {
      width: qrPosterCanvas.width,
      height: qrPosterCanvas.height,
      channels: 4,
      background: qrColors.ink,
    },
  })
    .composite([
      { input: header, left: 0, top: 0 },
      ...(posterWatermark
        ? [
            {
              input: await sharp(posterWatermark)
                .rotate(-18, { background: '#00000000' })
                .png()
                .toBuffer(),
              left: 380,
              top: 202,
            },
          ]
        : []),
      await textComposite({
        text: copy.posterScan,
        x: 600,
        y: 110,
        fontSize: useArabicCopy ? 22 : 24,
        color: qrColors.amber,
        width: useArabicCopy ? 560 : 360,
        align: 'center',
        anchor: 'middle',
      }),
      await textComposite({
        text: labelText(brand.venueName, 'Venue', 26),
        x: 600,
        y: 194,
        fontSize: useArabicCopy ? 48 : 68,
        color: '#ffffff',
        width: 650,
        align: 'center',
        anchor: 'middle',
      }),
      await textComposite({
        text: labelText(brand.branchName, 'Branch', 34),
        x: 600,
        y: 275,
        fontSize: useArabicCopy ? 24 : 28,
        color: '#99f6e4',
        width: 760,
        align: 'center',
        anchor: 'middle',
      }),
      { input: await sharp(qrPng).resize(840, 1015).png().toBuffer(), left: 180, top: 430 },
      await textComposite({
        text: copy.poweredBy,
        x: 600,
        y: 1480,
        fontSize: useArabicCopy ? 20 : 22,
        color: '#115e59',
        width: useArabicCopy ? 480 : 360,
        align: 'center',
        anchor: 'middle',
      }),
    ])
    .png()
    .toBuffer();
}
