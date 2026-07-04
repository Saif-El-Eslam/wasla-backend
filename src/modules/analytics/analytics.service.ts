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
import {
  buildAnalyticsSummarySections,
  type AnalyticsSummaryBranch,
  type AnalyticsSummaryEvent,
} from './analytics-summary';

type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

async function resolveAnalyticsRange(
  venueId: string,
  query: AnalyticsQuery,
  options: { advanced?: boolean },
) {
  const now = new Date();
  const periodDays =
    query.period === 'all' ? 3650 : query.period === '90d' ? 90 : query.period === '30d' ? 30 : 7;
  const requestedFrom = query.from ?? new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const requestedTo = query.to ?? now;
  const advanced = Boolean(options.advanced);

  if (query.from || query.to) {
    const range = await assertAnalyticsRangeAllowed(venueId, requestedFrom, requestedTo, advanced);
    return { range, periodDays };
  }

  await assertAnalyticsAllowed(venueId, periodDays, advanced);

  return {
    range: await assertAnalyticsRangeAllowed(venueId, requestedFrom, requestedTo, advanced),
    periodDays,
  };
}

async function analyticsBranches(
  session: SessionPayload | undefined,
  user: Awaited<ReturnType<typeof requireAccessUser>>,
  branchId?: string,
): Promise<AnalyticsSummaryBranch[]> {
  if (branchId) {
    return [(await requireBranchAccess(session, branchId)).branch];
  }

  return prisma.branch.findMany({
    where: branchScopeWhere(user),
    select: { id: true, name: true, slug: true },
  });
}

async function analyticsEvents(input: {
  venueId: string;
  branchIds: string[];
  from: Date;
  to: Date;
}): Promise<AnalyticsSummaryEvent[]> {
  if (input.branchIds.length === 0) {
    return [];
  }

  return prisma.analyticsEventLog.findMany({
    where: {
      venueId: input.venueId,
      branchId: { in: input.branchIds },
      createdAt: { gte: input.from, lte: input.to },
    },
    select: {
      eventType: true,
      createdAt: true,
      branchId: true,
      itemId: true,
      item: { select: { name: true } },
    },
  });
}

export async function getAnalyticsSummary(
  session: SessionPayload | undefined,
  query: z.infer<typeof analyticsQuerySchema>,
  options: { advanced?: boolean } = {},
) {
  const user = await requireAccessUser(session);
  const timeZone = await venueTimezone(user.venueId);
  const { range } = await resolveAnalyticsRange(user.venueId, query, options);
  const currentStart = range.from;
  const currentEnd = range.to;
  const effectiveMs = Math.max(currentEnd.getTime() - currentStart.getTime(), 24 * 60 * 60 * 1000);
  const effectiveDays = Math.max(1, Math.ceil(effectiveMs / (24 * 60 * 60 * 1000)));
  const previousStart = new Date(currentStart.getTime() - effectiveMs);
  const branches = await analyticsBranches(session, user, query.branchId);
  const branchIds = branches.map((branch) => branch.id);
  const events = await analyticsEvents({
    venueId: user.venueId,
    branchIds,
    from: previousStart,
    to: currentEnd,
  });
  const summary = buildAnalyticsSummarySections({
    events,
    branches,
    currentStart,
    currentEnd,
    effectiveDays,
    period: query.period,
    hasCustomRange: Boolean(query.from || query.to),
    timeZone,
    dayKey,
  });

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
    ...summary,
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
