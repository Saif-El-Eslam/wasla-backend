import crypto from 'node:crypto';
import type { PaymobTransactionSummary } from './paymob.types';

export const PAYMOB_TRANSACTION_HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function webhookObject(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  return isRecord(payload.obj) ? payload.obj : payload;
}

function valueAtPath(source: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let value: unknown = source;

  for (const part of parts) {
    if (!isRecord(value)) {
      if (part === 'id' && value !== null && value !== undefined) {
        return value;
      }
      return undefined;
    }
    value = value[part];
  }

  return value;
}

function hmacValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function safeHexEqual(left: string, right: string) {
  if (!/^[a-f\d]+$/i.test(left) || !/^[a-f\d]+$/i.test(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createPaymobTransactionHmac(
  payload: unknown,
  hmacSecret: string,
  fields: readonly string[] = PAYMOB_TRANSACTION_HMAC_FIELDS,
) {
  const transaction = webhookObject(payload);

  if (!transaction) {
    throw new TypeError('Paymob webhook payload must contain a transaction object');
  }

  const value = fields.map((field) => hmacValue(valueAtPath(transaction, field))).join('');
  return crypto.createHmac('sha512', hmacSecret).update(value).digest('hex');
}

export function verifyPaymobTransactionHmac(
  payload: unknown,
  receivedHmac: string | undefined,
  hmacSecret: string,
  fields: readonly string[] = PAYMOB_TRANSACTION_HMAC_FIELDS,
) {
  if (!receivedHmac || !hmacSecret) {
    return false;
  }

  const expected = createPaymobTransactionHmac(payload, hmacSecret, fields);
  return safeHexEqual(expected, receivedHmac);
}

export function parsePaymobTransaction(payload: unknown): PaymobTransactionSummary | null {
  const transaction = webhookObject(payload);
  if (!transaction) {
    return null;
  }

  const numberValue = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  const stringValue = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
  const booleanValue = (value: unknown) =>
    typeof value === 'boolean' ? value : undefined;

  return {
    id: stringValue(transaction.id),
    orderId: stringValue(valueAtPath(transaction, 'order.id')),
    amountMinor: numberValue(transaction.amount_cents),
    currency: typeof transaction.currency === 'string' ? transaction.currency : undefined,
    success: booleanValue(transaction.success),
    pending: booleanValue(transaction.pending),
    integrationId: stringValue(transaction.integration_id),
    createdAt: typeof transaction.created_at === 'string' ? transaction.created_at : undefined,
    raw: transaction,
  };
}
