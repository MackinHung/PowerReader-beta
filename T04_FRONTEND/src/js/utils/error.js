/**
 * PowerReader - User Error Message Utility
 *
 * Maps HTTP status codes, error types, and network errors
 * to user-friendly i18n strings.
 *
 * CRITICAL: Never expose internal error details to the user.
 * All errors go through this utility before display.
 */

import { t } from '../../locale/zh-TW.js';

/**
 * HTTP status code to i18n key mapping.
 * @type {Record<number, string>}
 */
const STATUS_MAP = {
  400: 'error.message.validation',
  401: 'error.message.unauthorized',
  403: 'error.message.unauthorized',
  404: 'error.message.not_found',
  429: 'error.message.rate_limit',
  500: 'error.message.generic',
  502: 'error.message.generic',
  503: 'error.message.generic'
};

/**
 * Error type string to i18n key mapping.
 * @type {Record<string, string>}
 */
const TYPE_MAP = {
  // Network
  'network': 'error.network.offline',
  'timeout': 'error.network.timeout',
  'offline': 'error.network.offline',
  // Storage
  'storage_full': 'error.storage.full',
  'storage_denied': 'error.storage.denied',
  // Model / inference
  'model_not_found': 'error.model.not_downloaded',
  'model_load_failed': 'error.model.load_failed',
  'inference_failed': 'error.model.inference_failed',
  'webgpu_unsupported': 'error.webgpu.not_supported',
  'wasm_unsupported': 'error.wasm.not_supported',
  // Sync
  'sync_max_retries': 'error.sync.max_retries',
  'article_not_cached': 'error.article.not_cached',
  // Quality gate failures (from T03)
  'failed_format': 'quality.failed_format',
  'failed_range': 'quality.failed_range',
  'failed_consistency': 'quality.failed_consistency',
  'failed_duplicate': 'quality.failed_duplicate'
};

/**
 * Get a user-friendly error message from an error object.
 *
 * @param {Object} error - Error info (from API response or caught exception)
 * @param {number} [error.status] - HTTP status code
 * @param {string} [error.type] - Error type string
 * @param {string} [error.message] - Raw error message (NOT shown to user)
 * @returns {string} Translated user-facing error message
 */
export function getUserErrorMessage(error) {
  if (!error) return t('error.message.generic');

  // Check by error type first (more specific)
  if (error.type && TYPE_MAP[error.type]) {
    return t(TYPE_MAP[error.type]);
  }

  // Check by HTTP status code
  if (error.status && STATUS_MAP[error.status]) {
    return t(STATUS_MAP[error.status]);
  }

  // Detect network errors from native Error objects
  if (error instanceof TypeError && !navigator.onLine) {
    return t('error.network.offline');
  }

  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return t('error.network.timeout');
  }

  if (error.name === 'QuotaExceededError') {
    return t('error.storage.full');
  }

  // Fallback: generic error (never show raw message)
  return t('error.message.generic');
}
