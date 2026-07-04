import { AnalyticsEventType } from '@prisma/client';
import { prisma } from '../../database/prisma';
import {
  branchScopeWhere,
  requireAccessUser,
  requireBranchAccess,
} from '../../common/auth/branch-access';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { dayKey } from '../../common/timezone';
import { venueTimezone } from '../../common/venue-timezone';
import { assertAnalyticsAllowed, assertAnalyticsRangeAllowed } from '../subscription/plan-guards';
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

export async function getAnalyticsSummary(
  session: SessionPayload | undefined,
  query: z.infer<typeof analyticsQuerySchema>,
  options: { advanced?: boolean } = {},
) {
  const user = await requireAccessUser(session);
  const timeZone = await venueTimezone(user.venueId);
  const now = new Date();
  const periodDays =
    query.period === 'all' ? 3650 : query.period === '90d' ? 90 : query.period === '30d' ? 30 : 7;
  const requestedFrom = query.from ?? new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const requestedTo = query.to ?? now;
  console.log('requestedFrom', requestedFrom);
  const range =
    query.from || query.to
      ? await assertAnalyticsRangeAllowed(
          user.venueId,
          requestedFrom,
          requestedTo,
          Boolean(options.advanced),
        )
      : await (async () => {
          await assertAnalyticsAllowed(user.venueId, periodDays, Boolean(options.advanced));
          return await assertAnalyticsRangeAllowed(
            user.venueId,
            requestedFrom,
            requestedTo,
            Boolean(options.advanced),
          );
        })();
  console.log('Analytics Summary');

  const currentStart = range.from;
  const currentEnd = range.to;
  const effectiveMs = Math.max(currentEnd.getTime() - currentStart.getTime(), 24 * 60 * 60 * 1000);
  const effectiveDays = Math.max(1, Math.ceil(effectiveMs / (24 * 60 * 60 * 1000)));
  const previousStart = new Date(currentStart.getTime() - effectiveMs);

  console.log('Analytics Summary');

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

  events = branchIds.length
    ? await prisma.analyticsEventLog.findMany({
        where: {
          venueId: user.venueId,
          branchId: { in: branchIds },
          createdAt: { gte: previousStart, lte: currentEnd },
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

  const metrics = Object.fromEntries(
    (Object.keys(metricEventMap) as MetricKey[]).map((key) => {
      const eventType = metricEventMap[key];
      const current = events.filter(
        (event) =>
          event.eventType === eventType &&
          event.createdAt >= currentStart &&
          event.createdAt <= currentEnd,
      ).length;
      const previous = events.filter(
        (event) => event.eventType === eventType && event.createdAt < currentStart,
      ).length;

      return [key, { current, previous, change: percentChange(current, previous) }];
    }),
  ) as Record<MetricKey, { current: number; previous: number; change: number }>;

  const series = Array.from({ length: Math.min(effectiveDays, 14) }, (_, index) => {
    const date = new Date(currentEnd);
    date.setDate(currentEnd.getDate() - (Math.min(effectiveDays, 14) - index - 1));
    const key = dayKey(date, timeZone);
    const dayEvents = events.filter((event) => dayKey(event.createdAt, timeZone) === key);

    return {
      label:
        query.period === '7d' && !query.from && !query.to
          ? date.toLocaleDateString('en', { weekday: 'short', timeZone })
          : key.slice(5),
      views: dayEvents.filter((event) => event.eventType === AnalyticsEventType.MENU_VIEW).length,
      scans: dayEvents.filter((event) => event.eventType === AnalyticsEventType.QR_SCAN).length,
    };
  });

  const branchActivity = branches.map((branch) => ({
    branchId: branch.id,
    name: branch.name,
    slug: branch.slug,
    value: events.filter(
      (event) =>
        event.branchId === branch.id &&
        event.createdAt >= currentStart &&
        event.createdAt <= currentEnd,
    ).length,
  }));

  const itemViews = events
    .filter(
      (event) =>
        event.itemId &&
        event.eventType === AnalyticsEventType.ITEM_VIEW &&
        event.createdAt >= currentStart &&
        event.createdAt <= currentEnd,
    )
    .reduce<Record<string, { itemId: string; name: unknown; views: number }>>((acc, event) => {
      if (!event.itemId) {
        return acc;
      }

      acc[event.itemId] ??= { itemId: event.itemId, name: event.item?.name ?? null, views: 0 };
      acc[event.itemId].views += 1;
      return acc;
    }, {});

  return {
    period: query.from || query.to ? 'custom' : query.period,
    branchId: query.branchId ?? null,
    filters: {
      from: currentStart,
      to: currentEnd,
      clamped: range.clamped,
    },
    allowedRange: {
      from: range.allowedFrom,
      to: range.allowedTo,
    },
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
