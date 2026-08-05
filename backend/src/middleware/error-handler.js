import { ZodError } from "zod";

import { isProduction } from "../config/env.js";

// Every error response in this API has the shape { error: { code, message, details? } }.

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

// Express identifies an error handler by its arity — `next` must stay declared
// even though it is unused, or Express treats this as ordinary middleware.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  const status = err.status ?? err.statusCode ?? 500;

  // Never leak internal failure detail (driver errors, connection strings) to a
  // client in production; log it server-side instead.
  if (status >= 500) {
    console.error("[error]", err);
  }

  const message =
    status >= 500 && isProduction
      ? "Something went wrong"
      : err.message || "Something went wrong";

  res.status(status).json({
    error: {
      code: err.code ?? (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR"),
      message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}
