import { z } from 'zod';

export const analyticsQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d', 'all']).default('7d'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  branchId: z.uuid().optional(),
});
