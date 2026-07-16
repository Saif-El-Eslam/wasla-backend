import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

export const requestContextMiddleware: RequestHandler = (req, res, next) => {
  const suppliedRequestId = req.header('x-request-id');
  const requestId =
    suppliedRequestId && /^[a-zA-Z0-9._:-]{1,128}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};
