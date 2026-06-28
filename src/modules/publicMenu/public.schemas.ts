import { AnalyticsEventType, VenueType } from '@prisma/client';
import { z } from 'zod';

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const publicVenueListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  type: z.enum(VenueType).optional(),
});

export const publicVenueParamsSchema = z.object({
  venueSlug: slugSchema,
});

export const publicBranchMenuParamsSchema = z.object({
  venueSlug: slugSchema,
  branchSlug: slugSchema,
});

export const publicShortCodeParamsSchema = z.object({
  code: z.string().trim().min(3).max(32),
});

export const publicAnalyticsEventSchema = z.object({
  eventType: z.enum(AnalyticsEventType),
  venueId: z.uuid(),
  branchId: z.uuid().optional(),
  menuId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  itemId: z.uuid().optional(),
});
