import crypto from 'node:crypto';
import type { WhatsAppMessageStatus } from './whatsapp.types';

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyWhatsAppWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  appSecret: string,
) {
  if (!signatureHeader?.startsWith('sha256=') || !appSecret) {
    return false;
  }

  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signatureHeader);
}

export function verifyWhatsAppWebhookChallenge(
  query: Record<string, unknown>,
  verifyToken: string,
) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (
    mode !== 'subscribe' ||
    typeof token !== 'string' ||
    typeof challenge !== 'string' ||
    !safeEqual(token, verifyToken)
  ) {
    return null;
  }

  return challenge;
}

export function extractWhatsAppMessageStatuses(payload: unknown): WhatsAppMessageStatus[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) {
    return [];
  }

  const results: WhatsAppMessageStatus[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== 'object') continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== 'object') continue;
      const statuses = (value as { statuses?: unknown }).statuses;
      if (!Array.isArray(statuses)) continue;

      for (const status of statuses) {
        if (!status || typeof status !== 'object') continue;
        const row = status as Record<string, unknown>;
        if (typeof row.id !== 'string' || typeof row.status !== 'string') continue;

        results.push({
          messageId: row.id,
          status: row.status,
          recipientId: typeof row.recipient_id === 'string' ? row.recipient_id : undefined,
          timestamp: typeof row.timestamp === 'string' ? row.timestamp : undefined,
          errors: Array.isArray(row.errors) ? row.errors : undefined,
        });
      }
    }
  }

  return results;
}
