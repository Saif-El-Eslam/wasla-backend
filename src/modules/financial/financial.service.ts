import { FinancialAuditAction, FinancialTransactionType, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import {
  requireAccessUser,
  requireBranchAccess,
  requireVenueAdmin,
} from '../../common/auth/branch-access';
import { HttpError } from '../../common/http/http-error';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { buildPaginationMeta } from '../../common/pagination/pagination';
import {
  endOfDayInZone,
  endOfMonthInZone,
  startOfDayInZone,
  startOfMonthInZone,
} from '../../common/timezone';
import { venueTimezone } from '../../common/venue-timezone';
import {
  assertFinanceModuleAllowed,
  assertFinanceMutationAllowed,
  assertFinanceRangeAllowed,
  getFinanceAllowance,
} from '../subscription/plan-guards';
import type { z } from 'zod';
import type {
  categoryListQuerySchema,
  createFinancialTransactionSchema,
  createPaymentMethodSchema,
  createTransactionCategorySchema,
  financialAnalyticsQuerySchema,
  financialDashboardQuerySchema,
  financialReportQuerySchema,
  financialTransactionListQuerySchema,
  paymentMethodListQuerySchema,
  updateFinancialTransactionSchema,
  updatePaymentMethodSchema,
  updateTransactionCategorySchema,
} from './financial.schemas';
import {
  buildFinancialAnalyticsGroups,
  buildFinancialReportCsv,
  buildFinancialReportSummary,
} from './financial-report-builders';
import {
  accessibleBranches,
  defaultRange,
  paginationFromQuery,
  summarizeTransactionGroups,
  transactionInclude,
  transactionSummaryQuery,
  transactionWhere,
} from './financial-query';

function jsonSnapshot(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function requireCategoryForTransaction(
  venueId: string,
  categoryId: string,
  type: FinancialTransactionType,
) {
  const category = await prisma.transactionCategory.findFirst({
    where: { id: categoryId, venueId, deletedAt: null, active: true },
  });

  if (!category) {
    throw new HttpError(404, 'errors.categoryNotFound');
  }

  if (category.type !== type) {
    throw new HttpError(400, 'errors.categoryTypeMismatch');
  }

  return category;
}

async function paymentMethodForTransaction(venueId: string, paymentMethodId?: string | null) {
  if (paymentMethodId) {
    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: { id: paymentMethodId, venueId, deletedAt: null, active: true },
    });

    if (!paymentMethod) {
      throw new HttpError(404, 'errors.paymentMethodNotFound');
    }

    return paymentMethod;
  }

  return (
    (await prisma.paymentMethod.findFirst({
      where: { venueId, deletedAt: null, active: true, systemKey: 'cash' },
    })) ??
    (await prisma.paymentMethod.findFirst({
      where: { venueId, deletedAt: null, active: true },
      orderBy: { sortOrder: 'asc' },
    }))
  );
}

async function categoryForUpdate(
  venueId: string,
  categoryId: string,
  type: FinancialTransactionType,
) {
  const category = await prisma.transactionCategory.findFirst({
    where: { id: categoryId, venueId, deletedAt: null },
  });

  if (!category) {
    throw new HttpError(404, 'errors.categoryNotFound');
  }

  if (category.type !== type) {
    throw new HttpError(400, 'errors.categoryTypeMismatch');
  }

  return category;
}

async function paymentMethodForUpdate(venueId: string, paymentMethodId?: string | null) {
  if (!paymentMethodId) {
    return null;
  }

  const paymentMethod = await prisma.paymentMethod.findFirst({
    where: { id: paymentMethodId, venueId, deletedAt: null },
  });

  if (!paymentMethod) {
    throw new HttpError(404, 'errors.paymentMethodNotFound');
  }

  return paymentMethod;
}

async function requireTransaction(session: SessionPayload | undefined, transactionId: string) {
  const user = await requireAccessUser(session);
  await assertFinanceModuleAllowed(user.venueId);
  const branches = await accessibleBranches(user);
  const branchIds = branches.map((branch) => branch.id);
  const transaction = await prisma.financialTransaction.findFirst({
    where: {
      id: transactionId,
      venueId: user.venueId,
      branchId: { in: branchIds },
      deletedAt: null,
    },
    include: transactionInclude,
  });

  if (!transaction) {
    throw new HttpError(404, 'errors.transactionNotFound');
  }

  return { user, transaction };
}

