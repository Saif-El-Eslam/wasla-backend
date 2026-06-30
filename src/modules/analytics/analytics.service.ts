import { AnalyticsEventType } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { branchScopeWhere, requireAccessUser, requireBranchAccess } from '../../common/auth/branch-access';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { assertAnalyticsAllowed } from '../subscription/subscription.service';
import type { z } from 'zod';
import type { analyticsQuerySchema } from './analytics.schemas';

const metricEventMap = {
  venueViews: AnalyticsEventType.VENUE_VIEW,
  views: AnalyticsEventType.MENU_VIEW,
  categoryViews: AnalyticsEventType.CATEGORY_VIEW,
  itemViews: AnalyticsEventType.ITEM_VIEW,
  scans: AnalyticsEventType.QR_SCAN,
  whatsapp: AnalyticsEventType.WHATSAPP_CLICK,
  calls: AnalyticsEventType.CALL_CLICK,
  maps: AnalyticsEventType.MAPS_CLICK,
} as const;

type MetricKey = keyof typeof metricEventMap;

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isMissingAnalyticsLogTable(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2021');
}

async function getAnalyticsFallback(
  session: SessionPayload | undefined,
  query: z.infer<typeof analyticsQuerySchema>,
  branches: Array<{ id: string; name: unknown; slug: string }>,
) {
  const menus = await prisma.menu.findMany({
    where: {
      branchId: { in: branches.map((branch) => branch.id) },
    },
    select: {
      branchId: true,
      analytics: true,
      categories: {
        orderBy: { sortOrder: 'asc' },
        select: {
          items: {
            orderBy: { sortOrder: 'asc' },
            take: 5,
            select: {
              id: true,
              name: true,
              available: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });
  const totals = menus.reduce(
    (acc, menu) => {
      acc.views += menu.analytics?.viewCount ?? 0;
      acc.scans += menu.analytics?.qrScanCount ?? 0;
      acc.whatsapp += menu.analytics?.whatsappClicks ?? 0;
      acc.calls += menu.analytics?.callClicks ?? 0;
      acc.maps += menu.analytics?.mapsClicks ?? 0;
      return acc;
    },
    { venueViews: 0, views: 0, categoryViews: 0, itemViews: 0, scans: 0, whatsapp: 0, calls: 0, maps: 0 },
  );
  const metrics = Object.fromEntries(
    (Object.keys(metricEventMap) as MetricKey[]).map((key) => [
      key,
      { current: totals[key], previous: 0, change: totals[key] > 0 ? 100 : 0 },
    ]),
  ) as Record<MetricKey, { current: number; previous: number; change: number }>;
  const branchActivity = branches.map((branch) => {
    const menu = menus.find((item) => item.branchId === branch.id);
    return {
      branchId: branch.id,
      name: branch.name,
      slug: branch.slug,
      value: (menu?.analytics?.viewCount ?? 0) + (menu?.analytics?.qrScanCount ?? 0),
    };
  });
  const topItems = menus
    .flatMap((menu) => menu.categories.flatMap((category) => category.items))
    .sort((a, b) => Number(b.available) - Number(a.available) || a.sortOrder - b.sortOrder)
    .slice(0, 5)
    .map((item) => ({ itemId: item.id, name: item.name, views: 0 }));

  return {
    period: query.period,
    branchId: query.branchId ?? null,
    metrics,
    series: [],
    branchActivity,
    topItems,
  };
}

export async function getAnalyticsSummary(
  session: SessionPayload | undefined,
  query: z.infer<typeof analyticsQuerySchema>,
  options: { advanced?: boolean } = {},
) {
  const user = await requireAccessUser(session);
  const days = query.period === 'all' ? 999999 : query.period === '90d' ? 90 : query.period === '30d' ? 30 : 7;
  await assertAnalyticsAllowed(user.venueId, days, Boolean(options.advanced));
  const now = new Date();
  const effectiveDays = query.period === 'all' ? 3650 : days;
  const currentStart = new Date(now.getTime() - effectiveDays * 24 * 60 * 60 * 1000);
  const previousStart = new Date(now.getTime() - effectiveDays * 2 * 24 * 60 * 60 * 1000);

  const branches = query.branchId
    ? [(await requireBranchAccess(session, query.branchId)).branch]
    : await prisma.branch.findMany({
        where: branchScopeWhere(user),
        select: { id: true, name: true, slug: true },
      });
  const branchIds = branches.map((branch) => branch.id);

  let events: Array<{
    eventType: AnalyticsEventType;
    createdAt: Date;
    branchId: string;
    itemId: string | null;
    item: { name: unknown } | null;
  }> = [];

  try {
    events = branchIds.length
      ? await prisma.analyticsEventLog.findMany({
        where: {
          venueId: user.venueId,
          branchId: { in: branchIds },
          createdAt: { gte: previousStart },
        },
        select: {
          eventType: true,
          createdAt: true,
          branchId: true,
          itemId: true,
          branch: { select: { name: true, slug: true } },
          item: { select: { name: true } },
        },
        })
      : [];
  } catch (error) {
    if (isMissingAnalyticsLogTable(error)) {
      return getAnalyticsFallback(session, query, branches);
    }

    throw error;
  }

  const metrics = Object.fromEntries(
    (Object.keys(metricEventMap) as MetricKey[]).map((key) => {
      const eventType = metricEventMap[key];
      const current = events.filter((event) => event.eventType === eventType && event.createdAt >= currentStart).length;
      const previous = events.filter((event) => event.eventType === eventType && event.createdAt < currentStart).length;

      return [key, { current, previous, change: percentChange(current, previous) }];
    }),
  ) as Record<MetricKey, { current: number; previous: number; change: number }>;

  const series = Array.from({ length: Math.min(effectiveDays, 14) }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (Math.min(effectiveDays, 14) - index - 1));
    const key = dayKey(date);
    const dayEvents = events.filter((event) => dayKey(event.createdAt) === key);

    return {
      label: query.period === '7d' ? date.toLocaleDateString('en', { weekday: 'short' }) : key.slice(5),
      views: dayEvents.filter((event) => event.eventType === AnalyticsEventType.MENU_VIEW).length,
      scans: dayEvents.filter((event) => event.eventType === AnalyticsEventType.QR_SCAN).length,
    };
  });

  const branchActivity = branches.map((branch) => ({
    branchId: branch.id,
    name: branch.name,
    slug: branch.slug,
    value: events.filter((event) => event.branchId === branch.id && event.createdAt >= currentStart).length,
  }));

  const itemViews = events
    .filter((event) => event.itemId && event.eventType === AnalyticsEventType.ITEM_VIEW && event.createdAt >= currentStart)
    .reduce<Record<string, { itemId: string; name: unknown; views: number }>>((acc, event) => {
      if (!event.itemId) {
        return acc;
      }

      acc[event.itemId] ??= { itemId: event.itemId, name: event.item?.name ?? null, views: 0 };
      acc[event.itemId].views += 1;
      return acc;
    }, {});

  return {
    period: query.period,
    branchId: query.branchId ?? null,
    metrics,
    series,
    branchActivity,
    topItems: Object.values(itemViews)
      .sort((a, b) => b.views - a.views)
      .slice(0, 5),
  };
}

export async function getBasicAnalyticsSummary(
  session: SessionPayload | undefined,
  query: z.infer<typeof analyticsQuerySchema>,
) {
  const analytics = await getAnalyticsSummary(session, query, { advanced: false });

  return {
    period: analytics.period,
    branchId: analytics.branchId,
    totals: {
      views: analytics.metrics.views.current,
      scans: analytics.metrics.scans.current,
      actionClicks:
        analytics.metrics.whatsapp.current +
        analytics.metrics.calls.current +
        analytics.metrics.maps.current,
    },
    metrics: {
      views: analytics.metrics.views,
      scans: analytics.metrics.scans,
      whatsapp: analytics.metrics.whatsapp,
      calls: analytics.metrics.calls,
      maps: analytics.metrics.maps,
    },
    series: analytics.series,
  };
}
