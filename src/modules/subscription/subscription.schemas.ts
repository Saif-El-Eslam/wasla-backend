import { MenuPlan, SubscriptionStatus } from '@prisma/client';
import { z } from 'zod';
import { planFeatureValueTypes } from './subscription.constants';

const localizedTextSchema = z.object({
  en: z.string().min(1).max(120),
  ar: z.string().min(1).max(120),
});

const localizedDescriptionSchema = z
  .object({
    en: z.string().max(300).optional(),
    ar: z.string().max(300).optional(),
  })
  .optional();
const stableIdSchema = z.string().trim().min(1).max(120);

export const adminVenueQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(SubscriptionStatus).optional(),
  plan: z.enum(MenuPlan).optional(),
});

export const venueIdParamsSchema = z.object({
  venueId: z.uuid(),
});

export const planIdParamsSchema = z.object({
  planId: stableIdSchema,
});

export const featureIdParamsSchema = z.object({
  featureId: stableIdSchema,
});

export const mappingIdParamsSchema = z.object({
  mappingId: stableIdSchema,
});

export const updateVenueSubscriptionSchema = z.object({
  plan: z.enum(MenuPlan),
  status: z.enum(SubscriptionStatus).default('ACTIVE'),
  currentPeriodEnds: z.coerce.date().nullable().optional(),
  paymentProvider: z.enum(['MANUAL', 'PAYMOB']).default('MANUAL'),
  notes: z.string().max(500).nullable().optional(),
  recreate: z.boolean().optional(),
});

export const upsertPlanSchema = z.object({
  code: z.enum(MenuPlan),
  publicName: localizedTextSchema,
  internalName: z.string().min(1).max(80),
  description: localizedDescriptionSchema,
  priceAnnualEgp: z.number().int().min(0).nullable().optional(),
  displayOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  comingSoon: z.boolean().default(false),
});

export const updatePlanSchema = upsertPlanSchema.partial();

export const upsertFeatureSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[A-Z0-9_]+$/),
  name: localizedTextSchema,
  description: localizedDescriptionSchema,
  valueType: z.enum(planFeatureValueTypes).default('BOOLEAN'),
  unit: z.string().max(60).nullable().optional(),
  displayOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

export const updateFeatureSchema = upsertFeatureSchema.partial();

export const upsertPlanFeatureMappingSchema = z.object({
  planId: stableIdSchema,
  featureId: stableIdSchema,
  enabled: z.boolean().default(true),
  valueInt: z.number().int().nullable().optional(),
  valueBool: z.boolean().nullable().optional(),
  valueString: z.string().max(160).nullable().optional(),
  valueJson: z.unknown().optional(),
});

export const updatePlanFeatureMappingSchema = upsertPlanFeatureMappingSchema
  .omit({ planId: true, featureId: true })
  .partial();