async function createAuditLog(
  tx: Prisma.TransactionClient,
  input: {
    transactionId: string;
    venueId: string;
    branchId: string;
    action: FinancialAuditAction;
    actorUserId: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.financialTransactionAuditLog.create({
    data: {
      transactionId: input.transactionId,
      venueId: input.venueId,
      branchId: input.branchId,
      action: input.action,
      actorUserId: input.actorUserId,
      before: input.before === undefined ? undefined : jsonSnapshot(input.before),
      after: input.after === undefined ? undefined : jsonSnapshot(input.after),
    },
  });
}

function insightMessages(
  summary: { income: number; expenses: number; net: number },
  previous: { income: number; expenses: number; net: number },
) {
  const insights: Array<{ tone: 'good' | 'warning' | 'neutral'; key: string; value?: number }> = [];

  if (summary.income === 0) {
    insights.push({ tone: 'warning', key: 'financeInsightNoIncome' });
  }

  if (summary.expenses > previous.expenses && previous.expenses > 0) {
    insights.push({
      tone: 'warning',
      key: 'financeInsightExpensesUp',
      value: Math.round(((summary.expenses - previous.expenses) / previous.expenses) * 100),
    });
  }

  if (summary.income > previous.income && previous.income > 0) {
    insights.push({
      tone: 'good',
      key: 'financeInsightIncomeUp',
      value: Math.round(((summary.income - previous.income) / previous.income) * 100),
    });
  }

  if (summary.net > 0) {
    insights.push({ tone: 'good', key: 'financeInsightPositiveNet' });
  }

  return insights.slice(0, 4);
}

function assertTransactionDateAllowed(occurredAt: Date) {
  if (occurredAt.getTime() > Date.now()) {
    throw new HttpError(400, 'errors.invalidTransactionDate');
  }

  if (occurredAt.getTime() < Date.now() - 1000 * 60 * 60 * 24 * 7) {
    throw new HttpError(400, 'errors.oldTransactionDate');
  }
}

export async function getFinanceAccess(session?: SessionPayload) {
  const user = await requireAccessUser(session);
  const allowance = await getFinanceAllowance(user.venueId);
  const timeZone = await venueTimezone(user.venueId);

  return {
    allowance,
    isAdmin: user.isVenueAdmin,
    timeZone,
  };
}

export async function listFinancialTransactions(
  session: SessionPayload | undefined,
  query: z.infer<typeof financialTransactionListQuerySchema>,
) {
  const user = await requireAccessUser(session);
  await assertFinanceModuleAllowed(user.venueId);
  const timeZone = await venueTimezone(user.venueId);
  const defaultedRange = defaultRange(timeZone, query.from, query.to);
  const range = await assertFinanceRangeAllowed(
    user.venueId,
    defaultedRange.from,
    defaultedRange.to,
  );
  const { from, to } = range;
  const branches = await accessibleBranches(user, query.branchId);
  const branchIds = branches.map((branch) => branch.id);
  const where = transactionWhere(user, branchIds, { ...query, from, to });
  const pagination = paginationFromQuery(query);
  const [transactions, total] = await prisma.$transaction([
    prisma.financialTransaction.findMany({
      where,
      include: transactionInclude,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.financialTransaction.count({ where }),
  ]);

  return {
    transactions,
    pagination: buildPaginationMeta(total, {
      paginate: true,
      page: pagination.page,
      limit: pagination.limit,
      skip: pagination.skip,
    }),
    filters: { ...query, from, to },
  };
}

export async function getFinancialTransaction(
  session: SessionPayload | undefined,
  transactionId: string,
) {
  const { transaction } = await requireTransaction(session, transactionId);
  return { transaction };
}

export async function createFinancialTransaction(
  session: SessionPayload | undefined,
  input: z.infer<typeof createFinancialTransactionSchema>,
) {
  const { user, branch } = await requireBranchAccess(session, input.branchId);
  await assertFinanceMutationAllowed(user.venueId);
  const category = await requireCategoryForTransaction(user.venueId, input.categoryId, input.type);
  const paymentMethod = await paymentMethodForTransaction(user.venueId, input.paymentMethodId);
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: user.venueId },
    select: { currency: true },
  });

  if (branch.venueId !== user.venueId) {
    throw new HttpError(400, 'errors.invalidFinancialBranch');
  }

  assertTransactionDateAllowed(input.occurredAt);

  const transaction = await prisma.$transaction(async (tx) => {
    const created = await tx.financialTransaction.create({
      data: {
        venueId: user.venueId,
        branchId: input.branchId,
        type: input.type,
        categoryId: category.id,
        paymentMethodId: paymentMethod?.id ?? null,
        amount: input.amount,
        currency: venue.currency,
        occurredAt: input.occurredAt,
        note: input.note,
        createdByUserId: user.id,
        updatedByUserId: user.id,
      },
      include: transactionInclude,
    });

    await createAuditLog(tx, {
      transactionId: created.id,
      venueId: created.venueId,
      branchId: created.branchId,
      action: FinancialAuditAction.CREATE,
      actorUserId: user.id,
      after: created,
    });

    return created;
  });

  return { transaction };
}

