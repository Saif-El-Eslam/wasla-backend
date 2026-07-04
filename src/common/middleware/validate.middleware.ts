import type { RequestHandler } from 'express';
import type { z } from 'zod';

type RequestSchema = Partial<{
  body: z.ZodType<unknown>;
  params: z.ZodType<unknown>;
  query: z.ZodType<unknown>;
}>;

// This middleware validates the request body, params, and query against the provided Zod schemas.
// If validation fails, it passes the error to the next middleware (typically an error handler).
export function validateRequest(schema: RequestSchema): RequestHandler {
  return (req, _res, next) => {
    try {
      const validated: Express.Request['validated'] = {};

      if (schema.body) {
        req.body = schema.body.parse(req.body);
        validated.body = req.body;
      }

      if (schema.params) {
        req.params = schema.params.parse(req.params) as typeof req.params;
        validated.params = req.params;
      }

      if (schema.query) {
        const parsedQuery = schema.query.parse(req.query);
        Object.assign(req.query, parsedQuery);
        validated.query = parsedQuery;
      }

      req.validated = { ...req.validated, ...validated };
      next();
    } catch (error) {
      next(error);
    }
  };
}
