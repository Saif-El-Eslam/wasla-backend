import type { Prisma } from '@prisma/client';

type FinanceSeedClient = Pick<Prisma.TransactionClient, 'transactionCategory' | 'paymentMethod'>;

export const defaultTransactionCategories = [
  { systemKey: 'income_sales', type: 'IN', name: { en: 'Sales', ar: 'المبيعات' }, sortOrder: 10 },
  {
    systemKey: 'income_delivery_app_sales',
    type: 'IN',
    name: { en: 'Delivery App Sales', ar: 'مبيعات تطبيقات التوصيل' },
    sortOrder: 20,
  },
  { systemKey: 'income_other_income', type: 'IN', name: { en: 'Other Income', ar: 'إيرادات أخرى' }, sortOrder: 30 },
  { systemKey: 'expense_ingredients', type: 'OUT', name: { en: 'Ingredients', ar: 'المكونات' }, sortOrder: 10 },
  { systemKey: 'expense_salaries', type: 'OUT', name: { en: 'Salaries', ar: 'الرواتب' }, sortOrder: 20 },
  { systemKey: 'expense_rent', type: 'OUT', name: { en: 'Rent', ar: 'الإيجار' }, sortOrder: 30 },
  { systemKey: 'expense_utilities', type: 'OUT', name: { en: 'Utilities', ar: 'المرافق' }, sortOrder: 40 },
  { systemKey: 'expense_maintenance', type: 'OUT', name: { en: 'Maintenance', ar: 'الصيانة' }, sortOrder: 50 },
  { systemKey: 'expense_marketing', type: 'OUT', name: { en: 'Marketing', ar: 'التسويق' }, sortOrder: 60 },
  { systemKey: 'expense_delivery_fees', type: 'OUT', name: { en: 'Delivery Fees', ar: 'رسوم التوصيل' }, sortOrder: 70 },
  { systemKey: 'expense_packaging', type: 'OUT', name: { en: 'Packaging', ar: 'التغليف' }, sortOrder: 80 },
  { systemKey: 'expense_other_expense', type: 'OUT', name: { en: 'Other Expense', ar: 'مصروفات أخرى' }, sortOrder: 90 },
] as const;

export const defaultPaymentMethods = [
  { systemKey: 'cash', name: { en: 'Cash', ar: 'كاش' }, kind: 'CASH', sortOrder: 10 },
  { systemKey: 'card', name: { en: 'Card', ar: 'بطاقة' }, kind: 'CARD', sortOrder: 20 },
  { systemKey: 'instapay', name: { en: 'InstaPay', ar: 'إنستاباي' }, kind: 'WALLET', sortOrder: 30 },
  { systemKey: 'vodafone_cash', name: { en: 'Vodafone Cash', ar: 'فودافون كاش' }, kind: 'WALLET', sortOrder: 40 },
  { systemKey: 'delivery_app', name: { en: 'Delivery App', ar: 'تطبيق توصيل' }, kind: 'DELIVERY_APP', sortOrder: 50 },
  { systemKey: 'bank_transfer', name: { en: 'Bank Transfer', ar: 'تحويل بنكي' }, kind: 'BANK_TRANSFER', sortOrder: 60 },
  { systemKey: 'other', name: { en: 'Other', ar: 'أخرى' }, kind: 'OTHER', sortOrder: 70 },
] as const;

export async function seedDefaultFinanceSetup(venueId: string, tx: FinanceSeedClient) {
  await tx.transactionCategory.createMany({
    data: defaultTransactionCategories.map((category) => ({
      venueId,
      systemKey: category.systemKey,
      type: category.type,
      name: category.name,
      sortOrder: category.sortOrder,
    })),
    skipDuplicates: true,
  });

  await tx.paymentMethod.createMany({
    data: defaultPaymentMethods.map((method) => ({
      venueId,
      systemKey: method.systemKey,
      name: method.name,
      kind: method.kind,
      sortOrder: method.sortOrder,
    })),
    skipDuplicates: true,
  });
}
