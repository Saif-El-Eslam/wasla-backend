import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().min(1).default('api/v1'),
  FRONTEND_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  PUBLIC_API_ORIGIN: z.url().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(240),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  CODE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  AUTHENTICATED_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  PUBLIC_ANALYTICS_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
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
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_URL: z.string().optional(),
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

export function isAllowedCorsOrigin(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  if (corsOrigins.includes(origin)) {
    return true;
  }

  if (env.NODE_ENV !== 'production') {
    try {
      const url = new URL(origin);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      const isNgrokFreeDev = url.protocol === 'https:' && url.hostname.endsWith('.ngrok-free.dev');

      return isLocalhost || isNgrokFreeDev;
    } catch {
      return false;
    }
  }

  return false;
}

export const frontendUrl = new URL(corsOrigins[0]);
