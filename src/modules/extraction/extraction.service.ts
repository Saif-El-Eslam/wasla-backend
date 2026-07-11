import { ExtractionJobStatus, Prisma } from '@prisma/client';
import { waitUntil } from '@vercel/functions';
import { prisma } from '../../database/prisma';
import { requireBranchAccess } from '../../common/auth/branch-access';
import { HttpError } from '../../common/http/http-error';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { env } from '../../config/env';
import {
  assertBranchMutationAllowed,
  assertExtractionAllowed,
  getExtractionAllowance,
} from '../subscription/plan-guards';
import { parseMenuImages, prepareMenuImages } from './gemini-menu-parser.service';
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

const ACTIVE_EXTRACTION_STATUSES = [
  ExtractionJobStatus.PENDING,
  ExtractionJobStatus.PROCESSING,
] as const;

const menuInclude = Prisma.validator<Prisma.MenuInclude>()({
  qrCode: true,
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
    },
    include: menuInclude,
  });
}

function compactJob(job: Prisma.ExtractionJobGetPayload<object>) {
  return job;
}

function extractionTimedOutError() {
  return new HttpError(504, 'errors.extractionTimedOut');
}

function extractionErrorText(error: unknown) {
  return error instanceof HttpError
    ? error.messageKey
    : error instanceof Error
      ? error.message
      : 'Extraction failed';
}

function isRetryableExtractionError(error: unknown) {
  if (error instanceof HttpError) {
    return error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500;
  }

  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    return status === 408 || status === 429 || status >= 500;
  }

  // Network errors and invalid model output are safe to replay from the saved input.
  return true;
}

function staleExtractionCutoff() {
  const staleAfterMs = Math.max(
    env.EXTRACTION_STALE_JOB_AFTER_MS,
    env.GEMINI_EXTRACTION_TIMEOUT_MS + 30_000,
  );

  return new Date(Date.now() - staleAfterMs);
}

function retryAt(attemptCount: number) {
  const exponentialDelay = env.EXTRACTION_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attemptCount - 1);
  const jitter = Math.floor(Math.random() * env.EXTRACTION_RETRY_BASE_DELAY_MS);

  return new Date(Date.now() + exponentialDelay + jitter);
}

function manualRetryExpiresAt() {
  return new Date(Date.now() + env.EXTRACTION_MANUAL_RETRY_WINDOW_MS);
}

function terminalPayloadCleanup() {
  return {
    rawModelResponse: null,
    extractedMenu: Prisma.DbNull,
    confidenceScore: null,
    providerResponseId: null,
    warnings: [],
  } satisfies Prisma.ExtractionJobUpdateManyMutationInput;
}

export async function cleanupExpiredExtractionJobs(now = new Date()) {
  const purgeableJobs: Prisma.ExtractionJobWhereInput = {
    cleanedUpAt: null,
    OR: [
      { status: ExtractionJobStatus.APPROVED },
      {
        status: { in: [ExtractionJobStatus.FAILED, ExtractionJobStatus.REJECTED] },
        retryExpiresAt: { lte: now },
      },
    ],
  };

  const [images, jobs] = await prisma.$transaction([
    prisma.extractionJobImage.deleteMany({
      where: { job: { is: purgeableJobs } },
    }),
    prisma.extractionJob.updateMany({
      where: purgeableJobs,
      data: {
        ...terminalPayloadCleanup(),
        cleanedUpAt: now,
      },
    }),
  ]);

  return { jobs: jobs.count, images: images.count };
}