export async function updateFinancialTransaction(
  session: SessionPayload | undefined,
  transactionId: string,
  input: z.infer<typeof updateFinancialTransactionSchema>,
) {
  const { user, transaction } = await requireTransaction(session, transactionId);
  const nextBranchId = input.branchId ?? transaction.branchId;
  const { branch } = await requireBranchAccess(session, nextBranchId);
  await assertFinanceMutationAllowed(user.venueId);
  const nextType = input.type ?? transaction.type;
  const category =
    input.categoryId || input.type
      ? await categoryForUpdate(user.venueId, input.categoryId ?? transaction.categoryId, nextType)
      : transaction.category;
  const paymentMethod = Object.prototype.hasOwnProperty.call(input, 'paymentMethodId')
    ? await paymentMethodForUpdate(user.venueId, input.paymentMethodId)
    : transaction.paymentMethod;

  if (branch.venueId !== user.venueId) {
    throw new HttpError(400, 'errors.invalidFinancialBranch');
  }

  if (input.occurredAt) {
    assertTransactionDateAllowed(input.occurredAt);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.financialTransaction.update({
      where: { id: transaction.id },
      data: {
        branchId: nextBranchId,
        type: nextType,
        categoryId: category.id,
        paymentMethodId: paymentMethod?.id ?? null,
        amount: input.amount,
        occurredAt: input.occurredAt,
        note: input.note,
        updatedByUserId: user.id,
      },
      include: transactionInclude,
    });

    await createAuditLog(tx, {
      transactionId: next.id,
      venueId: next.venueId,
      branchId: next.branchId,
      action: FinancialAuditAction.UPDATE,
      actorUserId: user.id,
      before: transaction,
      after: next,
    });

    return next;
  });

  return { transaction: updated };
}

export async function deleteFinancialTransaction(
  session: SessionPayload | undefined,
  transactionId: string,
) {
  const { user, transaction } = await requireTransaction(session, transactionId);
  await requireBranchAccess(session, transaction.branchId);
  await assertFinanceMutationAllowed(user.venueId);

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.financialTransaction.update({
      where: { id: transaction.id },
      data: {
        deletedAt: new Date(),
        deletedByUserId: user.id,
        updatedByUserId: user.id,
      },
      include: transactionInclude,
    });

    await createAuditLog(tx, {
      transactionId: deleted.id,
      venueId: deleted.venueId,
      branchId: deleted.branchId,
      action: FinancialAuditAction.DELETE,
      actorUserId: user.id,
      before: transaction,
      after: deleted,
    });
  });

  return { deleted: true };
}

