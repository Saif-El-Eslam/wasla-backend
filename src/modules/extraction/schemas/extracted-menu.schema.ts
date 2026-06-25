import { z } from 'zod';
import { localizedTextSchema } from '../../../common/i18n/localized-text.schema';

const optionalUuidSchema = z.string().uuid().optional();
const menuThemeSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return 'MODERN';
  }

  const normalized = value.trim().toUpperCase();

  return ['CLASSIC', 'MODERN', 'MINIMAL'].includes(normalized) ? normalized : 'MODERN';
}, z.enum(['CLASSIC', 'MODERN', 'MINIMAL']));

export const extractedPriceSchema = z.object({
  id: optionalUuidSchema,
  label: z.string().trim().min(1).max(32).default('Regular'),
  price: z.coerce.number().nonnegative(),
  sortOrder: z.number().int().min(0).optional(),
});

export const extractedItemSchema = z.object({
  id: optionalUuidSchema,
  name: localizedTextSchema,
  description: localizedTextSchema.optional(),
  price: z.coerce.number().nonnegative().optional(),
  prices: z.array(extractedPriceSchema).min(1).max(5).optional(),
  imageUrl: z.string().url().or(z.literal('')).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).default([]),
  calories: z.coerce.number().int().nonnegative().optional(),
  available: z.boolean().default(true),
  sortOrder: z.number().int().min(0).optional(),
});

export const extractedCategorySchema = z.object({
  id: optionalUuidSchema,
  name: localizedTextSchema,
  description: localizedTextSchema.optional(),
  imageUrl: z.string().url().or(z.literal('')).optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).optional(),
  items: z.array(extractedItemSchema).default([]),
});

export const extractedMenuSchema = z.object({
  menu: z.object({
    id: optionalUuidSchema,
    name: localizedTextSchema,
    theme: menuThemeSchema.default('MODERN'),
    showPrices: z.boolean().default(true),
  }),
  categories: z.array(extractedCategorySchema).default([]),
  warnings: z.array(z.string().trim().min(1)).default([]),
});

export const approveExtractionSchema = z.object({
  extractedMenu: extractedMenuSchema.optional(),
});

export const rejectExtractionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const extractionParamsSchema = z.object({
  branchId: z.string().uuid(),
});

export const extractionJobParamsSchema = extractionParamsSchema.extend({
  jobId: z.string().uuid(),
});

export type ExtractedMenu = z.infer<typeof extractedMenuSchema>;
export type ExtractedCategory = z.infer<typeof extractedCategorySchema>;
export type ExtractedItem = z.infer<typeof extractedItemSchema>;
