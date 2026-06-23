import { z } from 'zod';
import { egyptPhoneSchema } from '../../common/validation/egypt-phone';

export const createVenueUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: egyptPhoneSchema,
  email: z.string().email().optional(),
  password: z.string().min(8).max(128),
  role: z.enum(['MANAGER', 'STAFF']).default('STAFF'),
  branchIds: z.array(z.string().uuid()).default([]),
});

export const updateUserBranchesSchema = z.object({
  branchIds: z.array(z.string().uuid()),
});

export const userParamsSchema = z.object({
  userId: z.string().uuid(),
});

export const userListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
});
