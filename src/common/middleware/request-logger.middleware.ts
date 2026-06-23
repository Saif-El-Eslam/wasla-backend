import type { RequestHandler } from 'express';

export const requestLoggerMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = performance.now();

  res.on('finish', () => {
    const durationMs = Math.round(performance.now() - startedAt);
    process.stdout.write(
      `[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms requestId=${req.requestId ?? '-'}\n`,
    );
  });

  next();
};
