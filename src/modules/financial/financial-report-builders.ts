import { FinancialTransactionType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { dayKey, localDateTimeLabel, monthKey, weekKey } from '../../common/timezone';
import {
  decimalToNumber,
  summarizeTransactions,
  type FinancialTransactionWithRelations,
} from './financial-query';

export function buildFinancialAnalyticsGroups(input: {
  transactions: FinancialTransactionWithRelations[];
  groupBy: 'day' | 'week' | 'month' | 'branch' | 'category' | 'paymentMethod';
  timeZone: string;
}) {
  const groups = new Map<
    string,
    { key: string; label: unknown; income: number; expenses: number; net: number; count: number }
  >();

  for (const transaction of input.transactions) {
    const key =
      input.groupBy === 'month'
        ? monthKey(transaction.occurredAt, input.timeZone)
        : input.groupBy === 'week'
          ? weekKey(transaction.occurredAt, input.timeZone)
          : input.groupBy === 'branch'
            ? transaction.branchId
            : input.groupBy === 'category'
              ? transaction.categoryId
              : input.groupBy === 'paymentMethod'
                ? (transaction.paymentMethodId ?? 'none')
                : dayKey(transaction.occurredAt, input.timeZone);
    const label =
      input.groupBy === 'branch'
        ? transaction.branch.name
        : input.groupBy === 'category'
          ? transaction.category.name
          : input.groupBy === 'paymentMethod'
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
    summary: summarizeTransactions(input.transactions),
    groups: Array.from(groups.values()),
  };
}

export function buildFinancialReportSummary(transactions: FinancialTransactionWithRelations[]) {
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

export function buildFinancialReportCsv(input: {
  transactions: FinancialTransactionWithRelations[];
  from: Date;
  to: Date;
  timeZone: string;
}) {
  const lines = [
    ['Date', 'Branch', 'Type', 'Category', 'Payment Method', 'Amount', 'Currency', 'Note']
      .map(csvCell)
      .join(','),
    ...input.transactions.map((transaction) =>
      [
        localDateTimeLabel(transaction.occurredAt, input.timeZone),
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
    filename: `wasla-financial-report-${dayKey(input.from, input.timeZone)}-${dayKey(input.to, input.timeZone)}-${randomUUID().slice(0, 8)}.csv`,
    csv: lines.join('\n'),
  };
}
