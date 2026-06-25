-- CreateTable
CREATE TABLE "PlanLimit" (
    "id" TEXT NOT NULL,
    "plan" "MenuPlan" NOT NULL,
    "displayName" JSONB NOT NULL,
    "description" JSONB,
    "branchLimit" INTEGER NOT NULL DEFAULT 1,
    "extractionMonthlyLimit" INTEGER NOT NULL DEFAULT 0,
    "extractionMaxImages" INTEGER NOT NULL DEFAULT 0,
    "customQrBranding" BOOLEAN NOT NULL DEFAULT false,
    "advancedAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanLimit_plan_key" ON "PlanLimit"("plan");

-- SeedData
INSERT INTO "PlanLimit" (
    "id",
    "plan",
    "displayName",
    "description",
    "branchLimit",
    "extractionMonthlyLimit",
    "extractionMaxImages",
    "customQrBranding",
    "advancedAnalytics",
    "updatedAt"
) VALUES
    ('plan-free', 'FREE', '{"en":"Free","ar":"Free"}', '{"en":"Starter trial limits for one branch.","ar":"Starter trial limits for one branch."}', 1, 1, 2, false, false, CURRENT_TIMESTAMP),
    ('plan-menu-starter', 'MENU_STARTER', '{"en":"Menu Starter","ar":"Menu Starter"}', '{"en":"Core menu tools for one branch.","ar":"Core menu tools for one branch."}', 1, 10, 4, false, false, CURRENT_TIMESTAMP),
    ('plan-menu-pro', 'MENU_PRO', '{"en":"Menu Pro","ar":"Menu Pro"}', '{"en":"More extraction capacity and QR branding.","ar":"More extraction capacity and QR branding."}', 3, 50, 8, true, true, CURRENT_TIMESTAMP),
    ('plan-menu-multi-branch', 'MENU_MULTI_BRANCH', '{"en":"Menu Multi Branch","ar":"Menu Multi Branch"}', '{"en":"Menu tools for growing multi-branch venues.","ar":"Menu tools for growing multi-branch venues."}', 10, 100, 8, true, true, CURRENT_TIMESTAMP),
    ('plan-wasla-complete', 'WASLA_COMPLETE', '{"en":"Wasla Complete","ar":"Wasla Complete"}', '{"en":"Complete Wasla plan, with finance reserved for Release 2.","ar":"Complete Wasla plan, with finance reserved for Release 2."}', 20, 100, 8, true, true, CURRENT_TIMESTAMP);
