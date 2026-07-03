import { AnalyticsEventType } from '@prisma/client';
import { prisma } from '../../database/prisma';

export type AnalyticsStats = {
  views: number;
  scans: number;
  whatsapp: number;
  calls: number;
  maps: number;
};

const trackedEvents = [
  AnalyticsEventType.MENU_VIEW,
  AnalyticsEventType.QR_SCAN,
  AnalyticsEventType.WHATSAPP_CLICK,
  AnalyticsEventType.CALL_CLICK,
  AnalyticsEventType.MAPS_CLICK,
] as const;

function emptyStats(): AnalyticsStats {
  return {
    views: 0,
    scans: 0,
    whatsapp: 0,
    calls: 0,
    maps: 0,
  };
}

function addEvent(stats: AnalyticsStats, eventType: AnalyticsEventType, count: number) {
  if (eventType === AnalyticsEventType.MENU_VIEW) {
    stats.views += count;
    return;
  }

  if (eventType === AnalyticsEventType.QR_SCAN) {
    stats.scans += count;
    return;
  }

  if (eventType === AnalyticsEventType.WHATSAPP_CLICK) {
    stats.whatsapp += count;
    return;
  }

  if (eventType === AnalyticsEventType.CALL_CLICK) {
    stats.calls += count;
    return;
  }

  if (eventType === AnalyticsEventType.MAPS_CLICK) {
    stats.maps += count;
  }
}

function statsForKey(statsByKey: Map<string, AnalyticsStats>, key: string | null, count = 0, eventType?: AnalyticsEventType) {
  if (!key) {
    return;
  }

  const stats = statsByKey.get(key) ?? emptyStats();

  if (eventType) {
    addEvent(stats, eventType, count);
  }

  statsByKey.set(key, stats);
}

export function analyticsStatsOrEmpty(stats?: AnalyticsStats) {
  return stats ?? emptyStats();
}

export function menuAnalyticsSnapshot(menuId: string, stats?: AnalyticsStats) {
  const analytics = analyticsStatsOrEmpty(stats);

  return {
    id: menuId,
    menuId,
    viewCount: analytics.views,
    qrScanCount: analytics.scans,
    whatsappClicks: analytics.whatsapp,
    callClicks: analytics.calls,
    mapsClicks: analytics.maps,
  };
}

export async function analyticsStatsByBranchIds(branchIds: string[]) {
  const statsByBranchId = new Map<string, AnalyticsStats>();

  branchIds.forEach((branchId) => statsForKey(statsByBranchId, branchId));

  if (branchIds.length === 0) {
    return statsByBranchId;
  }

  const rows = await prisma.analyticsEventLog.groupBy({
    by: ['branchId', 'eventType'],
    where: {
      branchId: { in: branchIds },
      eventType: { in: [...trackedEvents] },
    },
    _count: { _all: true },
  });

  rows.forEach((row) => statsForKey(statsByBranchId, row.branchId, row._count._all, row.eventType));

  return statsByBranchId;
}

export async function analyticsStatsByMenuIds(menuIds: string[]) {
  const statsByMenuId = new Map<string, AnalyticsStats>();

  menuIds.forEach((menuId) => statsForKey(statsByMenuId, menuId));

  if (menuIds.length === 0) {
    return statsByMenuId;
  }

  const rows = await prisma.analyticsEventLog.groupBy({
    by: ['menuId', 'eventType'],
    where: {
      menuId: { in: menuIds },
      eventType: { in: [...trackedEvents] },
    },
    _count: { _all: true },
  });

  rows.forEach((row) => statsForKey(statsByMenuId, row.menuId, row._count._all, row.eventType));

  return statsByMenuId;
}
