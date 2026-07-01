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

INSERT INTO "SubscriptionHistory" (
  "id",
  "subscriptionId",
  "venueId",
  "plan",
  "status",
  "paymentProvider",
  "annualAmountEgp",
  "currentPeriodEnds",
  "notes",
  "changeType",
  "createdAt"
)
SELECT
  'subhist-backfill-' || s."id",
  s."id",
  s."venueId",
  s."plan",
  s."status",
  s."paymentProvider",
  p."priceAnnualEgp",
  s."currentPeriodEnds",
  s."notes",
  'MIGRATION_BACKFILL',
  s."updatedAt"
FROM "Subscription" s
LEFT JOIN "Plan" p ON p."code" = s."plan";

CREATE UNIQUE INDEX "SubscriptionHistory_sequence_key" ON "SubscriptionHistory"("sequence");
CREATE INDEX "SubscriptionHistory_subscriptionId_sequence_idx" ON "SubscriptionHistory"("subscriptionId", "sequence");
CREATE INDEX "SubscriptionHistory_venueId_sequence_idx" ON "SubscriptionHistory"("venueId", "sequence");
CREATE INDEX "SubscriptionHistory_plan_idx" ON "SubscriptionHistory"("plan");
CREATE INDEX "SubscriptionHistory_status_currentPeriodEnds_idx" ON "SubscriptionHistory"("status", "currentPeriodEnds");
CREATE INDEX "SubscriptionHistory_changedById_idx" ON "SubscriptionHistory"("changedById");

ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_plan_fkey" FOREIGN KEY ("plan") REFERENCES "Plan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
