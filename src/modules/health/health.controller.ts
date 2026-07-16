import type { RequestHandler } from 'express';
import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { prisma } from '../../database/prisma';

export const getHealth: RequestHandler = (_req, res) => {
  ok(res, {
    status: 'ok',
    service: 'wasla-backend',
    timestamp: new Date().toISOString(),
  });
};

export const getReadiness = asyncHandler(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  ok(res, {
    status: 'ready',
    service: 'wasla-backend',
    timestamp: new Date().toISOString(),
  });
});
