import { z } from 'zod';
import { asyncHandler } from '../../common/http/async-handler';
import { created, ok } from '../../common/http/response';
import { localizeResponse } from '../../common/i18n/localize-response';
import {
  createFinancialTransactionSchema,
  createPaymentMethodSchema,
  createTransactionCategorySchema,
  updateFinancialTransactionSchema,
  updatePaymentMethodSchema,
  updateTransactionCategorySchema,
} from './financial.schemas';
import {
  createFinancialTransaction,
  createPaymentMethod,
  createTransactionCategory,
  deleteFinancialTransaction,
  deletePaymentMethod,
  deleteTransactionCategory,
  getFinanceAccess,
  getFinancialAnalytics,
  getFinancialDashboard,
  getFinancialReport,
  getFinancialReportCsv,
  getFinancialTransaction,
  listFinancialTransactions,
  listPaymentMethods,
  listTransactionCategories,
  updateFinancialTransaction,
  updatePaymentMethod,
  updateTransactionCategory,
} from './financial.service';

export function getValidated<T>(req: Express.Request, key: 'body' | 'params' | 'query'): T {
  return req.validated?.[key] as T;
}

export const getFinanceAccessController = asyncHandler(async (req, res) => {
  ok(res, await getFinanceAccess(req.user));
});

export const getFinancialDashboardController = asyncHandler(async (req, res) => {
  const dashboard = await getFinancialDashboard(req.user, req.validated?.query as never);
  ok(res, localizeResponse({ dashboard }, req.locale));
});

export const listFinancialTransactionsController = asyncHandler(async (req, res) => {
  const result = await listFinancialTransactions(req.user, req.validated?.query as never);
  ok(res, localizeResponse(result, req.locale));
});

export const getFinancialTransactionController = asyncHandler(async (req, res) => {
  const result = await getFinancialTransaction(
    req.user,
    String(getValidated<{ transactionId: string }>(req, 'params').transactionId),
  );
  ok(res, localizeResponse(result, req.locale));
});

export const createFinancialTransactionController = asyncHandler(async (req, res) => {
  const result = await createFinancialTransaction(
    req.user,
    getValidated<z.infer<typeof createFinancialTransactionSchema>>(req, 'body'),
  );
  created(res, localizeResponse(result, req.locale));
});

export const updateFinancialTransactionController = asyncHandler(async (req, res) => {
  const result = await updateFinancialTransaction(
    req.user,
    String(getValidated<{ transactionId: string }>(req, 'params').transactionId),
    getValidated<z.infer<typeof updateFinancialTransactionSchema>>(req, 'body'),
  );
  ok(res, localizeResponse(result, req.locale));
});

export const deleteFinancialTransactionController = asyncHandler(async (req, res) => {
  ok(
    res,
    await deleteFinancialTransaction(
      req.user,
      String(getValidated<{ transactionId: string }>(req, 'params').transactionId),
    ),
  );
});

export const listTransactionCategoriesController = asyncHandler(async (req, res) => {
  const result = await listTransactionCategories(req.user, req.validated?.query as never);
  ok(res, localizeResponse(result, req.locale));
});

export const createTransactionCategoryController = asyncHandler(async (req, res) => {
  const result = await createTransactionCategory(
    req.user,
    getValidated<z.infer<typeof createTransactionCategorySchema>>(req, 'body'),
  );
  created(res, localizeResponse(result, req.locale));
});

export const updateTransactionCategoryController = asyncHandler(async (req, res) => {
  const result = await updateTransactionCategory(
    req.user,
    String(getValidated<{ categoryId: string }>(req, 'params').categoryId),
    getValidated<z.infer<typeof updateTransactionCategorySchema>>(req, 'body'),
  );
  ok(res, localizeResponse(result, req.locale));
});

export const deleteTransactionCategoryController = asyncHandler(async (req, res) => {
  ok(
    res,
    await deleteTransactionCategory(
      req.user,
      String(getValidated<{ categoryId: string }>(req, 'params').categoryId),
    ),
  );
});

export const listPaymentMethodsController = asyncHandler(async (req, res) => {
  const result = await listPaymentMethods(req.user, req.validated?.query as never);
  ok(res, localizeResponse(result, req.locale));
});

export const createPaymentMethodController = asyncHandler(async (req, res) => {
  const result = await createPaymentMethod(
    req.user,
    getValidated<z.infer<typeof createPaymentMethodSchema>>(req, 'body'),
  );
  created(res, localizeResponse(result, req.locale));
});

export const updatePaymentMethodController = asyncHandler(async (req, res) => {
  const result = await updatePaymentMethod(
    req.user,
    String(getValidated<{ paymentMethodId: string }>(req, 'params').paymentMethodId),
    getValidated<z.infer<typeof updatePaymentMethodSchema>>(req, 'body'),
  );
  ok(res, localizeResponse(result, req.locale));
});

export const deletePaymentMethodController = asyncHandler(async (req, res) => {
  ok(
    res,
    await deletePaymentMethod(
      req.user,
      String(getValidated<{ paymentMethodId: string }>(req, 'params').paymentMethodId),
    ),
  );
});

export const getFinancialAnalyticsController = asyncHandler(async (req, res) => {
  const analytics = await getFinancialAnalytics(req.user, req.validated?.query as never);
  ok(res, localizeResponse({ analytics }, req.locale));
});

export const getFinancialReportController = asyncHandler(async (req, res) => {
  const report = await getFinancialReport(req.user, req.validated?.query as never);
  ok(res, localizeResponse({ report }, req.locale));
});

export const getFinancialReportCsvController = asyncHandler(async (req, res) => {
  const report = await getFinancialReportCsv(req.user, req.validated?.query as never, req.locale);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  res.status(200).send(report.csv);
});
