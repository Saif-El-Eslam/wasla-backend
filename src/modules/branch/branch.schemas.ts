import { z } from 'zod';
import { localizedTextSchema } from '../../common/i18n/localized-text.schema';
import { egyptPhoneSchema } from '../../common/validation/egypt-phone';

const branchPayloadSchema = z.object({
  name: localizedTextSchema,
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  active: z.boolean().default(true),
  logoUrl: z.string().url().or(z.literal('')).optional(),
  coverUrl: z.string().url().or(z.literal('')).optional(),
  phone: egyptPhoneSchema.optional(),
  whatsapp: egyptPhoneSchema.optional(),
  address: localizedTextSchema.optional(),
  googleMapsUrl: z.string().url().or(z.literal('')).optional(),
  instagramUrl: z.string().url().or(z.literal('')).optional(),
  facebookUrl: z.string().url().or(z.literal('')).optional(),
  openingHours: z.object({ from: z.string(), to: z.string() }).optional(),
});

export const createBranchSchema = branchPayloadSchema;

export const updateBranchSchema = branchPayloadSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

export const branchParamsSchema = z.object({
  branchId: z.string().uuid(),
});

export const branchListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  view: z.enum(['full', 'options', 'management']).default('full'),
});
