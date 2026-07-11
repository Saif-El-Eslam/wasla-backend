import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { HttpError } from '../../common/http/http-error';
import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { env } from '../../config/env';
import { runExtractionMaintenance } from './extraction.service';

function validCronAuthorization(value: string | undefined) {
  if (!env.CRON_SECRET || !value) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const actual = Buffer.from(value);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const extractionMaintenanceRouter = Router();

extractionMaintenanceRouter.get(
  '/extractions/maintenance',
  asyncHandler(async (req, res) => {
    if (!validCronAuthorization(req.header('authorization'))) {
      throw new HttpError(401, 'errors.authRequired');
    }

    ok(res, await runExtractionMaintenance());
  }),
);
