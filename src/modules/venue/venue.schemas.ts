import { z } from 'zod';
import { localizedTextSchema } from '../../common/i18n/localized-text.schema';
import { egyptPhoneSchema } from '../../common/validation/egypt-phone';

const optionalUrl = z.string().url().or(z.literal('')).optional();

export const setupVenueSchema = z.object({
  type: z
    .enum([
      'RESTAURANT',
      'CAFE',
      'BAKERY',
      'DESSERT_SHOP',
      'FOOD_TRUCK',
      'CLOUD_KITCHEN',
      'CATERING',
      'LOUNGE',
      'OTHER',
    ])
    .default('RESTAURANT'),
  name: localizedTextSchema,
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  logoUrl: optionalUrl,
  coverUrl: optionalUrl,
  description: localizedTextSchema.optional(),
  defaultLocale: z.enum(['ar', 'en']).default('ar'),
  supportedLocales: z.array(z.enum(['ar', 'en'])).min(1).default(['ar', 'en']),
  phone: egyptPhoneSchema.optional(),
  whatsapp: egyptPhoneSchema.optional(),
  address: localizedTextSchema.optional(),
  googleMapsUrl: optionalUrl,
  instagramUrl: optionalUrl,
  facebookUrl: optionalUrl,
  branchName: localizedTextSchema,
  branchSlug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export const updateVenueSchema = setupVenueSchema
  .omit({ branchName: true, branchSlug: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });
