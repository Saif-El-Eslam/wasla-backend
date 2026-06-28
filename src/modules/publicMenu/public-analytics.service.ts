import { AnalyticsEventType, type Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { z } from 'zod';
import type { publicAnalyticsEventSchema } from './public.schemas';

function analyticsCounterUpdate(eventType: AnalyticsEventType) {
  if (eventType === AnalyticsEventType.MENU_VIEW) {
    return { viewCount: { increment: 1 } } satisfies Prisma.MenuAnalyticsUpdateInput;
  }

  if (eventType === AnalyticsEventType.QR_SCAN) {
    return { qrScanCount: { increment: 1 } } satisfies Prisma.MenuAnalyticsUpdateInput;
  }

  if (eventType === AnalyticsEventType.WHATSAPP_CLICK) {
    return { whatsappClicks: { increment: 1 } } satisfies Prisma.MenuAnalyticsUpdateInput;
  }

  if (eventType === AnalyticsEventType.CALL_CLICK) {
    return { callClicks: { increment: 1 } } satisfies Prisma.MenuAnalyticsUpdateInput;
  }

  if (eventType === AnalyticsEventType.MAPS_CLICK) {
    return { mapsClicks: { increment: 1 } } satisfies Prisma.MenuAnalyticsUpdateInput;
  }

  return null;
}

function analyticsCounterCreate(menuId: string, eventType: AnalyticsEventType) {
  return {
    menuId,
    viewCount: eventType === AnalyticsEventType.MENU_VIEW ? 1 : 0,
    qrScanCount: eventType === AnalyticsEventType.QR_SCAN ? 1 : 0,
    whatsappClicks: eventType === AnalyticsEventType.WHATSAPP_CLICK ? 1 : 0,
    callClicks: eventType === AnalyticsEventType.CALL_CLICK ? 1 : 0,
    mapsClicks: eventType === AnalyticsEventType.MAPS_CLICK ? 1 : 0,
  };
}

export async function recordPublicAnalytics(input: z.infer<typeof publicAnalyticsEventSchema>) {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: input.venueId },
      select: { id: true },
    });

    if (!venue) {
      return { tracked: false };
    }

    const branch = input.branchId
      ? await prisma.branch.findFirst({
          where: { id: input.branchId, venueId: input.venueId, active: true },
          select: { id: true },
        })
      : await prisma.branch.findFirst({
          where: { venueId: input.venueId, active: true },
          orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
          select: { id: true },
        });

    if (!branch) {
      return { tracked: false };
    }

    const menu = input.menuId
      ? await prisma.menu.findFirst({
          where: { id: input.menuId, branchId: branch.id },
          select: { id: true },
        })
      : await prisma.menu.findUnique({
          where: { branchId: branch.id },
          select: { id: true },
        });

    const counterUpdate = menu?.id ? analyticsCounterUpdate(input.eventType) : null;
    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.analyticsEventLog.create({
        data: {
          venueId: input.venueId,
          branchId: branch.id,
          menuId: menu?.id ?? null,
          categoryId: input.categoryId ?? null,
          itemId: input.itemId ?? null,
          eventType: input.eventType,
        },
      }),
    ];

    if (menu?.id && counterUpdate) {
      writes.push(
        prisma.menuAnalytics.upsert({
          where: { menuId: menu.id },
          create: analyticsCounterCreate(menu.id, input.eventType),
          update: counterUpdate,
        }),
      );
    }

    await prisma.$transaction(writes);
    return { tracked: true };
  } catch (error) {
    console.warn('[analytics] public event skipped', error);
    return { tracked: false };
  }
}
