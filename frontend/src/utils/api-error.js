/**
 * Readers for the backend's error envelope: { error: { code, message, details? } }
 * (backend/src/utils/api-response.js). Every controller builds failures through
 * that shape, so these work across the whole API.
 */

export function apiErrorStatus(error) {
  return error?.response?.status ?? null;
}

export function apiErrorCode(error) {
  return error?.response?.data?.error?.code ?? null;
}

/**
 * The server's own message when there is one, otherwise the caller's fallback.
 * Server copy is preferred because it carries live values the client cannot know
 * (cooldown seconds, attempt caps).
 */
export function apiErrorMessage(error, fallback) {
  return error?.response?.data?.error?.message || fallback;
}

/** No response at all — offline, DNS failure, backend down, CORS rejection. */
export function isNetworkError(error) {
  return Boolean(error) && !error.response;
}
