import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../http/http-error';

export const errorMiddleware: ErrorRequestHandler = (error, req, res, _next) => {
  const statusCode =
    error instanceof HttpError ? error.statusCode : error instanceof ZodError ? 400 : 500;

  const message =
    error instanceof ZodError
      ? (req.t?.('errors.validationFailed') ?? 'Validation failed')
      : error instanceof HttpError
        ? (req.t?.(error.messageKey, error.interpolation) ?? error.messageKey)
        : (req.t?.('errors.internal') ?? 'Internal server error');

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
