import { z } from 'zod';

export function normalizeEgyptPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const local = digits.startsWith('20') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;

  if (!/^1\d{9}$/.test(local)) {
    return null;
  }

  return `+20${local}`;
}

export const egyptPhoneSchema = z
  .string()
  .trim()
  .min(8)
  .max(32)
  .transform((value, ctx) => {
    const normalized = normalizeEgyptPhone(value);

    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: 'Phone number must be an Egyptian mobile number',
      });
      return z.NEVER;
    }

    return normalized;
  });
