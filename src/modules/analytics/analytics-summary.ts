import { AnalyticsEventType } from '@prisma/client';

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

export type MetricKey = keyof typeof metricEventMap;

export type AnalyticsSummaryEvent = {
  eventType: AnalyticsEventType;
  createdAt: Date;
  branchId: string;
  itemId: string | null;
  item: { name: unknown } | null;
};

export type AnalyticsSummaryBranch = {
  id: string;
  name: unknown;
  slug: string;
};

const metricKeyByEvent = new Map<AnalyticsEventType, MetricKey>(
  (Object.entries(metricEventMap) as Array<[MetricKey, AnalyticsEventType]>).map(([key, eventType]) => [
    eventType,
    key,
  ]),
);

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function emptyMetricCounts() {
  return Object.fromEntries(
    (Object.keys(metricEventMap) as MetricKey[]).map((key) => [key, { current: 0, previous: 0 }]),
  ) as Record<MetricKey, { current: number; previous: number }>;
}

function buildSeriesSeed(input: {
  currentEnd: Date;
  effectiveDays: number;
  period: string;
  hasCustomRange: boolean;
  timeZone: string;
  dayKey: (date: Date, timeZone: string) => string;
}) {
  return Array.from({ length: Math.min(input.effectiveDays, 14) }, (_, index) => {
    const date = new Date(input.currentEnd);
    date.setDate(input.currentEnd.getDate() - (Math.min(input.effectiveDays, 14) - index - 1));
    const key = input.dayKey(date, input.timeZone);

    return {
      key,
      label:
        input.period === '7d' && !input.hasCustomRange
          ? date.toLocaleDateString('en', { weekday: 'short', timeZone: input.timeZone })
          : key.slice(5),
      views: 0,
      scans: 0,
    };
  });
}

export function buildAnalyticsSummarySections(input: {
  events: AnalyticsSummaryEvent[];
  branches: AnalyticsSummaryBranch[];
  currentStart: Date;
  currentEnd: Date;
  effectiveDays: number;
  period: string;
  hasCustomRange: boolean;
  timeZone: string;
  dayKey: (date: Date, timeZone: string) => string;
}) {
  const metricCounts = emptyMetricCounts();
  const seriesSeed = buildSeriesSeed(input);
  const seriesByKey = new Map(seriesSeed.map((item) => [item.key, item]));
  const branchActivityCounts = new Map(input.branches.map((branch) => [branch.id, 0]));
  const itemViews: Record<string, { itemId: string; name: unknown; views: number }> = {};

  for (const event of input.events) {
    const metricKey = metricKeyByEvent.get(event.eventType);
    const isCurrent = event.createdAt >= input.currentStart && event.createdAt <= input.currentEnd;

    if (metricKey) {
      if (isCurrent) {
        metricCounts[metricKey].current += 1;
      } else if (event.createdAt < input.currentStart) {
        metricCounts[metricKey].previous += 1;
      }
    }

    const seriesPoint = seriesByKey.get(input.dayKey(event.createdAt, input.timeZone));

    if (seriesPoint?.key && event.eventType === AnalyticsEventType.MENU_VIEW) {
      seriesPoint.views += 1;
    }

    if (seriesPoint?.key && event.eventType === AnalyticsEventType.QR_SCAN) {
      seriesPoint.scans += 1;
    }

    if (!isCurrent) {
      continue;
    }

    branchActivityCounts.set(event.branchId, (branchActivityCounts.get(event.branchId) ?? 0) + 1);

    if (event.itemId && event.eventType === AnalyticsEventType.ITEM_VIEW) {
      itemViews[event.itemId] ??= { itemId: event.itemId, name: event.item?.name ?? null, views: 0 };
      itemViews[event.itemId].views += 1;
    }
  }

  const metrics = Object.fromEntries(
    (Object.keys(metricEventMap) as MetricKey[]).map((key) => {
      const counts = metricCounts[key];
      return [key, { ...counts, change: percentChange(counts.current, counts.previous) }];
    }),
  ) as Record<MetricKey, { current: number; previous: number; change: number }>;
  const series = seriesSeed.map(({ key: _key, ...item }) => item);
  const branchActivity = input.branches.map((branch) => ({
    branchId: branch.id,
    name: branch.name,
    slug: branch.slug,
    value: branchActivityCounts.get(branch.id) ?? 0,
  }));

  return {
    metrics,
    series,
    branchActivity,
    topItems: Object.values(itemViews)
      .sort((a, b) => b.views - a.views)
      .slice(0, 5),
  };
}
