import { env } from '../../../../config/env';
import { WhatsAppConfigurationError } from './whatsapp.errors';

export type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
  apiBaseUrl: string;
  appSecret?: string;
  verifyToken?: string;
  requestTimeoutMs: number;
};

export function createWhatsAppConfig(): WhatsAppConfig | null {
  if (!env.WHATSAPP_ENABLED) {
    return null;
  }

  const required = {
    WHATSAPP_ACCESS_TOKEN: env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_GRAPH_API_VERSION: env.WHATSAPP_GRAPH_API_VERSION,
  };
  const missingKeys = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new WhatsAppConfigurationError(missingKeys);
  }

  return {
    accessToken: env.WHATSAPP_ACCESS_TOKEN!,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID!,
    graphApiVersion: env.WHATSAPP_GRAPH_API_VERSION!,
    apiBaseUrl: env.WHATSAPP_API_BASE_URL,
    appSecret: env.WHATSAPP_APP_SECRET,
    verifyToken: env.WHATSAPP_VERIFY_TOKEN,
    requestTimeoutMs: env.WHATSAPP_REQUEST_TIMEOUT_MS,
  };
}
