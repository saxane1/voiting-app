// One definition of the API's error envelope: { error: { code, message, details? } }.
// Controllers should build failures through these rather than hand-rolling the
// shape, so a client can rely on it being identical everywhere.

export function validationError(res, zodError) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: zodError.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
  });
}

export function badRequest(res, message, code = "BAD_REQUEST") {
  return res.status(400).json({ error: { code, message } });
}

export function notFound(res, message, code = "NOT_FOUND") {
  return res.status(404).json({ error: { code, message } });
}

export function conflict(res, message, code = "CONFLICT") {
  return res.status(409).json({ error: { code, message } });
}
