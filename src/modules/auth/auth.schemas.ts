import { z } from 'zod';
import { egyptPhoneSchema } from '../../common/validation/egypt-phone';

const passwordSchema = z.string().min(8).max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: egyptPhoneSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  phone: egyptPhoneSchema,
  password: passwordSchema,
});

export const verifyOtpSchema = z.object({
  phone: egyptPhoneSchema,
  code: z.string().trim().length(6),
});

export const resendOtpSchema = z.object({
  phone: egyptPhoneSchema,
});

export const adminVerificationQuerySchema = z.object({
  search: z.string().trim().optional(),
});

export const adminVerificationUserParamsSchema = z.object({
  userId: z.uuid(),
});

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: egyptPhoneSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const updatePasswordSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});
