/**
 * PowerReader - User Error Message Utility
 *
 * Maps HTTP status codes, error types, and network errors
 * to user-friendly i18n strings.
 *
 * CRITICAL: Never expose internal error details to the user.
 * All errors go through this utility before display.
 */

import { t } from '$lib/i18n/zh-TW.js';
import type { ApiError } from '$lib/types/api.js';

type ErrorInput = ApiError | Error | null | undefined;

/**
 * HTTP status code to i18n key mapping.
 */
const STATUS_MAP: Record<number, string> = {
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
 */
const TYPE_MAP: Record<string, string> = {
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
 */
export function getUserErrorMessage(error: ErrorInput): string {
  if (!error) return t('error.message.generic');

  // Check by error type first (more specific)
  if ('type' in error && (error as ApiError).type && TYPE_MAP[(error as ApiError).type]) {
    return t(TYPE_MAP[(error as ApiError).type]);
  }

  // Check by HTTP status code
  if ('status' in error && (error as ApiError).status && STATUS_MAP[(error as ApiError).status!]) {
    return t(STATUS_MAP[(error as ApiError).status!]);
  }

  // Detect network errors from native Error objects
  if (error instanceof TypeError && !navigator.onLine) {
    return t('error.network.offline');
  }

  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return t('error.network.timeout');
  }

  if (error instanceof Error && error.name === 'QuotaExceededError') {
    return t('error.storage.full');
  }

  // Fallback: generic error (never show raw message)
  return t('error.message.generic');
}
