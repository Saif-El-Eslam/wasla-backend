import { FinancialTransactionType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveLocalizedText } from '../../common/i18n/localized-text';
import { dayKey, localDateTimeLabel, monthKey, weekKey } from '../../common/timezone';
import {
  decimalToNumber,
  summarizeTransactions,
  type FinancialTransactionWithRelations,
} from './financial-query';

const noPaymentMethodName = {
  en: 'No payment method',
  ar: '\u0628\u062f\u0648\u0646 \u0637\u0631\u064a\u0642\u0629 \u062f\u0641\u0639',
};

function financialCsvLabels(locale: string) {
  if (locale === 'ar') {
    return {
      amount: '\u0627\u0644\u0645\u0628\u0644\u063a',
      branch: '\u0627\u0644\u0641\u0631\u0639',
      category: '\u0627\u0644\u062a\u0635\u0646\u064a\u0641',
      currency: '\u0627\u0644\u0639\u0645\u0644\u0629',
      date: '\u0627\u0644\u062a\u0627\u0631\u064a\u062e',
      expense: '\u0645\u0635\u0631\u0648\u0641',
      income: '\u0625\u064a\u0631\u0627\u062f',
      note: '\u0645\u0644\u0627\u062d\u0638\u0629',
      paymentMethod: '\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u062f\u0641\u0639',
      type: '\u0627\u0644\u0646\u0648\u0639',
    };
  }

  return {
    amount: 'Amount',
    branch: 'Branch',
    category: 'Category',
    currency: 'Currency',
    date: 'Date',
    expense: 'Expense',
    income: 'Income',
    note: 'Note',
    paymentMethod: 'Payment Method',
    type: 'Type',
  };
}

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
            ? (transaction.paymentMethod?.name ?? noPaymentMethodName)
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
      name: transaction.paymentMethod?.name ?? noPaymentMethodName,
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

function localizedCell(value: unknown, locale: string) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return resolveLocalizedText(value as Record<string, string>, {
      requestedLocale: locale,
      defaultLocale: 'en',
    });
  }

  return String(value ?? '');
}

export function buildFinancialReportCsv(input: {
  transactions: FinancialTransactionWithRelations[];
  from: Date;
  to: Date;
  timeZone: string;
  locale: string;
}) {
  const labels = financialCsvLabels(input.locale);
  const lines = [
    [
      labels.date,
      labels.branch,
      labels.type,
      labels.category,
      labels.paymentMethod,
      labels.amount,
      labels.currency,
      labels.note,
    ]
      .map(csvCell)
      .join(','),
    ...input.transactions.map((transaction) =>
      [
        localDateTimeLabel(transaction.occurredAt, input.timeZone),
        localizedCell(transaction.branch.name, input.locale),
        transaction.type === FinancialTransactionType.IN ? labels.income : labels.expense,
        localizedCell(transaction.category.name, input.locale),
        localizedCell(transaction.paymentMethod?.name ?? noPaymentMethodName, input.locale),
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
    csv: `\uFEFF${lines.join('\n')}`,
  };
}
