import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().min(1).default('api/v1'),
  FRONTEND_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  PUBLIC_API_ORIGIN: z.url().optional(),
  DATABASE_URL: z.url(),
  DIRECT_URL: z.url().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_NAME: z.string().min(1).default('wasla_session'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.url().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  GEMINI_MAX_IMAGES_PER_EXTRACTION: z.coerce.number().int().positive().default(8),
  GEMINI_MAX_INLINE_REQUEST_MB: z.coerce.number().int().positive().default(20),
});

export const env = envSchema.parse(process.env);

export const corsOrigins = env.FRONTEND_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
