-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('PHONE_VERIFY', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "FinancialTransactionType" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "FinancialAuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE');

-- CreateEnum
CREATE TYPE "MenuTheme" AS ENUM ('CLASSIC', 'MODERN', 'MINIMAL');

-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('VENUE_VIEW', 'MENU_VIEW', 'CATEGORY_VIEW', 'QR_SCAN', 'WHATSAPP_CLICK', 'CALL_CLICK', 'MAPS_CLICK', 'ITEM_VIEW');

-- CreateEnum
CREATE TYPE "ExtractionJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MenuPlan" AS ENUM ('FREE', 'MENU_STARTER', 'MENU_PRO', 'MENU_MULTI_BRANCH', 'WASLA_COMPLETE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'PAYMOB');

-- CreateEnum
CREATE TYPE "PlanFeatureValueType" AS ENUM ('BOOLEAN', 'NUMBER', 'TEXT', 'JSON');

-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('RESTAURANT', 'CAFE', 'BAKERY', 'DESSERT_SHOP', 'FOOD_TRUCK', 'CLOUD_KITCHEN', 'CATERING', 'LOUNGE', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "venueId" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "phoneVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBranchAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBranchAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "deliveryCodeEncrypted" TEXT,
    "purpose" "OtpPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "theme" "MenuTheme" NOT NULL DEFAULT 'MODERN',
    "showPrices" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionJob" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "requestedById" TEXT,
    "status" "ExtractionJobStatus" NOT NULL DEFAULT 'PENDING',
    "modelProvider" TEXT NOT NULL DEFAULT 'google',
    "modelName" TEXT NOT NULL,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "rawModelResponse" TEXT,
    "extractedMenu" JSONB,
    "confidenceScore" DOUBLE PRECISION,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "price" DECIMAL(10,2),
    "imageUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "calories" INTEGER,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemPrice" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItemPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuQrCode" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "targetUrl" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuQrCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuAnalytics" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "qrScanCount" INTEGER NOT NULL DEFAULT 0,
    "whatsappClicks" INTEGER NOT NULL DEFAULT 0,
    "callClicks" INTEGER NOT NULL DEFAULT 0,
    "mapsClicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEventLog" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "menuId" TEXT,
    "categoryId" TEXT,
    "itemId" TEXT,
    "eventType" "AnalyticsEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "plan" "MenuPlan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
    "currentPeriodEnds" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionHistory" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "subscriptionId" TEXT,
    "venueId" TEXT NOT NULL,
    "plan" "MenuPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
    "annualAmountEgp" INTEGER,
    "currentPeriodEnds" TIMESTAMP(3),
    "notes" TEXT,
    "changeType" TEXT NOT NULL DEFAULT 'ADMIN_UPDATE',
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" "MenuPlan" NOT NULL,
    "publicName" JSONB NOT NULL,
    "internalName" TEXT NOT NULL,
    "description" JSONB,
    "priceAnnualEgp" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "comingSoon" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "valueType" "PlanFeatureValueType" NOT NULL DEFAULT 'BOOLEAN',
    "unit" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanFeatureMapping" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "valueInt" INTEGER,
    "valueBool" BOOLEAN,
    "valueString" TEXT,
    "valueJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanFeatureMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "type" "VenueType" NOT NULL DEFAULT 'RESTAURANT',
    "name" JSONB NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "address" JSONB,
    "googleMapsUrl" TEXT,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "description" JSONB,
    "defaultLocale" TEXT NOT NULL DEFAULT 'ar',
    "supportedLocales" TEXT[] DEFAULT ARRAY['ar', 'en']::TEXT[],
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "slug" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "address" JSONB,
    "googleMapsUrl" TEXT,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "openingHours" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_venueId_idx" ON "User"("venueId");

-- CreateIndex
CREATE INDEX "UserBranchAccess_branchId_idx" ON "UserBranchAccess"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBranchAccess_userId_branchId_key" ON "UserBranchAccess"("userId", "branchId");

-- CreateIndex
CREATE INDEX "OtpCode_userId_purpose_idx" ON "OtpCode"("userId", "purpose");

-- CreateIndex
CREATE INDEX "TransactionCategory_venueId_type_active_idx" ON "TransactionCategory"("venueId", "type", "active");

-- CreateIndex
CREATE INDEX "TransactionCategory_venueId_deletedAt_idx" ON "TransactionCategory"("venueId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionCategory_venueId_systemKey_key" ON "TransactionCategory"("venueId", "systemKey");

-- CreateIndex
CREATE INDEX "PaymentMethod_venueId_active_idx" ON "PaymentMethod"("venueId", "active");

-- CreateIndex
CREATE INDEX "PaymentMethod_venueId_deletedAt_idx" ON "PaymentMethod"("venueId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_venueId_systemKey_key" ON "PaymentMethod"("venueId", "systemKey");

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

-- CreateIndex
CREATE UNIQUE INDEX "Menu_branchId_key" ON "Menu"("branchId");

-- CreateIndex
CREATE INDEX "Menu_branchId_publishedAt_idx" ON "Menu"("branchId", "publishedAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_venueId_createdAt_idx" ON "ExtractionJob"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_branchId_createdAt_idx" ON "ExtractionJob"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_menuId_status_idx" ON "ExtractionJob"("menuId", "status");

-- CreateIndex
CREATE INDEX "MenuCategory_menuId_sortOrder_idx" ON "MenuCategory"("menuId", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuItem_categoryId_sortOrder_idx" ON "MenuItem"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuItemPrice_itemId_sortOrder_idx" ON "MenuItemPrice"("itemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemPrice_itemId_label_key" ON "MenuItemPrice"("itemId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "MenuQrCode_menuId_key" ON "MenuQrCode"("menuId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuQrCode_shortCode_key" ON "MenuQrCode"("shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "MenuAnalytics_menuId_key" ON "MenuAnalytics"("menuId");

-- CreateIndex
CREATE INDEX "AnalyticsEventLog_venueId_createdAt_idx" ON "AnalyticsEventLog"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEventLog_branchId_createdAt_idx" ON "AnalyticsEventLog"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEventLog_menuId_createdAt_idx" ON "AnalyticsEventLog"("menuId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEventLog_eventType_createdAt_idx" ON "AnalyticsEventLog"("eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_venueId_key" ON "Subscription"("venueId");

-- CreateIndex
CREATE INDEX "Subscription_plan_idx" ON "Subscription"("plan");

-- CreateIndex
CREATE INDEX "Subscription_status_currentPeriodEnds_idx" ON "Subscription"("status", "currentPeriodEnds");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionHistory_sequence_key" ON "SubscriptionHistory"("sequence");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_subscriptionId_sequence_idx" ON "SubscriptionHistory"("subscriptionId", "sequence");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_venueId_sequence_idx" ON "SubscriptionHistory"("venueId", "sequence");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_plan_idx" ON "SubscriptionHistory"("plan");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_status_currentPeriodEnds_idx" ON "SubscriptionHistory"("status", "currentPeriodEnds");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_changedById_idx" ON "SubscriptionHistory"("changedById");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX "Plan_active_displayOrder_idx" ON "Plan"("active", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_key_key" ON "Feature"("key");

-- CreateIndex
CREATE INDEX "Feature_active_displayOrder_idx" ON "Feature"("active", "displayOrder");

-- CreateIndex
CREATE INDEX "PlanFeatureMapping_featureId_idx" ON "PlanFeatureMapping"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanFeatureMapping_planId_featureId_key" ON "PlanFeatureMapping"("planId", "featureId");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");

-- CreateIndex
CREATE INDEX "Venue_ownerId_idx" ON "Venue"("ownerId");

-- CreateIndex
CREATE INDEX "Branch_venueId_isMain_idx" ON "Branch"("venueId", "isMain");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_venueId_slug_key" ON "Branch"("venueId", "slug");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionJob" ADD CONSTRAINT "ExtractionJob_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemPrice" ADD CONSTRAINT "MenuItemPrice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuQrCode" ADD CONSTRAINT "MenuQrCode_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuAnalytics" ADD CONSTRAINT "MenuAnalytics_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEventLog" ADD CONSTRAINT "AnalyticsEventLog_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEventLog" ADD CONSTRAINT "AnalyticsEventLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEventLog" ADD CONSTRAINT "AnalyticsEventLog_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEventLog" ADD CONSTRAINT "AnalyticsEventLog_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEventLog" ADD CONSTRAINT "AnalyticsEventLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_plan_fkey" FOREIGN KEY ("plan") REFERENCES "Plan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_plan_fkey" FOREIGN KEY ("plan") REFERENCES "Plan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanFeatureMapping" ADD CONSTRAINT "PlanFeatureMapping_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanFeatureMapping" ADD CONSTRAINT "PlanFeatureMapping_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
