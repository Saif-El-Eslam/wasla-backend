CREATE TYPE "AnalyticsEventType" AS ENUM (
  'MENU_VIEW',
  'QR_SCAN',
  'WHATSAPP_CLICK',
  'CALL_CLICK',
  'MAPS_CLICK',
  'ITEM_VIEW'
);

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

CREATE INDEX "AnalyticsEventLog_venueId_createdAt_idx" ON "AnalyticsEventLog"("venueId", "createdAt");
CREATE INDEX "AnalyticsEventLog_branchId_createdAt_idx" ON "AnalyticsEventLog"("branchId", "createdAt");
CREATE INDEX "AnalyticsEventLog_menuId_createdAt_idx" ON "AnalyticsEventLog"("menuId", "createdAt");
CREATE INDEX "AnalyticsEventLog_eventType_createdAt_idx" ON "AnalyticsEventLog"("eventType", "createdAt");

ALTER TABLE "AnalyticsEventLog"
  ADD CONSTRAINT "AnalyticsEventLog_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalyticsEventLog"
  ADD CONSTRAINT "AnalyticsEventLog_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalyticsEventLog"
  ADD CONSTRAINT "AnalyticsEventLog_menuId_fkey"
  FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnalyticsEventLog"
  ADD CONSTRAINT "AnalyticsEventLog_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnalyticsEventLog"
  ADD CONSTRAINT "AnalyticsEventLog_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
