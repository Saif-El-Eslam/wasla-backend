import { FinancialAuditAction, FinancialTransactionType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma';
import {
  branchScopeWhere,
  requireAccessUser,
  requireBranchAccess,
  requireVenueAdmin,
} from '../../common/auth/branch-access';
import { HttpError } from '../../common/http/http-error';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { buildPaginationMeta } from '../../common/pagination/pagination';
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

const transactionInclude = Prisma.validator<Prisma.FinancialTransactionInclude>()({
  branch: { select: { id: true, name: true, slug: true, isMain: true, active: true } },
  category: true,
  paymentMethod: true,
});

type FinancialUser = Awaited<ReturnType<typeof requireAccessUser>>;

const defaultVenueTimezone = 'Africa/Cairo';

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds(),
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
) {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

  for (let index = 0; index < 3; index += 1) {
    utcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) -
      timeZoneOffsetMs(new Date(utcMs), timeZone);
  }

  return new Date(utcMs);
}

function startOfDayInZone(timeZone: string, date = new Date()) {
  const parts = zonedParts(date, timeZone);
  return zonedDateTimeToUtc(timeZone, parts.year, parts.month, parts.day);
}

function endOfDayInZone(timeZone: string, date = new Date()) {
  const parts = zonedParts(date, timeZone);
  return zonedDateTimeToUtc(timeZone, parts.year, parts.month, parts.day, 23, 59, 59, 999);
}

function startOfMonthInZone(timeZone: string, date = new Date()) {
  const parts = zonedParts(date, timeZone);
  return zonedDateTimeToUtc(timeZone, parts.year, parts.month, 1);
}

function endOfMonthInZone(timeZone: string, date = new Date()) {
  const parts = zonedParts(date, timeZone);
  return zonedDateTimeToUtc(timeZone, parts.year, parts.month + 1, 0, 23, 59, 59, 999);
}

function defaultRange(timeZone: string, from?: Date, to?: Date) {
  return {
    from: from ?? startOfMonthInZone(timeZone),
    to: to ?? endOfDayInZone(timeZone),
  };
}

function paginationFromQuery(
  query: Pick<z.infer<typeof financialTransactionListQuerySchema>, 'page' | 'limit'>,
) {
  const page = Number.isFinite(Number(query.page))
    ? Math.max(1, Math.trunc(Number(query.page)))
    : 1;
  const limit = Number.isFinite(Number(query.limit))
    ? Math.min(100, Math.max(1, Math.trunc(Number(query.limit))))
    : 20;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined) {
  return value === null || value === undefined ? 0 : Number(value);
}

function summarizeTransactions(
  transactions: Array<{ type: FinancialTransactionType; amount: Prisma.Decimal }>,
) {
  const income = transactions
    .filter((transaction) => transaction.type === FinancialTransactionType.IN)
    .reduce((sum, transaction) => sum + decimalToNumber(transaction.amount), 0);
  const expenses = transactions
    .filter((transaction) => transaction.type === FinancialTransactionType.OUT)
    .reduce((sum, transaction) => sum + decimalToNumber(transaction.amount), 0);

  return {
    income,
    expenses,
    net: income - expenses,
    count: transactions.length,
  };
}

function monthKey(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

function dayKey(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function localDateTimeLabel(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function weekKey(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const localDayAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
  const first = new Date(Date.UTC(parts.year, 0, 1));
  const days = Math.floor((localDayAsUtc - first.getTime()) / 86400000);
  return `${parts.year}-W${String(Math.ceil((days + first.getUTCDay() + 1) / 7)).padStart(2, '0')}`;
}

function jsonSnapshot(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function accessibleBranches(user: FinancialUser, branchId?: string) {
  if (branchId && branchId !== 'all') {
    const { branch } = await requireBranchAccess(
      { sub: user.id, venueId: user.venueId, role: user.role },
      branchId,
    );
    return [branch];
  }

  return prisma.branch.findMany({
    where: branchScopeWhere(user),
    orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, venueId: true, name: true, slug: true, isMain: true, active: true },
  });
}

async function venueTimezone(venueId: string) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { timezone: true },
  });

  return venue?.timezone || defaultVenueTimezone;
}

