import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { authenticatedRateLimit } from '../../common/middleware/rate-limit.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  categoryListQuerySchema,
  categoryParamsSchema,
  createFinancialTransactionSchema,
  createPaymentMethodSchema,
  createTransactionCategorySchema,
  financialAnalyticsQuerySchema,
  financialDashboardQuerySchema,
  financialReportQuerySchema,
  financialTransactionListQuerySchema,
  paymentMethodListQuerySchema,
  paymentMethodParamsSchema,
  transactionParamsSchema,
  updateFinancialTransactionSchema,
  updatePaymentMethodSchema,
  updateTransactionCategorySchema,
} from './financial.schemas';
import {
  createFinancialTransactionController,
  createPaymentMethodController,
  createTransactionCategoryController,
  deleteFinancialTransactionController,
  deletePaymentMethodController,
  deleteTransactionCategoryController,
  getFinanceAccessController,
  getFinancialAnalyticsController,
  getFinancialDashboardController,
  getFinancialReportController,
  getFinancialReportCsvController,
  getFinancialTransactionController,
  listFinancialTransactionsController,
  listPaymentMethodsController,
  listTransactionCategoriesController,
  updateFinancialTransactionController,
  updatePaymentMethodController,
  updateTransactionCategoryController,
} from './financial.controller';

export const financialRouter = Router();

financialRouter.use(requireAuth, authenticatedRateLimit);

financialRouter.get('/access', getFinanceAccessController);
financialRouter.get(
  '/dashboard',
  validateRequest({ query: financialDashboardQuerySchema }),
  getFinancialDashboardController,
);

financialRouter.get(
  '/transactions',
  validateRequest({ query: financialTransactionListQuerySchema }),
  listFinancialTransactionsController,
);
financialRouter.post(
  '/transactions',
  validateRequest({ body: createFinancialTransactionSchema }),
  createFinancialTransactionController,
);
financialRouter.get(
  '/transactions/:transactionId',
  validateRequest({ params: transactionParamsSchema }),
  getFinancialTransactionController,
);
financialRouter.patch(
  '/transactions/:transactionId',
  validateRequest({ params: transactionParamsSchema, body: updateFinancialTransactionSchema }),
  updateFinancialTransactionController,
);
financialRouter.delete(
  '/transactions/:transactionId',
  validateRequest({ params: transactionParamsSchema }),
  deleteFinancialTransactionController,
);

financialRouter.get(
  '/categories',
  validateRequest({ query: categoryListQuerySchema }),
  listTransactionCategoriesController,
);
financialRouter.post(
  '/categories',
  validateRequest({ body: createTransactionCategorySchema }),
  createTransactionCategoryController,
);
financialRouter.patch(
  '/categories/:categoryId',
  validateRequest({ params: categoryParamsSchema, body: updateTransactionCategorySchema }),
  updateTransactionCategoryController,
);
financialRouter.delete(
  '/categories/:categoryId',
  validateRequest({ params: categoryParamsSchema }),
  deleteTransactionCategoryController,
);

financialRouter.get(
  '/payment-methods',
  validateRequest({ query: paymentMethodListQuerySchema }),
  listPaymentMethodsController,
);
financialRouter.post(
  '/payment-methods',
  validateRequest({ body: createPaymentMethodSchema }),
  createPaymentMethodController,
);
financialRouter.patch(
  '/payment-methods/:paymentMethodId',
  validateRequest({ params: paymentMethodParamsSchema, body: updatePaymentMethodSchema }),
  updatePaymentMethodController,
);
financialRouter.delete(
  '/payment-methods/:paymentMethodId',
  validateRequest({ params: paymentMethodParamsSchema }),
  deletePaymentMethodController,
);

financialRouter.get(
  '/analytics',
  validateRequest({ query: financialAnalyticsQuerySchema }),
  getFinancialAnalyticsController,
);
financialRouter.get(
  '/reports/export.csv',
  validateRequest({ query: financialReportQuerySchema }),
  getFinancialReportCsvController,
);
financialRouter.get(
  '/reports/summary',
  validateRequest({ query: financialReportQuerySchema }),
  getFinancialReportController,
);
financialRouter.get(
  '/reports/cashflow',
  validateRequest({ query: financialReportQuerySchema }),
  getFinancialReportController,
);
financialRouter.get(
  '/reports/categories',
  validateRequest({ query: financialReportQuerySchema }),
  getFinancialReportController,
);
financialRouter.get(
  '/reports/branches',
  validateRequest({ query: financialReportQuerySchema }),
  getFinancialReportController,
);
