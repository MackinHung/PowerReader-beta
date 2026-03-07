/**
 * PowerReader - Error Type Registry + Structured Error Handling
 *
 * All API errors go through this module to ensure:
 * 1. Internal details never leak to clients
 * 2. Consistent error response format
 * 3. Structured logging with context
 *
 * Navigation:
 * - Upstream: shared/enums.js (ERROR_TYPES, getUserErrorMessage)
 * - Downstream: T01 (API middleware), all teams
 * - Maintainer: T01 (System Architecture Team)
 * - Last Updated: 2026-03-07
 *
 * Change Log:
 * | Date       | Version | Changes                    | Reason              |
 * |------------|---------|---------------------------|---------------------|
 * | 2026-03-07 | v1.0    | Initial error module      | Phase 2 shared libs |
 */

import { ERROR_TYPES, getUserErrorMessage } from './enums.js';

// Re-export for convenience
export { ERROR_TYPES, getUserErrorMessage };

/**
 * HTTP status code mapping for error types.
 */
const ERROR_HTTP_STATUS = {
  [ERROR_TYPES.VALIDATION_ERROR]: 400,
  [ERROR_TYPES.UNAUTHORIZED]: 401,
  [ERROR_TYPES.NOT_FOUND]: 404,
  [ERROR_TYPES.RATE_LIMIT_EXCEEDED]: 429,
  [ERROR_TYPES.INTERNAL_ERROR]: 500,
  [ERROR_TYPES.DATABASE_ERROR]: 500,
  [ERROR_TYPES.API_ERROR]: 502,
  [ERROR_TYPES.MODEL_ERROR]: 503,
};

/**
 * Create a structured API error response (safe for client).
 * Lesson from OceanRAG: Never expose internal error details!
 *
 * @param {string} errorType - ERROR_TYPES value
 * @param {string} [requestId] - Request tracking ID
 * @param {object} [extra] - Extra safe fields (e.g., retry_after for rate limit)
 * @returns {{ status: number, body: object }}
 */
export function createErrorResponse(errorType, requestId, extra) {
  const status = ERROR_HTTP_STATUS[errorType] || 500;
  const message = getUserErrorMessage(errorType);

  const body = {
    success: false,
    data: null,
    error: {
      type: errorType,
      message,
      ...(requestId ? { request_id: requestId } : {}),
      ...(extra || {})
    }
  };

  return { status, body };
}

/**
 * Create a structured log entry for server-side error logging.
 * Contains full details — NEVER send to client.
 *
 * @param {string} errorType - ERROR_TYPES value
 * @param {Error|string} error - The original error
 * @param {object} [context] - Additional context (endpoint, user_hash, etc.)
 * @returns {object} Log entry object
 */
export function createErrorLog(errorType, error, context) {
  return {
    timestamp: new Date().toISOString(),
    error_type: errorType,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context: context || {}
  };
}

/**
 * Wrap an async handler to catch errors and return structured responses.
 * For use with Cloudflare Workers request handlers.
 *
 * @param {Function} handler - Async function (request, env, ctx) => Response
 * @returns {Function} Wrapped handler that catches errors
 */
export function withErrorHandling(handler) {
  return async (request, env, ctx) => {
    try {
      return await handler(request, env, ctx);
    } catch (err) {
      const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID();

      // Log full error server-side
      console.error(JSON.stringify(createErrorLog(
        ERROR_TYPES.INTERNAL_ERROR,
        err,
        { url: request.url, method: request.method, request_id: requestId }
      )));

      // Return safe error to client
      const { status, body } = createErrorResponse(
        ERROR_TYPES.INTERNAL_ERROR,
        requestId
      );

      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };
}

export default {
  ERROR_TYPES,
  getUserErrorMessage,
  createErrorResponse,
  createErrorLog,
  withErrorHandling
};