async function parseMenuImagesWithTimeout(jobId: string, images: UploadedImage[]) {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(extractionTimedOutError());
    }, env.GEMINI_EXTRACTION_TIMEOUT_MS);
    timeout.unref?.();
  });

  try {
    return await Promise.race([
      parseMenuImages(images, { jobId, signal: controller.signal, prepared: true }),
      timeoutPromise,
    ]);
  } catch (error) {
    if (controller.signal.aborted) {
      throw extractionTimedOutError();
    }

    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function failExtractionJob(jobId: string, errorText: string) {
  await prisma.extractionJob.updateMany({
    where: { id: jobId, status: ExtractionJobStatus.PROCESSING },
    data: {
      status: ExtractionJobStatus.FAILED,
      retryExpiresAt: manualRetryExpiresAt(),
      cleanedUpAt: null,
      ...terminalPayloadCleanup(),
      errors: [errorText],
    },
  });
}

async function rescheduleExtractionJob(
  job: { id: string; attemptCount: number; maxAttempts: number },
  error: unknown,
) {
  const errorText = extractionErrorText(error);
  const canRetry = isRetryableExtractionError(error) && job.attemptCount < job.maxAttempts;

  if (!canRetry) {
    await failExtractionJob(job.id, errorText);
    return;
  }

  await prisma.extractionJob.updateMany({
    where: { id: job.id, status: ExtractionJobStatus.PROCESSING },
    data: {
      status: ExtractionJobStatus.PENDING,
      nextAttemptAt: retryAt(job.attemptCount),
      errors: [errorText],
    },
  });

  console.warn(
    `[extraction] Retrying jobId=${job.id} attempt=${job.attemptCount + 1}/${job.maxAttempts}`,
  );
}

async function claimNextExtractionJob() {
  while (true) {
    const candidate = await prisma.extractionJob.findFirst({
      where: {
        status: ExtractionJobStatus.PENDING,
        nextAttemptAt: { lte: new Date() },
        inputImages: { some: {} },
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    if (!candidate) {
      return null;
    }

    const claimed = await prisma.extractionJob.updateMany({
      where: {
        id: candidate.id,
        status: ExtractionJobStatus.PENDING,
        nextAttemptAt: { lte: new Date() },
      },
      data: {
        status: ExtractionJobStatus.PROCESSING,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        errors: [],
      },
    });

    if (claimed.count > 0) {
      return candidate.id;
    }
  }
}

async function processClaimedExtractionJob(jobId: string) {
  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    include: { inputImages: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!job || job.status !== ExtractionJobStatus.PROCESSING) {
    return;
  }

  if (job.inputImages.length === 0) {
    await failExtractionJob(job.id, 'errors.extractionInputsMissing');
    return;
  }

  try {
    const parsed = await parseMenuImagesWithTimeout(
      job.id,
      job.inputImages.map((image) => ({
        buffer: Buffer.from(image.data),
        mimeType: image.mimeType,
      })),
    );

    await prisma.extractionJob.updateMany({
      where: { id: job.id, status: ExtractionJobStatus.PROCESSING },
      data: {
        status: ExtractionJobStatus.COMPLETED,
        extractedMenu: parsed.extractedMenu as Prisma.InputJsonValue,
        confidenceScore: parsed.confidenceScore,
        rawModelResponse: parsed.rawModelResponse,
        providerResponseId: parsed.providerResponseId,
        warnings: parsed.warnings,
        retryExpiresAt: null,
        cleanedUpAt: null,
        errors: [],
      },
    });
  } catch (error) {
    await rescheduleExtractionJob(job, error);
  }
}

type QueueDrainResult = {
  processedJobs: number;
};

let drainPromise: Promise<QueueDrainResult> | null = null;

function triggerExtractionQueue(maxJobs = Number.POSITIVE_INFINITY) {
  if (drainPromise) {
    return drainPromise;
  }

  drainPromise = (async () => {
    let processedJobs = 0;

    while (processedJobs < maxJobs) {
      const jobId = await claimNextExtractionJob();

      if (!jobId) {
        break;
      }

      await processClaimedExtractionJob(jobId);
      processedJobs += 1;
    }

    return { processedJobs };
  })()
    .catch((error) => {
      console.error('[extraction] Queue drain failed', error);
      return { processedJobs: 0 };
    })
    .finally(() => {
      drainPromise = null;
    });

  return drainPromise;
}

function scheduleExtractionQueue() {
  const isVercel = Boolean(process.env.VERCEL);
  const maxJobs = isVercel ? env.EXTRACTION_MAINTENANCE_MAX_JOBS : Number.POSITIVE_INFINITY;
  const queueWork = triggerExtractionQueue(maxJobs);

  if (isVercel) {
    waitUntil(Promise.all([queueWork, cleanupExpiredExtractionJobs()]));
    return;
  }

  void queueWork;
}
export async function failStaleExtractionJobs(
  where: { venueId?: string; branchId?: string; jobId?: string } = {},
) {
  const scope = {
    id: where.jobId,
    venueId: where.venueId,
    branchId: where.branchId,
  };

  const [requeued, exhausted, missingInputs] = await prisma.$transaction([
    prisma.extractionJob.updateMany({
      where: {
        ...scope,
        status: ExtractionJobStatus.PROCESSING,
        updatedAt: { lt: staleExtractionCutoff() },
        attemptCount: { lt: env.EXTRACTION_MAX_ATTEMPTS },
        inputImages: { some: {} },
      },
      data: {
        status: ExtractionJobStatus.PENDING,
        nextAttemptAt: new Date(),
        errors: ['errors.extractionInterrupted'],
      },
    }),
    prisma.extractionJob.updateMany({
      where: {
        ...scope,
        status: ExtractionJobStatus.PROCESSING,
        updatedAt: { lt: staleExtractionCutoff() },
        attemptCount: { gte: env.EXTRACTION_MAX_ATTEMPTS },
      },
      data: {
        status: ExtractionJobStatus.FAILED,
        retryExpiresAt: manualRetryExpiresAt(),
        cleanedUpAt: null,
        ...terminalPayloadCleanup(),
        errors: ['errors.extractionTimedOut'],
      },
    }),
    prisma.extractionJob.updateMany({
      where: {
        ...scope,
        status: { in: [...ACTIVE_EXTRACTION_STATUSES] },
        updatedAt: { lt: staleExtractionCutoff() },
        inputImages: { none: {} },
      },
      data: {
        status: ExtractionJobStatus.FAILED,
        retryExpiresAt: new Date(),
        cleanedUpAt: new Date(),
        ...terminalPayloadCleanup(),
        errors: ['errors.extractionInputsMissing'],
      },
    }),
  ]);

  return { requeued: requeued.count, failed: exhausted.count + missingInputs.count };
}

export async function runExtractionMaintenance() {
  const recovery = await failStaleExtractionJobs();
  const cleanup = await cleanupExpiredExtractionJobs();
  const queue = await triggerExtractionQueue(env.EXTRACTION_MAINTENANCE_MAX_JOBS);

  return { recovery, cleanup, queue };
}

export function startExtractionJobMaintenance() {
  let stopped = false;

  const recoverAndDrain = async () => {
    if (stopped) {
      return;
    }

    await failStaleExtractionJobs();
    await triggerExtractionQueue();
  };

  void Promise.all([recoverAndDrain(), cleanupExpiredExtractionJobs()]).catch((error) => {
    console.error('[extraction] Failed to start extraction maintenance', error);
  });

  const workerInterval = setInterval(() => {
    void triggerExtractionQueue();
  }, env.EXTRACTION_WORKER_INTERVAL_MS);
  workerInterval.unref?.();

  const staleInterval = setInterval(() => {
    void recoverAndDrain().catch((error) => {
      console.error('[extraction] Failed to recover stale extraction jobs', error);
    });
  }, env.EXTRACTION_STALE_SWEEP_INTERVAL_MS);
  staleInterval.unref?.();

  const cleanupInterval = setInterval(() => {
    void cleanupExpiredExtractionJobs().catch((error) => {
      console.error('[extraction] Failed to clean extraction job payloads', error);
    });
  }, env.EXTRACTION_CLEANUP_INTERVAL_MS);
  cleanupInterval.unref?.();

  return () => {
    stopped = true;
    clearInterval(workerInterval);
    clearInterval(staleInterval);
    clearInterval(cleanupInterval);
  };
}
async function requireJobForBranch(
  session: SessionPayload | undefined,
  branchId: string,
  jobId: string,
) {
  const { user } = await requireBranchAccess(session, branchId);
  await failStaleExtractionJobs({ venueId: user.venueId, branchId, jobId });
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

export async function startExtractionJob(
  session: SessionPayload | undefined,
  branchId: string,
  images: UploadedImage[],
) {
  const { user, branch } = await requireBranchAccess(session, branchId);
  if (images.length === 0) {
    throw new HttpError(400, 'errors.extractionImagesRequired');
  }

  await failStaleExtractionJobs({ venueId: user.venueId });
  await assertBranchMutationAllowed(user.venueId, branchId);
  await assertExtractionAllowed(user.venueId, images.length);

  // Persist compressed inputs before returning 202, so a crash cannot lose the request.
  const preparedImages = await prepareMenuImages(images);
  const menu = await ensureBranchMenu(branchId, branch.name);
  const job = await prisma.extractionJob.create({
    data: {
      menuId: menu.id,
      branchId,
      venueId: user.venueId,
      requestedById: user.id,
      status: ExtractionJobStatus.PENDING,
      modelName: env.GEMINI_MODEL,
      imageCount: preparedImages.length,
      maxAttempts: env.EXTRACTION_MAX_ATTEMPTS,
      inputImages: {
        create: preparedImages.map((image, sortOrder) => ({
          sortOrder,
          mimeType: image.mimeType,
          data: Uint8Array.from(image.buffer),
        })),
      },
    },
  });

  scheduleExtractionQueue();

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
) {
  const { user, job } = await requireJobForBranch(session, branchId, jobId);

  if (job.status !== ExtractionJobStatus.FAILED && job.status !== ExtractionJobStatus.REJECTED) {
    throw new HttpError(409, 'errors.extractionRetryNotAllowed');
  }

  if (!job.retryExpiresAt || job.retryExpiresAt.getTime() <= Date.now()) {
    await cleanupExpiredExtractionJobs();
    throw new HttpError(409, 'errors.extractionRetryExpired');
  }

  const retried = await prisma.$transaction(async (tx) => {
    const inputCount = await tx.extractionJobImage.count({ where: { jobId: job.id } });

    if (inputCount === 0) {
      throw new HttpError(409, 'errors.extractionInputsMissing');
    }

    const reset = await tx.extractionJob.updateMany({
      where: {
        id: job.id,
        status: { in: [ExtractionJobStatus.FAILED, ExtractionJobStatus.REJECTED] },
        retryExpiresAt: { gt: new Date() },
        cleanedUpAt: null,
        inputImages: { some: {} },
      },
      data: {
        status: ExtractionJobStatus.PENDING,
        attemptCount: 0,
        maxAttempts: env.EXTRACTION_MAX_ATTEMPTS,
        nextAttemptAt: new Date(),
        lastAttemptAt: null,
        rawModelResponse: null,
        providerResponseId: null,
        extractedMenu: Prisma.DbNull,
        confidenceScore: null,
        warnings: [],
        retryExpiresAt: null,
        cleanedUpAt: null,
        errors: [],
        approvedAt: null,
        rejectedAt: null,
      },
    });

    if (reset.count === 0) {
      throw new HttpError(409, 'errors.extractionRetryExpired');
    }

    return tx.extractionJob.findUniqueOrThrow({ where: { id: job.id } });
  });
  const menu = await prisma.menu.findUniqueOrThrow({
    where: { id: job.menuId },
    include: menuInclude,
  });

  scheduleExtractionQueue();

  return {
    job: retried,
    limits: await getExtractionAllowance(user.venueId),
    menu,
  };
}

export async function getLatestExtractionJob(
  session: SessionPayload | undefined,
  branchId: string,
) {
  const { user } = await requireBranchAccess(session, branchId);
  await failStaleExtractionJobs({ venueId: user.venueId, branchId });
  scheduleExtractionQueue();
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
  scheduleExtractionQueue();

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

  const [approvedJob] = await prisma.$transaction([
    prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: ExtractionJobStatus.APPROVED,
        approvedAt: new Date(),
        retryExpiresAt: null,
        cleanedUpAt: new Date(),
        ...terminalPayloadCleanup(),
        errors: [],
      },
    }),
    prisma.extractionJobImage.deleteMany({ where: { jobId } }),
  ]);

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
      retryExpiresAt: manualRetryExpiresAt(),
      cleanedUpAt: null,
      ...terminalPayloadCleanup(),
      errors: input.reason ? [input.reason] : job.errors,
    },
  });

  return { job: rejectedJob };
}
