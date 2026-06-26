import sharp from 'sharp';
import { env } from '../../config/env';
import { HttpError } from '../../common/http/http-error';
import { extractedMenuSchema, type ExtractedMenu } from './extracted-menu.schema';

type ParserImage = {
  buffer: Buffer;
  mimeType: string;
};

type ParserResult = {
  extractedMenu: ExtractedMenu;
  confidenceScore: number;
  rawModelResponse: string;
  warnings: string[];
};

function promptForMenuExtraction() {
  return `
You are a professional menu extraction assistant.
Analyze all provided menu images and extract every visible category and menu item.
Return JSON only, matching the provided schema.

Rules:
- Extract all categories.
- Extract all menu items.
- Extract item descriptions if available.
- Use LocalizedText objects for every menu/category/item name and description: {"ar":"...", "en":"..."}.
- Any localized text must have at least Arabic and English text.
- If a value is visible in Arabic, put it in ar. If visible in English or Latin script, put it in en.
- If only one language is visible, Translate the missing language. Arabic and English are mandatory.
- Do not invent descriptions, calories, allergens, or tags. Use empty/omitted fields when unclear.
- Prices must be numbers without currency symbols.
- Multiple sizes/options should be prices with short labels, up to 5 options.
- menu.theme must be exactly one of: CLASSIC, MODERN, MINIMAL. Use MODERN unless the photo clearly suggests another theme.
- menu.showPrices must be true when any visible item has a price.
- Keep categories and items in the order they appear.
- Put uncertainties in warnings.
- Exclude existing categories and items from the response.
`;
}

async function prepareInlineImages(images: ParserImage[]) {
  const prepared = await Promise.all(
    images.map(async (image) => {
      const buffer = await sharp(image.buffer)
        .rotate()
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();

      return {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: 'image/jpeg',
        },
        byteLength: buffer.byteLength,
      };
    }),
  );

  const totalBytes = prepared.reduce((sum, image) => sum + image.byteLength, 0);
  const maxInlineBytes = env.GEMINI_MAX_INLINE_REQUEST_MB * 1024 * 1024;

  if (totalBytes > maxInlineBytes) {
    throw new HttpError(413, 'errors.extractionImagesTooLarge');
  }

  return prepared.map(({ byteLength: _byteLength, ...image }) => image);
}

function buildResponseSchema(Type: {
  OBJECT: unknown;
  ARRAY: unknown;
  STRING: unknown;
  NUMBER: unknown;
  BOOLEAN: unknown;
}) {
  const menuThemeSchema = {
    type: Type.STRING,
    enum: ['CLASSIC', 'MODERN', 'MINIMAL'],
  };

  const localizedTextSchema = {
    type: Type.OBJECT,
    properties: {
      ar: { type: Type.STRING },
      en: { type: Type.STRING },
    },
    required: ['ar', 'en'],
  };

  const priceSchema = {
    type: Type.OBJECT,
    properties: {
      label: { type: Type.STRING },
      price: { type: Type.NUMBER },
      sortOrder: { type: Type.NUMBER },
    },
    required: ['label', 'price'],
  };

  const itemSchema = {
    type: Type.OBJECT,
    properties: {
      name: localizedTextSchema,
      description: localizedTextSchema,
      price: { type: Type.NUMBER },
      prices: {
        type: Type.ARRAY,
        items: priceSchema,
      },
      imageUrl: { type: Type.STRING },
      tags: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      calories: { type: Type.NUMBER },
      available: { type: Type.BOOLEAN },
      sortOrder: { type: Type.NUMBER },
    },
    required: ['name', 'tags', 'available'],
  };

  const categorySchema = {
    type: Type.OBJECT,
    properties: {
      name: localizedTextSchema,
      description: localizedTextSchema,
      imageUrl: { type: Type.STRING },
      active: { type: Type.BOOLEAN },
      sortOrder: { type: Type.NUMBER },
      items: {
        type: Type.ARRAY,
        items: itemSchema,
      },
    },
    required: ['name', 'active', 'items'],
  };

  return {
    type: Type.OBJECT,
    properties: {
      menu: {
        type: Type.OBJECT,
        properties: {
          name: localizedTextSchema,
          theme: menuThemeSchema,
          showPrices: { type: Type.BOOLEAN },
        },
        required: ['name', 'theme', 'showPrices'],
      },
      categories: {
        type: Type.ARRAY,
        items: categorySchema,
      },
      warnings: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
    required: ['menu', 'categories', 'warnings'],
  };
}

function parseJsonResponse(text: string) {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!unfenced) {
    throw new HttpError(502, 'errors.extractionInvalidModelResponse');
  }

  return JSON.parse(unfenced);
}

function confidenceFor(menu: ExtractedMenu) {
  const itemCount = menu.categories.reduce((sum, category) => sum + category.items.length, 0);
  const pricedItems = menu.categories.reduce(
    (sum, category) =>
      sum +
      category.items.filter((item) => item.price !== undefined || (item.prices?.length ?? 0) > 0)
        .length,
    0,
  );
  const itemCoverage = itemCount === 0 ? 0 : pricedItems / itemCount;
  const warningPenalty = Math.min(menu.warnings.length * 0.05, 0.25);
  const categoryScore = menu.categories.length > 0 ? 0.25 : 0;
  const itemScore = itemCount > 0 ? 0.35 : 0;
  const priceScore = itemCoverage * 0.35;

  return Math.max(
    0.1,
    Math.min(0.98, Number((categoryScore + itemScore + priceScore - warningPenalty).toFixed(2))),
  );
}

export async function parseMenuImages(images: ParserImage[]): Promise<ParserResult> {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(503, 'errors.geminiNotConfigured');
  }

  const { GoogleGenAI, Type } = await import('@google/genai');
  const inlineImages = await prepareInlineImages(images);
  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const result = await client.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: [promptForMenuExtraction(), ...inlineImages],
    config: {
      responseMimeType: 'application/json',
      responseSchema: buildResponseSchema(Type),
      temperature: env.GEMINI_TEMPERATURE,
    },
  });
  const rawModelResponse = String(result.text ?? '');
  const parsed = extractedMenuSchema.parse(parseJsonResponse(rawModelResponse));

  return {
    extractedMenu: parsed,
    confidenceScore: confidenceFor(parsed),
    rawModelResponse,
    warnings: parsed.warnings,
  };
}
