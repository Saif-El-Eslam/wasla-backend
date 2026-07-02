import { ExtractionJobStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { requireBranchAccess } from '../../common/auth/branch-access';
import { HttpError } from '../../common/http/http-error';
import { translate } from '../../common/i18n/i18n';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { env } from '../../config/env';
import {
  assertBranchMutationAllowed,
  assertExtractionAllowed,
  getExtractionAllowance,
} from '../subscription/plan-guards';
import { parseMenuImages } from './gemini-menu-parser.service';
import type {
  approveExtractionSchema,
  ExtractedCategory,
  ExtractedItem,
  ExtractedMenu,
  rejectExtractionSchema,
} from './extracted-menu.schema';
import type { z } from 'zod';

type UploadedImage = {
  buffer: Buffer;
  mimeType: string;
};

const menuInclude = Prisma.validator<Prisma.MenuInclude>()({
  qrCode: true,
  analytics: true,
  categories: {
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: {
          prices: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  },
});

type MenuWithContent = Prisma.MenuGetPayload<{ include: typeof menuInclude }>;

function normalizeText(value: unknown) {
  if (!value || typeof value !== 'object') {
    return '';
  }

  return Object.values(value as Record<string, unknown>)
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .join('|');
}

function nonEmptyLocalized(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.values(value as Record<string, unknown>).some(
    (item) => typeof item === 'string' && item.trim().length > 0,
  );
}

function jsonOrUndefined(value: unknown) {
  return nonEmptyLocalized(value) ? (value as Prisma.InputJsonValue) : undefined;
}

function normalizeImageUrl(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return value === '' ? null : value;
}

function priceRowsForItem(item: ExtractedItem) {
  const rawRows =
    item.prices?.map((price, sortOrder) => ({
      label: price.label,
      price: new Prisma.Decimal(price.price),
      sortOrder: price.sortOrder ?? sortOrder,
    })) ??
    (item.price !== undefined
      ? [
          {
            label: 'Regular',
            price: new Prisma.Decimal(item.price),
            sortOrder: 0,
          },
        ]
      : []);

  const labelCounts = new Map<string, number>();

  return rawRows.slice(0, 5).map((row) => {
    const baseLabel = row.label.trim() || 'Regular';
    const normalizedLabel = baseLabel.toLowerCase();
    const seenCount = labelCounts.get(normalizedLabel) ?? 0;

    labelCounts.set(normalizedLabel, seenCount + 1);

    return {
      ...row,
      label: seenCount === 0 ? baseLabel : `${baseLabel} ${seenCount + 1}`,
    };
  });
}

async function ensureBranchMenu(branchId: string, _branchName: Prisma.JsonValue) {
  const existingMenu = await prisma.menu.findUnique({
    where: { branchId },
    include: menuInclude,
  });

  if (existingMenu) {
    return existingMenu;
  }

  const shortCode = crypto.randomUUID().slice(0, 8);

  return prisma.menu.create({
    data: {
      branchId,
      theme: 'MODERN',
      showPrices: true,
      qrCode: {
        create: {
          shortCode,
          targetUrl: `/public/m/${shortCode}`,
        },
      },
      analytics: {
        create: {},
      },
    },
    include: menuInclude,
  });
}

function compactJob(job: Prisma.ExtractionJobGetPayload<object>) {
  return job;
}

async function requireJobForBranch(
  session: SessionPayload | undefined,
  branchId: string,
  jobId: string,
) {
  const { user } = await requireBranchAccess(session, branchId);
  const job = await prisma.extractionJob.findFirst({
    where: {
      id: jobId,
      branchId,
      venueId: user.venueId,
    },
  });

  if (!job) {
    throw new HttpError(404, 'errors.extractionJobNotFound');
  }

  return { user, job };
}

async function processExtractionJob(jobId: string, images: UploadedImage[]) {
  await prisma.extractionJob.update({
    where: { id: jobId },
    data: { status: ExtractionJobStatus.PROCESSING, errors: [] },
  });

  try {
    const parsed = await parseMenuImages(images);

    await prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: ExtractionJobStatus.COMPLETED,
        extractedMenu: parsed.extractedMenu as Prisma.InputJsonValue,
        confidenceScore: parsed.confidenceScore,
        rawModelResponse: parsed.rawModelResponse,
        warnings: parsed.warnings,
        errors: [],
      },
    });
  } catch (error) {
    const errorText =
      error instanceof HttpError
        ? translate('en', error.messageKey, error.interpolation)
        : error instanceof Error
          ? error.message
          : 'Extraction failed';

    await prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: ExtractionJobStatus.FAILED,
        errors: [errorText],
      },
    });
  }
}

