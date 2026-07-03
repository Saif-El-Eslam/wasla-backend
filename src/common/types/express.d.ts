import type { SessionPayload } from '../middleware/auth.middleware';
import type { PaginationOptions } from '../pagination/pagination';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: SessionPayload;
      locale?: string;
      t?: (key: string, values?: Record<string, string | number>) => string;
      pagination?: PaginationOptions;

      validated?: {
        body?: unknown;
        params?: unknown;
        query?: unknown;
      };
    }
  }
}

export {};
