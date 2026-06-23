import { z } from 'zod';

export const analyticsQuerySchema = z.object({
  period: z.enum(['7d', '30d']).default('7d'),
  branchId: z.string().uuid().optional(),
});
