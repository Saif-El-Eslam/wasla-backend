-- CreateEnum
CREATE TYPE "FinancialTransactionType" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "FinancialAuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE');

-- CreateTable
CREATE TABLE "TransactionCategory" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "type" "FinancialTransactionType" NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "systemKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "kind" TEXT,
    "systemKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "FinancialTransactionType" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "paymentMethodId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "deletedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransactionAuditLog" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "action" "FinancialAuditAction" NOT NULL,
    "actorUserId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTransactionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransactionCategory_venueId_systemKey_key" ON "TransactionCategory"("venueId", "systemKey");

-- CreateIndex
CREATE INDEX "TransactionCategory_venueId_type_active_idx" ON "TransactionCategory"("venueId", "type", "active");

-- CreateIndex
CREATE INDEX "TransactionCategory_venueId_deletedAt_idx" ON "TransactionCategory"("venueId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_venueId_systemKey_key" ON "PaymentMethod"("venueId", "systemKey");

-- CreateIndex
CREATE INDEX "PaymentMethod_venueId_active_idx" ON "PaymentMethod"("venueId", "active");

-- CreateIndex
CREATE INDEX "PaymentMethod_venueId_deletedAt_idx" ON "PaymentMethod"("venueId", "deletedAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_venueId_occurredAt_idx" ON "FinancialTransaction"("venueId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_branchId_occurredAt_idx" ON "FinancialTransaction"("branchId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_categoryId_occurredAt_idx" ON "FinancialTransaction"("categoryId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_paymentMethodId_occurredAt_idx" ON "FinancialTransaction"("paymentMethodId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_venueId_deletedAt_idx" ON "FinancialTransaction"("venueId", "deletedAt");

-- CreateIndex
CREATE INDEX "FinancialTransactionAuditLog_transactionId_createdAt_idx" ON "FinancialTransactionAuditLog"("transactionId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialTransactionAuditLog_venueId_createdAt_idx" ON "FinancialTransactionAuditLog"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialTransactionAuditLog_branchId_createdAt_idx" ON "FinancialTransactionAuditLog"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialTransactionAuditLog_actorUserId_idx" ON "FinancialTransactionAuditLog"("actorUserId");

-- AddForeignKey
ALTER TABLE "TransactionCategory" ADD CONSTRAINT "TransactionCategory_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransactionAuditLog" ADD CONSTRAINT "FinancialTransactionAuditLog_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransactionAuditLog" ADD CONSTRAINT "FinancialTransactionAuditLog_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransactionAuditLog" ADD CONSTRAINT "FinancialTransactionAuditLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransactionAuditLog" ADD CONSTRAINT "FinancialTransactionAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add advanced finance analytics plan feature.
INSERT INTO "Feature" ("id", "key", "name", "description", "valueType", "unit", "displayOrder", "active", "createdAt", "updatedAt")
VALUES (
  'feature-finance-advanced-analytics',
  'FINANCE_ADVANCED_ANALYTICS',
  '{"en":"Advanced finance analytics","ar":"تحليلات مالية متقدمة"}',
  '{"en":"Extends finance reports and analytics history to 12 months.","ar":"يمدد تاريخ التقارير والتحليلات المالية إلى 12 شهرا."}',
  'BOOLEAN',
  NULL,
  110,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "valueType" = EXCLUDED."valueType",
  "unit" = EXCLUDED."unit",
  "displayOrder" = EXCLUDED."displayOrder",
  "active" = EXCLUDED."active",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "PlanFeatureMapping" ("id", "planId", "featureId", "enabled", "valueBool", "updatedAt")
SELECT 'map-' || p."code" || '-FINANCE_ADVANCED_ANALYTICS', p."id", f."id", true, p."code" = 'WASLA_COMPLETE', CURRENT_TIMESTAMP
FROM "Plan" p
CROSS JOIN "Feature" f
WHERE f."key" = 'FINANCE_ADVANCED_ANALYTICS'
ON CONFLICT ("planId", "featureId") DO UPDATE SET
  "enabled" = EXCLUDED."enabled",
  "valueBool" = EXCLUDED."valueBool",
  "valueInt" = NULL,
  "valueString" = NULL,
  "valueJson" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Backfill default categories and payment methods for existing venues.
WITH default_categories("systemKey", "type", "name", "sortOrder") AS (
  VALUES
    ('income_sales', 'IN'::"FinancialTransactionType", '{"en":"Sales","ar":"المبيعات"}'::jsonb, 10),
    ('income_delivery_app_sales', 'IN'::"FinancialTransactionType", '{"en":"Delivery App Sales","ar":"مبيعات تطبيقات التوصيل"}'::jsonb, 20),
    ('income_other_income', 'IN'::"FinancialTransactionType", '{"en":"Other Income","ar":"إيرادات أخرى"}'::jsonb, 30),
    ('expense_ingredients', 'OUT'::"FinancialTransactionType", '{"en":"Ingredients","ar":"المكونات"}'::jsonb, 10),
    ('expense_salaries', 'OUT'::"FinancialTransactionType", '{"en":"Salaries","ar":"الرواتب"}'::jsonb, 20),
    ('expense_rent', 'OUT'::"FinancialTransactionType", '{"en":"Rent","ar":"الإيجار"}'::jsonb, 30),
    ('expense_utilities', 'OUT'::"FinancialTransactionType", '{"en":"Utilities","ar":"المرافق"}'::jsonb, 40),
    ('expense_maintenance', 'OUT'::"FinancialTransactionType", '{"en":"Maintenance","ar":"الصيانة"}'::jsonb, 50),
    ('expense_marketing', 'OUT'::"FinancialTransactionType", '{"en":"Marketing","ar":"التسويق"}'::jsonb, 60),
    ('expense_delivery_fees', 'OUT'::"FinancialTransactionType", '{"en":"Delivery Fees","ar":"رسوم التوصيل"}'::jsonb, 70),
    ('expense_packaging', 'OUT'::"FinancialTransactionType", '{"en":"Packaging","ar":"التغليف"}'::jsonb, 80),
    ('expense_other_expense', 'OUT'::"FinancialTransactionType", '{"en":"Other Expense","ar":"مصروفات أخرى"}'::jsonb, 90)
)
INSERT INTO "TransactionCategory" ("id", "venueId", "systemKey", "type", "name", "sortOrder", "updatedAt")
SELECT 'finance-category-' || v."id" || '-' || dc."systemKey", v."id", dc."systemKey", dc."type", dc."name", dc."sortOrder", CURRENT_TIMESTAMP
FROM "Venue" v
CROSS JOIN default_categories dc
ON CONFLICT ("venueId", "systemKey") DO NOTHING;

WITH default_methods("systemKey", "name", "kind", "sortOrder") AS (
  VALUES
    ('cash', '{"en":"Cash","ar":"كاش"}'::jsonb, 'CASH', 10),
    ('card', '{"en":"Card","ar":"بطاقة"}'::jsonb, 'CARD', 20),
    ('instapay', '{"en":"InstaPay","ar":"إنستاباي"}'::jsonb, 'WALLET', 30),
    ('vodafone_cash', '{"en":"Vodafone Cash","ar":"فودافون كاش"}'::jsonb, 'WALLET', 40),
    ('delivery_app', '{"en":"Delivery App","ar":"تطبيق توصيل"}'::jsonb, 'DELIVERY_APP', 50),
    ('bank_transfer', '{"en":"Bank Transfer","ar":"تحويل بنكي"}'::jsonb, 'BANK_TRANSFER', 60),
    ('other', '{"en":"Other","ar":"أخرى"}'::jsonb, 'OTHER', 70)
)
INSERT INTO "PaymentMethod" ("id", "venueId", "systemKey", "name", "kind", "sortOrder", "updatedAt")
SELECT 'finance-payment-' || v."id" || '-' || dm."systemKey", v."id", dm."systemKey", dm."name", dm."kind", dm."sortOrder", CURRENT_TIMESTAMP
FROM "Venue" v
CROSS JOIN default_methods dm
ON CONFLICT ("venueId", "systemKey") DO NOTHING;
