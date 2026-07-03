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
   return (req, res, next) => {
    const validated: Express.Request['validated'] = {};

    if (schema.body) {
      const result = schema.body.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({ errors: result.error.flatten() });
      }

      validated.body = result.data;
    }

    if (schema.params) {
      const result = schema.params.safeParse(req.params);

      if (!result.success) {
        return res.status(400).json({ errors: result.error.flatten() });
      }

      validated.params = result.data;
    }

    if (schema.query) {
      const result = schema.query.safeParse(req.query);

      if (!result.success) {
        return res.status(400).json({ errors: result.error.flatten() });
      }

      validated.query = result.data;
    }

    req.validated = validated;

    next();
  
  };
}
