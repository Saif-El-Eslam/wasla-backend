import { z } from 'zod';

export const imageUploadSignatureSchema = z.object({
  scope: z.enum(['venue', 'branch', 'menu-category', 'menu-item', 'qr', 'misc']).default('misc'),
});

export const deleteUploadedImageSchema = z.object({
  imageUrl: z.string().url(),
});