export async function listTransactionCategories(
  session: SessionPayload | undefined,
  query: z.infer<typeof categoryListQuerySchema>,
) {
  const user = await requireAccessUser(session);
  await assertFinanceModuleAllowed(user.venueId);

  const categories = await prisma.transactionCategory.findMany({
    where: {
      venueId: user.venueId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.includeInactive ? {} : { active: true, deletedAt: null }),
    },
    include: {
      _count: {
        select: { transactions: true },
      },
    },
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return {
    categories: categories.map(({ _count, ...category }) => ({
      ...category,
      transactionCount: _count.transactions,
    })),
  };
}

export async function createTransactionCategory(
  session: SessionPayload | undefined,
  input: z.infer<typeof createTransactionCategorySchema>,
) {
  const user = await requireVenueAdmin(session);
  await assertFinanceMutationAllowed(user.venueId);

  const category = await prisma.transactionCategory.create({
    data: {
      venueId: user.venueId,
      type: input.type,
      name: input.name,
      description: input.description,
      active: input.active,
      sortOrder: input.sortOrder,
    },
  });

  return { category };
}

export async function updateTransactionCategory(
  session: SessionPayload | undefined,
  categoryId: string,
  input: z.infer<typeof updateTransactionCategorySchema>,
) {
  const user = await requireVenueAdmin(session);
  await assertFinanceMutationAllowed(user.venueId);
  const category = await prisma.transactionCategory.findFirst({
    where: { id: categoryId, venueId: user.venueId },
  });

  if (!category) {
    throw new HttpError(404, 'errors.categoryNotFound');
  }

  const data = {
    ...input,
    ...(Object.prototype.hasOwnProperty.call(input, 'active') ? { deletedAt: null } : {}),
  };

  return {
    category: await prisma.transactionCategory.update({
      where: { id: category.id },
      data,
    }),
  };
}

export async function deleteTransactionCategory(
  session: SessionPayload | undefined,
  categoryId: string,
) {
  const user = await requireVenueAdmin(session);
  await assertFinanceMutationAllowed(user.venueId);
  const category = await prisma.transactionCategory.findFirst({
    where: { id: categoryId, venueId: user.venueId },
  });

  if (!category) {
    throw new HttpError(404, 'errors.categoryNotFound');
  }

  const transactionCount = await prisma.financialTransaction.count({
    where: { categoryId: category.id },
  });

  if (transactionCount > 0) {
    throw new HttpError(409, 'errors.categoryHasTransactions');
  }

  await prisma.transactionCategory.delete({
    where: { id: category.id },
  });

  return { deleted: true };
}

export async function listPaymentMethods(
  session: SessionPayload | undefined,
  query: z.infer<typeof paymentMethodListQuerySchema>,
) {
  const user = await requireAccessUser(session);
  await assertFinanceModuleAllowed(user.venueId);
  const paymentMethods = await prisma.paymentMethod.findMany({
    where: {
      venueId: user.venueId,
      ...(query.includeInactive ? {} : { active: true, deletedAt: null }),
    },
    include: {
      _count: {
        select: { transactions: true },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return {
    paymentMethods: paymentMethods.map(({ _count, ...paymentMethod }) => ({
      ...paymentMethod,
      transactionCount: _count.transactions,
    })),
  };
}

export async function createPaymentMethod(
  session: SessionPayload | undefined,
  input: z.infer<typeof createPaymentMethodSchema>,
) {
  const user = await requireVenueAdmin(session);
  await assertFinanceMutationAllowed(user.venueId);

  return {
    paymentMethod: await prisma.paymentMethod.create({
      data: {
        venueId: user.venueId,
        name: input.name,
        kind: input.kind,
        active: input.active,
        sortOrder: input.sortOrder,
      },
    }),
  };
}

export async function updatePaymentMethod(
  session: SessionPayload | undefined,
  paymentMethodId: string,
  input: z.infer<typeof updatePaymentMethodSchema>,
) {
  const user = await requireVenueAdmin(session);
  await assertFinanceMutationAllowed(user.venueId);
  const paymentMethod = await prisma.paymentMethod.findFirst({
    where: { id: paymentMethodId, venueId: user.venueId },
  });

  if (!paymentMethod) {
    throw new HttpError(404, 'errors.paymentMethodNotFound');
  }

  const data = {
    ...input,
    ...(Object.prototype.hasOwnProperty.call(input, 'active') ? { deletedAt: null } : {}),
  };

  return {
    paymentMethod: await prisma.paymentMethod.update({
      where: { id: paymentMethod.id },
      data,
    }),
  };
}

export async function deletePaymentMethod(
  session: SessionPayload | undefined,
  paymentMethodId: string,
) {
  const user = await requireVenueAdmin(session);
  await assertFinanceMutationAllowed(user.venueId);
  const paymentMethod = await prisma.paymentMethod.findFirst({
    where: { id: paymentMethodId, venueId: user.venueId },
  });

  if (!paymentMethod) {
    throw new HttpError(404, 'errors.paymentMethodNotFound');
  }

  const transactionCount = await prisma.financialTransaction.count({
    where: { paymentMethodId: paymentMethod.id },
  });

  if (transactionCount > 0) {
    throw new HttpError(409, 'errors.paymentMethodHasTransactions');
  }

  await prisma.paymentMethod.delete({
    where: { id: paymentMethod.id },
  });

  return { deleted: true };
}

export async function getFinancialDashboard(
  session: SessionPayload | undefined,
  query: z.infer<typeof financialDashboardQuerySchema>,
) {
  const user = await requireAccessUser(session);
  const allowance = await assertFinanceModuleAllowed(user.venueId);
  const timeZone = await venueTimezone(user.venueId);
  const branches = await accessibleBranches(user, query.branchId);
  const branchIds = branches.map((branch) => branch.id);
  const todayStart = startOfDayInZone(timeZone);
  const todayEnd = endOfDayInZone(timeZone);
  const monthStartDate = startOfMonthInZone(timeZone);
  const monthEndDate = endOfMonthInZone(timeZone);
  const previousStart = new Date(
    monthStartDate.getTime() - (monthEndDate.getTime() - monthStartDate.getTime()),
  );
  const previousEnd = new Date(monthStartDate.getTime() - 1);
  const [todayGroups, monthGroups, previousGroups, recentTransactions] = await prisma.$transaction([
    transactionSummaryQuery(
      transactionWhere(user, branchIds, {
        from: todayStart,
        to: todayEnd,
        type: query.type,
        categoryId: query.categoryId,
        paymentMethodId: query.paymentMethodId,
      }),
    ),
    transactionSummaryQuery(
      transactionWhere(user, branchIds, {
        from: monthStartDate,
        to: monthEndDate,
        type: query.type,
        categoryId: query.categoryId,
        paymentMethodId: query.paymentMethodId,
      }),
    ),
    transactionSummaryQuery(
      transactionWhere(user, branchIds, {
        from: previousStart,
        to: previousEnd,
        type: query.type,
        categoryId: query.categoryId,
        paymentMethodId: query.paymentMethodId,
      }),
    ),
    prisma.financialTransaction.findMany({
      where: transactionWhere(user, branchIds, {
        type: query.type,
        categoryId: query.categoryId,
        paymentMethodId: query.paymentMethodId,
      }),
      include: transactionInclude,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 8,
    }),
  ]);
  const monthSummary = summarizeTransactionGroups(monthGroups);

  return {
    allowance,
    branches,
    today: summarizeTransactionGroups(todayGroups),
    month: monthSummary,
    recentTransactions,
    insights: insightMessages(monthSummary, summarizeTransactionGroups(previousGroups)),
  };
}

export async function getFinancialAnalytics(
  session: SessionPayload | undefined,
  query: z.infer<typeof financialAnalyticsQuerySchema>,
) {
  const user = await requireAccessUser(session);
  const timeZone = await venueTimezone(user.venueId);
  const defaultedRange = defaultRange(timeZone, query.from, query.to);
  const range = await assertFinanceRangeAllowed(
    user.venueId,
    defaultedRange.from,
    defaultedRange.to,
  );
  const { from, to } = range;
  const allowance = range;
  const branches = await accessibleBranches(user, query.branchId);
  const branchIds = branches.map((branch) => branch.id);
  const transactions = await prisma.financialTransaction.findMany({
    where: transactionWhere(user, branchIds, { ...query, from, to }),
    include: transactionInclude,
    orderBy: { occurredAt: 'asc' },
  });
  const analytics = buildFinancialAnalyticsGroups({
    transactions,
    groupBy: query.groupBy,
    timeZone,
  });

  return {
    allowance,
    filters: { ...query, from, to },
    ...analytics,
  };
}

export async function getFinancialReport(
  session: SessionPayload | undefined,
  query: z.infer<typeof financialReportQuerySchema>,
) {
  const user = await requireAccessUser(session);
  const timeZone = await venueTimezone(user.venueId);
  const defaultedRange = defaultRange(timeZone, query.from, query.to);
  const range = await assertFinanceRangeAllowed(
    user.venueId,
    defaultedRange.from,
    defaultedRange.to,
  );
  const { from, to } = range;
  const allowance = range;
  const branches = await accessibleBranches(user, query.branchId);
  const branchIds = branches.map((branch) => branch.id);
  const transactions = await prisma.financialTransaction.findMany({
    where: transactionWhere(user, branchIds, { ...query, from, to }),
    include: transactionInclude,
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
  });
  const report = buildFinancialReportSummary(transactions);

  return {
    allowance,
    filters: { ...query, from, to },
    ...report,
  };
}

export async function getFinancialReportCsv(
  session: SessionPayload | undefined,
  query: z.infer<typeof financialReportQuerySchema>,
  locale = 'en',
) {
  const user = await requireAccessUser(session);
  const timeZone = await venueTimezone(user.venueId);
  const defaultedRange = defaultRange(timeZone, query.from, query.to);
  const range = await assertFinanceRangeAllowed(
    user.venueId,
    defaultedRange.from,
    defaultedRange.to,
  );
  const { from, to } = range;
  const branches = await accessibleBranches(user, query.branchId);
  const branchIds = branches.map((branch) => branch.id);
  const transactions = await prisma.financialTransaction.findMany({
    where: transactionWhere(user, branchIds, { ...query, from, to }),
    include: transactionInclude,
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
  });

  return buildFinancialReportCsv({ transactions, from, to, timeZone, locale });
}