function transactionWhere(
  user: FinancialUser,
  branchIds: string[],
  filters: {
    from?: Date;
    to?: Date;
    type?: FinancialTransactionType;
    categoryId?: string;
    paymentMethodId?: string;
    search?: string;
  } = {},
): Prisma.FinancialTransactionWhereInput {
  return {
    venueId: user.venueId,
    branchId: { in: branchIds },
    deletedAt: null,
    ...(filters.from || filters.to
      ? {
          occurredAt: {
            gte: filters.from,
            lte: filters.to,
          },
        }
      : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.paymentMethodId ? { paymentMethodId: filters.paymentMethodId } : {}),
    ...(filters.search ? { note: { contains: filters.search, mode: 'insensitive' } } : {}),
  };
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
  const { from, to } = defaultRange(timeZone, query.from, query.to);
  await assertFinanceRangeAllowed(user.venueId, from, to);
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

  if (input.occurredAt.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, 'errors.invalidTransactionDate');
  }

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
  const [todayTransactions, monthTransactions, previousTransactions, recentTransactions] =
    await prisma.$transaction([
      prisma.financialTransaction.findMany({
        where: transactionWhere(user, branchIds, {
          from: todayStart,
          to: todayEnd,
          type: query.type,
          categoryId: query.categoryId,
          paymentMethodId: query.paymentMethodId,
        }),
      }),
      prisma.financialTransaction.findMany({
        where: transactionWhere(user, branchIds, {
          from: monthStartDate,
          to: monthEndDate,
          type: query.type,
          categoryId: query.categoryId,
          paymentMethodId: query.paymentMethodId,
        }),
      }),
      prisma.financialTransaction.findMany({
        where: transactionWhere(user, branchIds, {
          from: previousStart,
          to: previousEnd,
          type: query.type,
          categoryId: query.categoryId,
          paymentMethodId: query.paymentMethodId,
        }),
      }),
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
  const monthSummary = summarizeTransactions(monthTransactions);

  return {
    allowance,
    branches,
    today: summarizeTransactions(todayTransactions),
    month: monthSummary,
    recentTransactions,
    insights: insightMessages(monthSummary, summarizeTransactions(previousTransactions)),
  };
}

export async function getFinancialAnalytics(
  session: SessionPayload | undefined,
  query: z.infer<typeof financialAnalyticsQuerySchema>,
) {
  const user = await requireAccessUser(session);
  const timeZone = await venueTimezone(user.venueId);
  const { from, to } = defaultRange(timeZone, query.from, query.to);
  const allowance = await assertFinanceRangeAllowed(user.venueId, from, to);
  const branches = await accessibleBranches(user, query.branchId);
  const branchIds = branches.map((branch) => branch.id);
  const transactions = await prisma.financialTransaction.findMany({
    where: transactionWhere(user, branchIds, { ...query, from, to }),
    include: transactionInclude,
    orderBy: { occurredAt: 'asc' },
  });
  const groups = new Map<
    string,
    { key: string; label: unknown; income: number; expenses: number; net: number; count: number }
  >();

  for (const transaction of transactions) {
    const key =
      query.groupBy === 'month'
        ? monthKey(transaction.occurredAt, timeZone)
        : query.groupBy === 'week'
          ? weekKey(transaction.occurredAt, timeZone)
          : query.groupBy === 'branch'
            ? transaction.branchId
            : query.groupBy === 'category'
              ? transaction.categoryId
              : query.groupBy === 'paymentMethod'
                ? (transaction.paymentMethodId ?? 'none')
                : dayKey(transaction.occurredAt, timeZone);
    const label =
      query.groupBy === 'branch'
        ? transaction.branch.name
        : query.groupBy === 'category'
          ? transaction.category.name
          : query.groupBy === 'paymentMethod'
            ? (transaction.paymentMethod?.name ?? { en: 'No payment method', ar: 'بدون طريقة دفع' })
            : key;
    const current = groups.get(key) ?? { key, label, income: 0, expenses: 0, net: 0, count: 0 };
    const amount = decimalToNumber(transaction.amount);

    if (transaction.type === FinancialTransactionType.IN) {
      current.income += amount;
    } else {
      current.expenses += amount;
    }

    current.net = current.income - current.expenses;
    current.count += 1;
    groups.set(key, current);
  }

  return {
    allowance,
    filters: { ...query, from, to },
    summary: summarizeTransactions(transactions),
    groups: Array.from(groups.values()),
  };
}

export async function getFinancialReport(
  session: SessionPayload | undefined,
  query: z.infer<typeof financialReportQuerySchema>,
) {
  const user = await requireAccessUser(session);
  const timeZone = await venueTimezone(user.venueId);
  const { from, to } = defaultRange(timeZone, query.from, query.to);
  const allowance = await assertFinanceRangeAllowed(user.venueId, from, to);
  const branches = await accessibleBranches(user, query.branchId);
  const branchIds = branches.map((branch) => branch.id);
  const transactions = await prisma.financialTransaction.findMany({
    where: transactionWhere(user, branchIds, { ...query, from, to }),
    include: transactionInclude,
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
  });
  const byCategory = new Map<
    string,
    {
      categoryId: string;
      name: unknown;
      type: FinancialTransactionType;
      amount: number;
      count: number;
    }
  >();
  const byBranch = new Map<
    string,
    {
      branchId: string;
      name: unknown;
      income: number;
      expenses: number;
      net: number;
      count: number;
    }
  >();
  const byPaymentMethod = new Map<
    string,
    {
      paymentMethodId: string | null;
      name: unknown;
      income: number;
      expenses: number;
      net: number;
      count: number;
    }
  >();

  for (const transaction of transactions) {
    const amount = decimalToNumber(transaction.amount);
    const category = byCategory.get(transaction.categoryId) ?? {
      categoryId: transaction.categoryId,
      name: transaction.category.name,
      type: transaction.type,
      amount: 0,
      count: 0,
    };
    category.amount += amount;
    category.count += 1;
    byCategory.set(transaction.categoryId, category);

    const branch = byBranch.get(transaction.branchId) ?? {
      branchId: transaction.branchId,
      name: transaction.branch.name,
      income: 0,
      expenses: 0,
      net: 0,
      count: 0,
    };
    const methodKey = transaction.paymentMethodId ?? 'none';
    const method = byPaymentMethod.get(methodKey) ?? {
      paymentMethodId: transaction.paymentMethodId,
      name: transaction.paymentMethod?.name ?? { en: 'No payment method', ar: 'بدون طريقة دفع' },
      income: 0,
      expenses: 0,
      net: 0,
      count: 0,
    };

    if (transaction.type === FinancialTransactionType.IN) {
      branch.income += amount;
      method.income += amount;
    } else {
      branch.expenses += amount;
      method.expenses += amount;
    }

    branch.net = branch.income - branch.expenses;
    branch.count += 1;
    method.net = method.income - method.expenses;
    method.count += 1;
    byBranch.set(transaction.branchId, branch);
    byPaymentMethod.set(methodKey, method);
  }

  return {
    allowance,
    filters: { ...query, from, to },
    summary: summarizeTransactions(transactions),
    byCategory: Array.from(byCategory.values()),
    byBranch: Array.from(byBranch.values()),
    byPaymentMethod: Array.from(byPaymentMethod.values()),
    transactionCount: transactions.length,
  };
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function localizedCell(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return String(record.en ?? record.ar ?? Object.values(record).find(Boolean) ?? '');
  }

  return String(value ?? '');
}

export async function getFinancialReportCsv(
  session: SessionPayload | undefined,
  query: z.infer<typeof financialReportQuerySchema>,
) {
  const user = await requireAccessUser(session);
  const timeZone = await venueTimezone(user.venueId);
  const { from, to } = defaultRange(timeZone, query.from, query.to);
  await assertFinanceRangeAllowed(user.venueId, from, to);
  const branches = await accessibleBranches(user, query.branchId);
  const branchIds = branches.map((branch) => branch.id);
  const transactions = await prisma.financialTransaction.findMany({
    where: transactionWhere(user, branchIds, { ...query, from, to }),
    include: transactionInclude,
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
  });
  const lines = [
    ['Date', 'Branch', 'Type', 'Category', 'Payment Method', 'Amount', 'Currency', 'Note']
      .map(csvCell)
      .join(','),
    ...transactions.map((transaction) =>
      [
        localDateTimeLabel(transaction.occurredAt, timeZone),
        localizedCell(transaction.branch.name),
        transaction.type,
        localizedCell(transaction.category.name),
        localizedCell(transaction.paymentMethod?.name),
        decimalToNumber(transaction.amount).toFixed(2),
        transaction.currency,
        transaction.note ?? '',
      ]
        .map(csvCell)
        .join(','),
    ),
  ];

  return {
    filename: `wasla-financial-report-${dayKey(from, timeZone)}-${dayKey(to, timeZone)}-${randomUUID().slice(0, 8)}.csv`,
    csv: lines.join('\n'),
  };
}
