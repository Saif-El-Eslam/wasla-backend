import { z } from 'zod';

export const qrParamsSchema = z.object({
  branchId: z.uuid(),
});
