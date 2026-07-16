import { WhatsAppRequestError } from './whatsapp.errors';
import type {
  NotificationDeliveryReceipt,
  NotificationProvider,
} from '../../notification.provider';
import type { WhatsAppConfig } from './whatsapp.config';
import type {
  SendWhatsAppOtpInput,
  SendWhatsAppTemplateInput,
  WhatsAppSendResponse,
  WhatsAppTemplateComponent,
} from './whatsapp.types';

function normalizeRecipient(phone: string) {
  const normalized = phone.trim().replace(/^\+/, '');

  if (!/^[1-9]\d{7,14}$/.test(normalized)) {
    throw new TypeError('WhatsApp recipients must be valid E.164 phone numbers');
  }

  return normalized;
}

function parseResponseBody(value: string): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isSendResponse(value: unknown): value is WhatsAppSendResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const messages = (value as { messages?: unknown }).messages;
  return (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every(
      (message) =>
        Boolean(message) &&
        typeof message === 'object' &&
        typeof (message as { id?: unknown }).id === 'string',
    )
  );
}

export class WhatsAppNotificationProvider
  implements NotificationProvider<SendWhatsAppTemplateInput>
{
  readonly channel = 'WHATSAPP' as const;
  readonly provider = 'META_CLOUD_API';

  constructor(private readonly config: WhatsAppConfig) {}

  async send(
    input: SendWhatsAppTemplateInput,
  ): Promise<NotificationDeliveryReceipt<WhatsAppSendResponse>> {
    const response = await this.sendTemplate(input);

    return {
      channel: this.channel,
      provider: this.provider,
      externalMessageId: response.messages[0].id,
      acceptedAt: new Date(),
      raw: response,
    };
  }

  async sendTemplate(input: SendWhatsAppTemplateInput): Promise<WhatsAppSendResponse> {
    const endpoint =
      this.config.apiBaseUrl.replace(/\/$/, '') +
      '/' +
      this.config.graphApiVersion +
      '/' +
      this.config.phoneNumberId +
      '/messages';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.config.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizeRecipient(input.to),
        type: 'template',
        template: {
          name: input.templateName,
          language: { code: input.languageCode },
          ...(input.components?.length ? { components: input.components } : {}),
        },
      }),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });
    const responseBody = parseResponseBody(await response.text());

    if (!response.ok) {
      throw new WhatsAppRequestError(
        'WhatsApp Cloud API rejected the message',
        response.status,
        responseBody,
        response.status === 429 || response.status >= 500,
      );
    }

    if (!isSendResponse(responseBody)) {
      throw new WhatsAppRequestError(
        'WhatsApp Cloud API returned an unexpected response',
        response.status,
        responseBody,
      );
    }

    return responseBody;
  }

  sendOtp(input: SendWhatsAppOtpInput) {
    if (!/^\d{4,10}$/.test(input.code)) {
      throw new TypeError('WhatsApp OTP codes must contain between 4 and 10 digits');
    }

    const components: WhatsAppTemplateComponent[] = [
      {
        type: 'body',
        parameters: [{ type: 'text', text: input.code }],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: input.code }],
      },
    ];

    return this.sendTemplate({ ...input, components });
  }
}
