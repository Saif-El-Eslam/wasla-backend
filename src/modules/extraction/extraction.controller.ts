import type { Request } from 'express';
import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { HttpError } from '../../common/http/http-error';
import { translate } from '../../common/i18n/i18n';
import {
  approveExtractionJob,
  getExtractionJob,
  getLatestExtractionJob,
  rejectExtractionJob,
  retryExtractionJob,
  startExtractionJob,
} from './extraction.service';

function requestImages(req: Request) {
  const files = Array.isArray(req.files) ? req.files : [];

  if (files.length === 0) {
    throw new HttpError(400, 'errors.extractionImagesRequired');
  }

  return files.map((file) => ({
    buffer: file.buffer,
    mimeType: file.mimetype,
  }));
}

function localizeJobErrors<T>(value: T, locale?: string): T {
  const localizeJob = (job: { errors?: string[] } | null | undefined) => {
    if (!job?.errors) {
      return job;
    }

    return {
      ...job,
      errors: job.errors.map((error) =>
        error.startsWith('errors.') ? translate(locale, error) : error,
      ),
    };
  };

  if (!value || typeof value !== 'object') {
    return value;
  }

  const payload = value as { job?: { errors?: string[] } | null };

  if (!('job' in payload)) {
    return value;
  }

  return {
    ...payload,
    job: localizeJob(payload.job),
  } as T;
}

export const startExtractionController = asyncHandler(async (req, res) => {
  const result = await startExtractionJob(
    req.user,
    String(req.params.branchId),
    requestImages(req),
  );
  ok(res, localizeJobErrors(result, req.locale), 202);
});

export const retryExtractionController = asyncHandler(async (req, res) => {
  const result = await retryExtractionJob(
    req.user,
    String(req.params.branchId),
    String(req.params.jobId),
  );
  ok(res, localizeJobErrors(result, req.locale), 202);
});

export const getLatestExtractionController = asyncHandler(async (req, res) => {
  const result = await getLatestExtractionJob(req.user, String(req.params.branchId));
  ok(res, localizeJobErrors(result, req.locale));
});

export const getExtractionController = asyncHandler(async (req, res) => {
  const result = await getExtractionJob(
    req.user,
    String(req.params.branchId),
    String(req.params.jobId),
  );
  ok(res, localizeJobErrors(result, req.locale));
});

export const approveExtractionController = asyncHandler(async (req, res) => {
  const result = await approveExtractionJob(
    req.user,
    String(req.params.branchId),
    String(req.params.jobId),
    req.body,
  );
  ok(res, localizeJobErrors(result, req.locale));
});

export const rejectExtractionController = asyncHandler(async (req, res) => {
  const result = await rejectExtractionJob(
    req.user,
    String(req.params.branchId),
    String(req.params.jobId),
    req.body,
  );
  ok(res, localizeJobErrors(result, req.locale));
});
