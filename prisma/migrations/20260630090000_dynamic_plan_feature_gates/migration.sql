ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'PAYMOB');

ALTER TABLE "Subscription"
  ADD COLUMN "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "notes" TEXT;

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

CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "valueType" TEXT NOT NULL DEFAULT 'BOOLEAN',
    "unit" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

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

CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
CREATE INDEX "Plan_active_displayOrder_idx" ON "Plan"("active", "displayOrder");
CREATE UNIQUE INDEX "Feature_key_key" ON "Feature"("key");
CREATE INDEX "Feature_active_displayOrder_idx" ON "Feature"("active", "displayOrder");
CREATE UNIQUE INDEX "PlanFeatureMapping_planId_featureId_key" ON "PlanFeatureMapping"("planId", "featureId");
CREATE INDEX "PlanFeatureMapping_featureId_idx" ON "PlanFeatureMapping"("featureId");
CREATE INDEX "Subscription_plan_idx" ON "Subscription"("plan");
CREATE INDEX "Subscription_status_currentPeriodEnds_idx" ON "Subscription"("status", "currentPeriodEnds");

INSERT INTO "Plan" (
  "id", "code", "publicName", "internalName", "description", "priceAnnualEgp", "displayOrder", "active", "comingSoon", "updatedAt"
) VALUES
  ('plan-free', 'FREE', '{"en":"Wasla Lite","ar":"Wasla Lite"}', 'Wasla Lite', '{"en":"Forever-free Menu SaaS essentials for one branch.","ar":"Forever-free Menu SaaS essentials for one branch."}', 0, 10, true, false, CURRENT_TIMESTAMP),
  ('plan-menu-starter', 'MENU_STARTER', '{"en":"Wasla Starter","ar":"Wasla Starter"}', 'Wasla Starter', '{"en":"Affordable menu digitization with light AI extraction.","ar":"Affordable menu digitization with light AI extraction."}', 250, 20, true, false, CURRENT_TIMESTAMP),
  ('plan-menu-pro', 'MENU_PRO', '{"en":"Wasla Pro","ar":"Wasla Pro"}', 'Wasla Pro', '{"en":"Higher extraction capacity, deeper analytics, and stronger branding.","ar":"Higher extraction capacity, deeper analytics, and stronger branding."}', 600, 30, true, false, CURRENT_TIMESTAMP),
  ('plan-menu-multi-branch', 'MENU_MULTI_BRANCH', '{"en":"Wasla Business","ar":"Wasla Business"}', 'Wasla Business', '{"en":"Menu SaaS for growing multi-branch venues.","ar":"Menu SaaS for growing multi-branch venues."}', 1200, 40, true, false, CURRENT_TIMESTAMP),
  ('plan-wasla-complete', 'WASLA_COMPLETE', '{"en":"Wasla Suite","ar":"Wasla Suite"}', 'Wasla Suite', '{"en":"Premium suite tier reserved for Release 2 finance workflows.","ar":"Premium suite tier reserved for Release 2 finance workflows."}', NULL, 50, true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "publicName" = EXCLUDED."publicName",
  "internalName" = EXCLUDED."internalName",
  "description" = EXCLUDED."description",
  "priceAnnualEgp" = EXCLUDED."priceAnnualEgp",
  "displayOrder" = EXCLUDED."displayOrder",
  "active" = EXCLUDED."active",
  "comingSoon" = EXCLUDED."comingSoon",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Feature" (
  "id", "key", "name", "description", "valueType", "unit", "displayOrder", "active", "updatedAt"
) VALUES
  ('feature-branch-limit', 'BRANCH_LIMIT', '{"en":"Branches","ar":"Branches"}', '{"en":"Maximum managed venue branches.","ar":"Maximum managed venue branches."}', 'NUMBER', 'branches', 10, true, CURRENT_TIMESTAMP),
  ('feature-gemini-extractions-monthly', 'GEMINI_EXTRACTIONS_MONTHLY', '{"en":"Gemini extractions","ar":"Gemini extractions"}', '{"en":"Monthly AI menu extraction requests.","ar":"Monthly AI menu extraction requests."}', 'NUMBER', 'requests/month', 20, true, CURRENT_TIMESTAMP),
  ('feature-gemini-images-per-extraction', 'GEMINI_IMAGES_PER_EXTRACTION', '{"en":"Images per extraction","ar":"Images per extraction"}', '{"en":"Maximum uploaded menu images per extraction request.","ar":"Maximum uploaded menu images per extraction request."}', 'NUMBER', 'images/request', 30, true, CURRENT_TIMESTAMP),
  ('feature-analytics-history-days', 'ANALYTICS_HISTORY_DAYS', '{"en":"Analytics history","ar":"Analytics history"}', '{"en":"Maximum analytics history visible in the dashboard.","ar":"Maximum analytics history visible in the dashboard."}', 'NUMBER', 'days', 40, true, CURRENT_TIMESTAMP),
  ('feature-advanced-analytics', 'ADVANCED_ANALYTICS', '{"en":"Advanced analytics","ar":"Advanced analytics"}', '{"en":"Branch comparison, item charts, and flexible date ranges.","ar":"Branch comparison, item charts, and flexible date ranges."}', 'BOOLEAN', NULL, 50, true, CURRENT_TIMESTAMP),
  ('feature-qr-branding', 'QR_BRANDING', '{"en":"QR branding","ar":"QR branding"}', '{"en":"Wasla signed, venue logo, or custom QR branding level.","ar":"Wasla signed, venue logo, or custom QR branding level."}', 'TEXT', NULL, 60, true, CURRENT_TIMESTAMP),
  ('feature-custom-qr-assets', 'CUSTOM_QR_ASSETS', '{"en":"Custom QR assets","ar":"Custom QR assets"}', '{"en":"Customized QR and poster asset generation options.","ar":"Customized QR and poster asset generation options."}', 'BOOLEAN', NULL, 70, true, CURRENT_TIMESTAMP),
  ('feature-staff-users', 'STAFF_USERS', '{"en":"Staff users","ar":"Staff users"}', '{"en":"Maximum users in the venue workspace.","ar":"Maximum users in the venue workspace."}', 'NUMBER', 'users', 80, true, CURRENT_TIMESTAMP),
  ('feature-languages', 'LANGUAGES', '{"en":"Languages","ar":"Languages"}', '{"en":"Maximum supported menu languages.","ar":"Maximum supported menu languages."}', 'NUMBER', 'languages', 90, true, CURRENT_TIMESTAMP),
  ('feature-finance-module', 'FINANCE_MODULE', '{"en":"Finance module","ar":"Finance module"}', '{"en":"Future finance module unlock for Wasla Suite.","ar":"Future finance module unlock for Wasla Suite."}', 'BOOLEAN', NULL, 100, true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "valueType" = EXCLUDED."valueType",
  "unit" = EXCLUDED."unit",
  "displayOrder" = EXCLUDED."displayOrder",
  "active" = EXCLUDED."active",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "PlanFeatureMapping" (
  "id", "planId", "featureId", "enabled", "valueInt", "valueBool", "valueString", "updatedAt"
)
SELECT 'map-' || p."code" || '-' || f."key", p."id", f."id", true,
  CASE f."key"
    WHEN 'BRANCH_LIMIT' THEN CASE p."code" WHEN 'MENU_MULTI_BRANCH' THEN 10 WHEN 'WASLA_COMPLETE' THEN 10 ELSE 1 END
    WHEN 'GEMINI_EXTRACTIONS_MONTHLY' THEN CASE p."code" WHEN 'FREE' THEN 0 WHEN 'MENU_STARTER' THEN 2 WHEN 'MENU_PRO' THEN 15 WHEN 'MENU_MULTI_BRANCH' THEN 999999 WHEN 'WASLA_COMPLETE' THEN 999999 END
    WHEN 'GEMINI_IMAGES_PER_EXTRACTION' THEN CASE p."code" WHEN 'FREE' THEN 0 WHEN 'MENU_STARTER' THEN 3 ELSE 8 END
    WHEN 'ANALYTICS_HISTORY_DAYS' THEN CASE p."code" WHEN 'FREE' THEN 7 WHEN 'MENU_STARTER' THEN 30 WHEN 'MENU_PRO' THEN 90 ELSE 999999 END
    WHEN 'STAFF_USERS' THEN CASE p."code" WHEN 'FREE' THEN 2 WHEN 'MENU_STARTER' THEN 5 WHEN 'MENU_PRO' THEN 10 ELSE 999999 END
    WHEN 'LANGUAGES' THEN CASE p."code" WHEN 'FREE' THEN 1 WHEN 'MENU_STARTER' THEN 2 ELSE 999999 END
    ELSE NULL
  END,
  CASE f."key"
    WHEN 'ADVANCED_ANALYTICS' THEN p."code" IN ('MENU_PRO', 'MENU_MULTI_BRANCH', 'WASLA_COMPLETE')
    WHEN 'CUSTOM_QR_ASSETS' THEN p."code" IN ('MENU_MULTI_BRANCH', 'WASLA_COMPLETE')
    WHEN 'FINANCE_MODULE' THEN p."code" = 'WASLA_COMPLETE'
    ELSE NULL
  END,
  CASE f."key"
    WHEN 'QR_BRANDING' THEN CASE p."code" WHEN 'FREE' THEN 'WASLA_SIGNED' WHEN 'MENU_MULTI_BRANCH' THEN 'FULL_CUSTOM' WHEN 'WASLA_COMPLETE' THEN 'FULL_CUSTOM' ELSE 'VENUE_LOGO' END
    ELSE NULL
  END,
  CURRENT_TIMESTAMP
FROM "Plan" p
CROSS JOIN "Feature" f
ON CONFLICT ("planId", "featureId") DO UPDATE SET
  "enabled" = EXCLUDED."enabled",
  "valueInt" = EXCLUDED."valueInt",
  "valueBool" = EXCLUDED."valueBool",
  "valueString" = EXCLUDED."valueString",
  "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_plan_fkey" FOREIGN KEY ("plan") REFERENCES "Plan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanFeatureMapping" ADD CONSTRAINT "PlanFeatureMapping_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanFeatureMapping" ADD CONSTRAINT "PlanFeatureMapping_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE IF EXISTS "PlanLimit";
