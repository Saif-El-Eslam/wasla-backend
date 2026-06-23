import { z } from 'zod';
import { localizedTextSchema } from '../../common/i18n/localized-text.schema';

export const branchMenuParamsSchema = z.object({
  branchId: z.string().uuid(),
});

export const categoryParamsSchema = branchMenuParamsSchema.extend({
  categoryId: z.string().uuid(),
});

export const itemParamsSchema = categoryParamsSchema.extend({
  itemId: z.string().uuid(),
});

export const createMenuSchema = z.object({
  name: localizedTextSchema,
  theme: z.enum(['CLASSIC', 'MODERN', 'MINIMAL']).default('MODERN'),
  showPrices: z.boolean().default(true),
});

export const updateMenuSchema = createMenuSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

export const createCategorySchema = z.object({
  name: localizedTextSchema,
  description: localizedTextSchema.optional(),
  imageUrl: z.string().url().or(z.literal('')).optional(),
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

export const reorderCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid()).min(1),
});

const itemPriceSchema = z.object({
  label: z.string().trim().min(1).max(24),
  price: z.coerce.number().nonnegative(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createItemSchema = z.object({
  name: localizedTextSchema,
  description: localizedTextSchema.optional(),
  price: z.coerce.number().nonnegative().optional(),
  prices: z.array(itemPriceSchema).min(1).optional(),
  imageUrl: z.string().url().or(z.literal('')).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  calories: z.coerce.number().int().nonnegative().optional(),
  available: z.boolean().default(true),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateItemSchema = createItemSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

export const reorderItemsSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
});

export const toggleAvailabilitySchema = z.object({
  available: z.boolean().optional(),
});
