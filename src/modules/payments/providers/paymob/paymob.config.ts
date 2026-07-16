import { env } from '../../../../config/env';
import { PaymobConfigurationError } from './paymob.errors';

export type PaymobConfig = {
  secretKey: string;
  publicKey: string;
  hmacSecret: string;
  apiBaseUrl: string;
  requestTimeoutMs: number;
};

export function createPaymobConfig(): PaymobConfig | null {
  if (!env.PAYMOB_ENABLED) {
    return null;
  }

  const required = {
    PAYMOB_SECRET_KEY: env.PAYMOB_SECRET_KEY,
    PAYMOB_PUBLIC_KEY: env.PAYMOB_PUBLIC_KEY,
    PAYMOB_HMAC_SECRET: env.PAYMOB_HMAC_SECRET,
  };
  const missingKeys = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new PaymobConfigurationError(missingKeys);
  }

  return {
    secretKey: env.PAYMOB_SECRET_KEY!,
    publicKey: env.PAYMOB_PUBLIC_KEY!,
    hmacSecret: env.PAYMOB_HMAC_SECRET!,
    apiBaseUrl: env.PAYMOB_API_BASE_URL,
    requestTimeoutMs: env.PAYMOB_REQUEST_TIMEOUT_MS,
  };
}
