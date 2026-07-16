import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../http/http-error';

export const errorMiddleware: ErrorRequestHandler = (error, req, res, _next) => {
  const isUniqueConflict =
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  const statusCode =
    error instanceof HttpError
      ? error.statusCode
      : error instanceof ZodError
        ? 400
        : isUniqueConflict
          ? 409
          : 500;

  const message =
    error instanceof ZodError
      ? (req.t?.('errors.validationFailed') ?? 'Validation failed')
      : error instanceof HttpError
        ? (req.t?.(error.messageKey, error.interpolation) ?? error.messageKey)
        : isUniqueConflict
          ? (req.t?.('errors.validationFailed') ?? 'The requested value is already in use')
          : (req.t?.('errors.internal') ?? 'Internal server error');

  if (statusCode >= 500) {
    console.error(`[http:error] requestId=${req.requestId ?? '-'} path=${req.originalUrl}`, error);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      statusCode,
      message,
      details: error instanceof ZodError ? error.flatten() : undefined,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    },
  });
};
