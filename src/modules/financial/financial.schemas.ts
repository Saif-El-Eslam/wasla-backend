import { z } from 'zod';
import { localizedTextSchema } from '../../common/i18n/localized-text.schema';

const transactionTypeSchema = z.enum(['IN', 'OUT']);
const branchFilterSchema = z.string().uuid().or(z.literal('all')).default('all');
const dateQuerySchema = z.coerce.date().optional();

export const transactionParamsSchema = z.object({
  transactionId: z.string().uuid(),
});

export const categoryParamsSchema = z.object({
  categoryId: z.string().uuid(),
});

export const paymentMethodParamsSchema = z.object({
  paymentMethodId: z.string().uuid(),
});

export const createFinancialTransactionSchema = z.object({
  type: transactionTypeSchema,
  branchId: z.string().uuid(),
  categoryId: z.string().uuid(),
  paymentMethodId: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().positive().max(99999999.99),
  occurredAt: z.coerce.date(),
  note: z.string().trim().max(500).optional(),
});

export const updateFinancialTransactionSchema = createFinancialTransactionSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

export const financialTransactionListQuerySchema = z.object({
  branchId: branchFilterSchema,
  from: dateQuerySchema,
  to: dateQuerySchema,
  type: transactionTypeSchema.optional(),
  categoryId: z.string().uuid().optional(),
  paymentMethodId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createTransactionCategorySchema = z.object({
  type: transactionTypeSchema,
  name: localizedTextSchema,
  description: localizedTextSchema.optional(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

export const updateTransactionCategorySchema = createTransactionCategorySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

export const categoryListQuerySchema = z.object({
  type: transactionTypeSchema.optional(),
  includeInactive: z.coerce.boolean().default(false),
});

export const createPaymentMethodSchema = z.object({
  name: localizedTextSchema,
  kind: z
    .enum(['CASH', 'CARD', 'WALLET', 'BANK_TRANSFER', 'DELIVERY_APP', 'OTHER'])
    .default('OTHER'),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

export const updatePaymentMethodSchema = createPaymentMethodSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

export const paymentMethodListQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false),
});

export const financialDashboardQuerySchema = z.object({
  branchId: branchFilterSchema,
  from: dateQuerySchema,
  to: dateQuerySchema,
  type: transactionTypeSchema.optional(),
  categoryId: z.string().uuid().optional(),
  paymentMethodId: z.string().uuid().optional(),
});

export const financialAnalyticsQuerySchema = z.object({
  branchId: branchFilterSchema,
  from: dateQuerySchema,
  to: dateQuerySchema,
  groupBy: z.enum(['day', 'week', 'month', 'branch', 'category', 'paymentMethod']).default('day'),
  type: transactionTypeSchema.optional(),
  categoryId: z.string().uuid().optional(),
  paymentMethodId: z.string().uuid().optional(),
});

export const financialReportQuerySchema = z.object({
  branchId: branchFilterSchema,
  from: dateQuerySchema,
  to: dateQuerySchema,
  type: transactionTypeSchema.optional(),
  categoryId: z.string().uuid().optional(),
  paymentMethodId: z.string().uuid().optional(),
});
