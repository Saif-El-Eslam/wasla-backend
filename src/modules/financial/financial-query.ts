import { FinancialTransactionType, Prisma } from '@prisma/client';
import { branchScopeWhere, requireAccessUser, requireBranchAccess } from '../../common/auth/branch-access';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { endOfDayInZone, startOfMonthInZone } from '../../common/timezone';
import { prisma } from '../../database/prisma';
import type { z } from 'zod';
import type { financialTransactionListQuerySchema } from './financial.schemas';

export const transactionInclude = Prisma.validator<Prisma.FinancialTransactionInclude>()({
  branch: { select: { id: true, name: true, slug: true, isMain: true, active: true } },
  category: true,
  paymentMethod: true,
});

export type FinancialUser = Awaited<ReturnType<typeof requireAccessUser>>;
export type FinancialTransactionWithRelations = Prisma.FinancialTransactionGetPayload<{
  include: typeof transactionInclude;
}>;

export function defaultRange(timeZone: string, from?: Date, to?: Date) {
  return {
    from: from ?? startOfMonthInZone(timeZone),
    to: to ?? endOfDayInZone(timeZone),
  };
}

export function paginationFromQuery(
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

export function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined) {
  return value === null || value === undefined ? 0 : Number(value);
}

export function summarizeTransactions(
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

export function summarizeTransactionGroups(
  groups: Array<{
    type: FinancialTransactionType;
    _sum: { amount: Prisma.Decimal | null };
    _count: { _all: number };
  }>,
) {
  return groups.reduce(
    (summary, group) => {
      const amount = decimalToNumber(group._sum.amount);

      if (group.type === FinancialTransactionType.IN) {
        summary.income += amount;
      } else {
        summary.expenses += amount;
      }

      summary.count += group._count._all;
      summary.net = summary.income - summary.expenses;
      return summary;
    },
    { income: 0, expenses: 0, net: 0, count: 0 },
  );
}

export function transactionSummaryQuery(where: Prisma.FinancialTransactionWhereInput) {
  return prisma.financialTransaction.groupBy({
    by: ['type'],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  });
}

export async function accessibleBranches(user: FinancialUser, branchId?: string) {
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

export function transactionWhere(
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
