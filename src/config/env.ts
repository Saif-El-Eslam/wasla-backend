import 'dotenv/config';
import { z } from 'zod';

const optionalIntegrationFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

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
  GEMINI_MAX_INLINE_REQUEST_MB: z.coerce.number().int().positive().default(5),
  GEMINI_EXTRACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  GEMINI_HTTP_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  EXTRACTION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  EXTRACTION_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(5_000),
  EXTRACTION_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  EXTRACTION_MANUAL_RETRY_WINDOW_MS: z.coerce.number().int().positive().default(86_400_000),
  EXTRACTION_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  EXTRACTION_MAINTENANCE_MAX_JOBS: z.coerce.number().int().positive().max(20).default(1),
  EXTRACTION_STALE_JOB_AFTER_MS: z.coerce.number().int().positive().default(330_000),
  EXTRACTION_STALE_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(150_000),
  CRON_SECRET: z.string().min(16).optional(),
  WHATSAPP_ENABLED: optionalIntegrationFlag,
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).optional(),
  WHATSAPP_API_BASE_URL: z.url().default('https://graph.facebook.com'),
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(16).optional(),
  WHATSAPP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  PAYMOB_ENABLED: optionalIntegrationFlag,
  PAYMOB_SECRET_KEY: z.string().min(1).optional(),
  PAYMOB_PUBLIC_KEY: z.string().min(1).optional(),
  PAYMOB_HMAC_SECRET: z.string().min(1).optional(),
  PAYMOB_API_BASE_URL: z.url().default('https://accept.paymob.com'),
  PAYMOB_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
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
