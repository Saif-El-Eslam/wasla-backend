import { GuestFeedbackStatus } from '@prisma/client';
import { z } from 'zod';

const optionalBooleanQueryParam = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }

  return value;
}, z.boolean().optional());

export const publicFeedbackSchema = z.object({
  venueId: z.uuid(),
  branchId: z.uuid(),
  menuId: z.uuid().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
  locale: z.enum(['ar', 'en']).optional(),
});

export const publicFeedbackClickSchema = z.object({
  feedbackId: z.uuid(),
});

export const feedbackQuerySchema = z.object({
  branchId: z.uuid().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  status: z.enum(GuestFeedbackStatus).optional(),
  issueOnly: optionalBooleanQueryParam,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const feedbackParamsSchema = z.object({
  feedbackId: z.uuid(),
});

export const updateFeedbackStatusSchema = z.object({
  status: z.enum(GuestFeedbackStatus),
});
