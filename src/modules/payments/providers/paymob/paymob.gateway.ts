import { PaymobRequestError } from './paymob.errors';
import type { PaymentGateway } from '../../payment.gateway';
import type { PaymobConfig } from './paymob.config';
import type {
  CreatePaymobIntentionInput,
  PaymobCheckout,
  PaymobIntentionResponse,
} from './paymob.types';
import { verifyPaymobTransactionHmac } from './paymob.webhook';

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

function isIntentionResponse(value: unknown): value is PaymobIntentionResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.client_secret === 'string';
}

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(field + ' must be a positive integer in the smallest currency unit');
  }
}

function validateIntention(input: CreatePaymobIntentionInput) {
  assertPositiveInteger(input.amount, 'amount');

  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new TypeError('currency must be an uppercase ISO 4217 code');
  }

  if (input.payment_methods.length === 0) {
    throw new TypeError('At least one Paymob payment method is required');
  }

  if (input.items.length === 0) {
    throw new TypeError('At least one Paymob intention item is required');
  }

  for (const item of input.items) {
    if (!item.name.trim()) {
      throw new TypeError('Paymob intention item names cannot be empty');
    }
    assertPositiveInteger(item.amount, 'item.amount');
    if (item.quantity !== undefined) {
      assertPositiveInteger(item.quantity, 'item.quantity');
    }
  }

  const itemTotal = input.items.reduce((total, item) => total + item.amount, 0);
  if (itemTotal !== input.amount) {
    throw new TypeError('Paymob intention amount must equal the sum of item amounts');
  }
}

export class PaymobGateway
  implements PaymentGateway<CreatePaymobIntentionInput, PaymobIntentionResponse>
{
  readonly name = 'PAYMOB';

  constructor(private readonly config: PaymobConfig) {}

  async createIntention(
    input: CreatePaymobIntentionInput,
  ): Promise<PaymobIntentionResponse> {
    validateIntention(input);
    const endpoint = this.config.apiBaseUrl.replace(/\/$/, '') + '/v1/intention/';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Token ' + this.config.secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });
    const responseBody = parseResponseBody(await response.text());

    if (!response.ok) {
      throw new PaymobRequestError(
        'Paymob rejected the payment intention',
        response.status,
        responseBody,
        response.status === 429 || response.status >= 500,
      );
    }

    if (!isIntentionResponse(responseBody)) {
      throw new PaymobRequestError(
        'Paymob returned an unexpected intention response',
        response.status,
        responseBody,
      );
    }

    return responseBody;
  }

  buildUnifiedCheckoutUrl(clientSecret: string) {
    if (!clientSecret.trim()) {
      throw new TypeError('A Paymob client secret is required');
    }

    const checkoutUrl = new URL(
      '/unifiedcheckout/',
      this.config.apiBaseUrl.replace(/\/$/, '') + '/',
    );
    checkoutUrl.searchParams.set('publicKey', this.config.publicKey);
    checkoutUrl.searchParams.set('clientSecret', clientSecret);
    return checkoutUrl.toString();
  }

  async createCheckout(input: CreatePaymobIntentionInput): Promise<PaymobCheckout> {
    const intention = await this.createIntention(input);
    return {
      gateway: this.name,
      externalPaymentId: intention.id,
      intention,
      checkoutUrl: this.buildUnifiedCheckoutUrl(intention.client_secret),
      raw: intention,
    };
  }

  verifyWebhook(payload: unknown, signature: string | undefined) {
    return verifyPaymobTransactionHmac(payload, signature, this.config.hmacSecret);
  }
}