export async function startExtractionJob(
  session: SessionPayload | undefined,
  branchId: string,
  images: UploadedImage[],
) {
  const { user, branch } = await requireBranchAccess(session, branchId);

  if (images.length === 0) {
    throw new HttpError(400, 'errors.extractionImagesRequired');
  }

  await assertBranchMutationAllowed(user.venueId, branchId);
  await assertExtractionAllowed(user.venueId, images.length);
  const menu = await ensureBranchMenu(branchId, branch.name);
  const job = await prisma.extractionJob.create({
    data: {
      menuId: menu.id,
      branchId,
      venueId: user.venueId,
      requestedById: user.id,
      status: ExtractionJobStatus.PENDING,
      modelName: env.GEMINI_MODEL,
      imageCount: images.length,
    },
  });

  void processExtractionJob(job.id, images);

  return {
    job: compactJob(job),
    limits: await getExtractionAllowance(user.venueId),
    menu,
  };
}

export async function retryExtractionJob(
  session: SessionPayload | undefined,
  branchId: string,
  jobId: string,
  images: UploadedImage[],
) {
  const { job } = await requireJobForBranch(session, branchId, jobId);

  if (job.status !== ExtractionJobStatus.FAILED && job.status !== ExtractionJobStatus.REJECTED) {
    throw new HttpError(409, 'errors.extractionRetryNotAllowed');
  }

  return startExtractionJob(session, branchId, images);
}

export async function getLatestExtractionJob(
  session: SessionPayload | undefined,
  branchId: string,
) {
  const { user } = await requireBranchAccess(session, branchId);
  const job = await prisma.extractionJob.findFirst({
    where: { branchId, venueId: user.venueId },
    orderBy: { createdAt: 'desc' },
  });

  return {
    job,
    limits: await getExtractionAllowance(user.venueId),
  };
}

export async function getExtractionJob(
  session: SessionPayload | undefined,
  branchId: string,
  jobId: string,
) {
  const { user, job } = await requireJobForBranch(session, branchId, jobId);

  return {
    job,
    limits: await getExtractionAllowance(user.venueId),
  };
}

function categoryMatch(menu: MenuWithContent, category: ExtractedCategory) {
  if (category.id) {
    const byId = menu.categories.find((item) => item.id === category.id);

    if (byId) {
      return byId;
    }
  }

  const normalizedName = normalizeText(category.name);

  return menu.categories.find((item) => normalizeText(item.name) === normalizedName);
}

function itemMatch(category: MenuWithContent['categories'][number], item: ExtractedItem) {
  if (item.id) {
    const byId = category.items.find((existing) => existing.id === item.id);

    if (byId) {
      return byId;
    }
  }

  const normalizedName = normalizeText(item.name);

  return category.items.find((existing) => normalizeText(existing.name) === normalizedName);
}

async function upsertExtractedItems(
  tx: Prisma.TransactionClient,
  category: MenuWithContent['categories'][number],
  extractedItems: ExtractedItem[],
) {
  for (const [index, item] of extractedItems.entries()) {
    const matchedItem = itemMatch(category, item);
    const rows = priceRowsForItem(item);
    const baseData = {
      name: jsonOrUndefined(item.name),
      description: jsonOrUndefined(item.description),
      imageUrl: normalizeImageUrl(item.imageUrl),
      tags:
        item.tags.length > 0
          ? Array.from(new Set([...(matchedItem?.tags ?? []), ...item.tags]))
          : undefined,
      calories: item.calories,
      available: item.available,
      sortOrder: item.sortOrder ?? matchedItem?.sortOrder ?? category.items.length + index,
    };

    if (matchedItem) {
      await tx.menuItem.update({
        where: { id: matchedItem.id },
        data: {
          ...baseData,
          prices:
            rows.length > 0
              ? {
                  deleteMany: {},
                  create: rows,
                }
              : undefined,
          price: item.price === undefined ? undefined : new Prisma.Decimal(item.price),
        },
      });
      continue;
    }

    await tx.menuItem.create({
      data: {
        categoryId: category.id,
        name: item.name as Prisma.InputJsonValue,
        description: jsonOrUndefined(item.description),
        imageUrl: normalizeImageUrl(item.imageUrl),
        tags: item.tags,
        calories: item.calories,
        available: item.available,
        sortOrder: item.sortOrder ?? category.items.length + index,
        price: item.price === undefined ? undefined : new Prisma.Decimal(item.price),
        prices: rows.length > 0 ? { create: rows } : undefined,
      },
    });
  }
}

