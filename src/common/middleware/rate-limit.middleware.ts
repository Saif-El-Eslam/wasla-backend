import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../../config/env';
import type { RequestHandler } from 'express';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  perUser?: boolean;
};

// this middleware is used to limit the number of requests a user can make to the API
// per IP address or per user within a certain time window. It helps prevent abuse
// and ensures fair usage of the API.
export function rateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    identifier: options.keyPrefix ?? 'api',
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      if (options.perUser && req.user?.sub) {
        return `${options.keyPrefix ?? 'user'}:user:${req.user.sub}`;
      }

      return `${options.keyPrefix ?? 'ip'}:ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
    },
    message: {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again shortly.',
      },
    },
  });
}

// The following are specific rate limiters for different parts of the application,
// each with its own configuration based on the expected usage patterns and security requirements.

// 1. API Rate Limiter: Limits the number of requests to the API endpoints.
// (240 requests per minute per IP address)
export const apiRateLimit = rateLimitMiddleware({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  keyPrefix: 'api',
});

// 2. Auth Rate Limiter: Limits the number of requests to the authentication endpoints.
// (30 requests per minute per IP address)
export const authRateLimit = rateLimitMiddleware({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  keyPrefix: 'auth',
});

// 3. Code Rate Limiter: Limits the number of requests to the code endpoints.
// (12 requests per minute per IP address)
export const codeRateLimit = rateLimitMiddleware({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.CODE_RATE_LIMIT_MAX,
  keyPrefix: 'code',
});

// 4. Public Analytics Rate Limiter: Limits the number of requests to the public analytics endpoints.
// (120 requests per minute per IP address)
export const publicAnalyticsRateLimit = rateLimitMiddleware({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.PUBLIC_ANALYTICS_RATE_LIMIT_MAX,
  keyPrefix: 'public-analytics',
});

// 5. Authenticated Rate Limiter: Limits the number of requests to the authenticated endpoints.
// (600 requests per minute per IP address or per user)
export const authenticatedRateLimit = rateLimitMiddleware({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTHENTICATED_RATE_LIMIT_MAX,
  keyPrefix: 'authenticated',
  perUser: true,
});
