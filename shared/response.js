/**
 * PowerReader - Shared Response Helpers
 *
 * Unified JSON response factory for all Workers handlers.
 * Replaces per-handler `jsonResponse()` duplicates.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 *
 * Navigation:
 * - Upstream: shared/errors.js (error-specific responses)
 * - Downstream: src/workers/handlers/*
 * - Maintainer: T01 (System Architecture Team)
 * - Last Updated: 2026-03-08
 */

/**
 * Create a JSON Response with proper Content-Type header.
 *
 * @param {number} status - HTTP status code
 * @param {object} body - Response body (will be JSON.stringify'd)
 * @param {object} [extraHeaders] - Additional headers to merge
 * @returns {Response} Cloudflare Workers Response
 */
export function jsonResponse(status, body, extraHeaders) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Shorthand: successful response with data.
 *
 * @param {object} data - Response data payload
 * @param {number} [status=200] - HTTP status code
 * @returns {Response}
 */
export function successResponse(data, status = 200) {
  return jsonResponse(status, { success: true, data, error: null });
}

/**
 * Shorthand: error response (safe for client).
 * For structured error handling, prefer shared/errors.js createErrorResponse.
 *
 * @param {number} status - HTTP status code
 * @param {string} type - Error type string
 * @param {string} message - User-facing error message
 * @param {object} [details] - Optional validation error details
 * @returns {Response}
 */
export function errorResponse(status, type, message, details) {
  const error = { type, message };
  if (details !== undefined) {
    error.details = details;
  }
  return jsonResponse(status, { success: false, data: null, error });
}

export default { jsonResponse, successResponse, errorResponse };