async function applyExtractionToMenu(menu: MenuWithContent, extractedMenu: ExtractedMenu) {
  await prisma.$transaction(
    async (tx) => {
      await tx.menu.update({
        where: { id: menu.id },
        data: {
          theme: extractedMenu.menu.theme,
          showPrices: extractedMenu.menu.showPrices,
        },
      });

      for (const [index, category] of extractedMenu.categories.entries()) {
        const matchedCategory = categoryMatch(menu, category);
        const categoryData = {
          name: jsonOrUndefined(category.name),
          description: jsonOrUndefined(category.description),
          imageUrl: normalizeImageUrl(category.imageUrl),
          active: category.active,
          sortOrder:
            category.sortOrder ?? matchedCategory?.sortOrder ?? menu.categories.length + index,
        };

        if (matchedCategory) {
          await tx.menuCategory.update({
            where: { id: matchedCategory.id },
            data: categoryData,
          });
          await upsertExtractedItems(tx, matchedCategory, category.items);
          continue;
        }

        const createdCategory = await tx.menuCategory.create({
          data: {
            menuId: menu.id,
            name: category.name as Prisma.InputJsonValue,
            description: jsonOrUndefined(category.description),
            imageUrl: normalizeImageUrl(category.imageUrl),
            active: category.active,
            sortOrder: category.sortOrder ?? menu.categories.length + index,
          },
          include: {
            items: {
              include: {
                prices: true,
              },
            },
          },
        });
        await upsertExtractedItems(tx, createdCategory, category.items);
      }
    },
    { timeout: 30000 },
  );

  return prisma.menu.findUniqueOrThrow({
    where: { id: menu.id },
    include: menuInclude,
  });
}

export async function approveExtractionJob(
  session: SessionPayload | undefined,
  branchId: string,
  jobId: string,
  input: z.infer<typeof approveExtractionSchema>,
) {
  const { user, job } = await requireJobForBranch(session, branchId, jobId);

  if (job.status !== ExtractionJobStatus.COMPLETED) {
    throw new HttpError(409, 'errors.extractionApproveNotAllowed');
  }

  await assertBranchMutationAllowed(user.venueId, branchId);
  const extractedMenu = input.extractedMenu ?? (job.extractedMenu as ExtractedMenu | null);

  if (!extractedMenu) {
    throw new HttpError(400, 'errors.extractionMissingResult');
  }

  const menu = await prisma.menu.findUnique({
    where: { id: job.menuId },
    include: menuInclude,
  });

  if (!menu || menu.branchId !== branchId) {
    throw new HttpError(404, 'errors.menuNotFound');
  }

  let updatedMenu: MenuWithContent;

  try {
    updatedMenu = await applyExtractionToMenu(menu, extractedMenu);
  } catch {
    throw new HttpError(400, 'errors.extractionApplyFailed');
  }

  const approvedJob = await prisma.extractionJob.update({
    where: { id: jobId },
    data: {
      status: ExtractionJobStatus.APPROVED,
      extractedMenu: extractedMenu as Prisma.InputJsonValue,
      approvedAt: new Date(),
      errors: [],
    },
  });

  return {
    job: approvedJob,
    menu: updatedMenu,
  };
}

export async function rejectExtractionJob(
  session: SessionPayload | undefined,
  branchId: string,
  jobId: string,
  input: z.infer<typeof rejectExtractionSchema>,
) {
  const { job } = await requireJobForBranch(session, branchId, jobId);

  if (job.status !== ExtractionJobStatus.COMPLETED && job.status !== ExtractionJobStatus.FAILED) {
    throw new HttpError(409, 'errors.extractionRejectNotAllowed');
  }

  const rejectedJob = await prisma.extractionJob.update({
    where: { id: job.id },
    data: {
      status: ExtractionJobStatus.REJECTED,
      rejectedAt: new Date(),
      errors: input.reason ? [input.reason] : job.errors,
    },
  });

  return { job: rejectedJob };
}
