import type { RequestHandler } from 'express';
import { ok } from '../../common/http/response';

export const getHealth: RequestHandler = (_req, res) => {
  ok(res, {
    status: 'ok',
    service: 'wasla-backend',
    timestamp: new Date().toISOString(),
  });
};
