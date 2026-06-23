import { z } from 'zod';

export const localizedTextSchema = z
  .record(z.string().min(1), z.string().trim().min(1))
  .refine((value) => Boolean(value.ar || value.en), {
    message: 'At least Arabic or English text is required',
  });
