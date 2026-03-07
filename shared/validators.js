/**
 * PowerReader - Shared Validators
 *
 * Schema validation at API boundaries.
 * All functions are pure and return { valid, errors } objects.
 *
 * Navigation:
 * - Upstream: shared/config.js, shared/enums.js, shared/utils.js
 * - Downstream: T01 (API validation), T02 (article writes), T03 (analysis writes), T05 (points)
 * - Maintainer: T01 (System Architecture Team)
 * - Last Updated: 2026-03-07
 *
 * Change Log:
 * | Date       | Version | Changes                | Reason              |
 * |------------|---------|------------------------|---------------------|
 * | 2026-03-07 | v1.0    | Initial validators     | Phase 2 shared libs |
 */

import { ANALYSIS, CRAWLER } from './config.js';
import {
  ARTICLE_STATUS,
  KNOWLEDGE_CATEGORIES,
  isValidNewsSource,
  isValidArticleStatus,
  canTransitionStatus
} from './enums.js';
import { isValidISO8601, isNonEmptyString, isValidURL, isIntegerInRange } from './utils.js';

/**
 * Validate article input from Crawler API (POST /api/v1/articles)
 * @param {object} article - Crawler API output object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateArticle(article) {
  const errors = [];

  if (!isNonEmptyString(article.article_id)) errors.push('article_id is required');
  if (!isNonEmptyString(article.content_hash)) errors.push('content_hash is required');
  if (!isNonEmptyString(article.title)) errors.push('title is required');
  if (article.summary != null && typeof article.summary === 'string' && article.summary.length > 500) {
    errors.push('summary exceeds 500 chars');
  }
  if (!isNonEmptyString(article.content_markdown)) errors.push('content_markdown is required');
  if (!Number.isInteger(article.char_count) || article.char_count < 1) {
    errors.push('char_count must be integer >= 1');
  }
  if (!isValidNewsSource(article.source)) errors.push(`Invalid source: ${article.source}`);
  if (!isValidURL(article.primary_url)) errors.push('primary_url must be a valid URL');

  if (article.duplicate_urls != null) {
    if (!Array.isArray(article.duplicate_urls)) {
      errors.push('duplicate_urls must be an array');
    } else {
      article.duplicate_urls.forEach((u, i) => {
        if (!isValidURL(u)) errors.push(`duplicate_urls[${i}] is not a valid URL`);
      });
    }
  }

  if (!isValidISO8601(article.published_at)) errors.push('published_at must be ISO 8601 with timezone');
  if (!isValidISO8601(article.crawled_at)) errors.push('crawled_at must be ISO 8601 with timezone');

  if (typeof article.filter_score !== 'number' || article.filter_score < 0 || article.filter_score > 1) {
    errors.push('filter_score must be 0.0-1.0');
  }
  if (!isNonEmptyString(article.matched_topic)) errors.push('matched_topic is required');

  if (article.status != null) {
    if (!isValidArticleStatus(article.status)) {
      errors.push(`Invalid status: ${article.status}`);
    } else if (article.status !== ARTICLE_STATUS.FILTERED && article.status !== ARTICLE_STATUS.DEDUPLICATED) {
      errors.push('Crawler can only submit articles with status FILTERED or DEDUPLICATED');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate batch article submission (POST /api/v1/articles/batch)
 * @param {object} body - Request body with articles array
 * @returns {{ valid: boolean, errors: string[], articleErrors: Array }}
 */
export function validateArticleBatch(body) {
  const errors = [];

  if (!body || !Array.isArray(body.articles)) {
    return { valid: false, errors: ['articles must be an array'], articleErrors: [] };
  }
  if (body.articles.length === 0) {
    errors.push('articles array is empty');
  }
  if (body.articles.length > CRAWLER.MAX_ARTICLES_PER_RUN) {
    errors.push(`articles array exceeds max ${CRAWLER.MAX_ARTICLES_PER_RUN} items`);
  }

  const articleErrors = body.articles
    .map((a, i) => {
      const result = validateArticle(a);
      return result.valid ? null : { index: i, article_id: a.article_id, errors: result.errors };
    })
    .filter(Boolean);

  return {
    valid: errors.length === 0 && articleErrors.length === 0,
    errors,
    articleErrors
  };
}

/**
 * Validate analysis submission (POST /api/v1/articles/:id/analysis)
 * @param {object} analysis - Analysis result from Qwen
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAnalysis(analysis) {
  const errors = [];

  if (!isIntegerInRange(analysis.bias_score, ANALYSIS.BIAS_SCORE_MIN, ANALYSIS.BIAS_SCORE_MAX)) {
    errors.push(`bias_score must be integer ${ANALYSIS.BIAS_SCORE_MIN}-${ANALYSIS.BIAS_SCORE_MAX}`);
  }
  if (!isIntegerInRange(analysis.controversy_score, ANALYSIS.CONTROVERSY_MIN, ANALYSIS.CONTROVERSY_MAX)) {
    errors.push(`controversy_score must be integer ${ANALYSIS.CONTROVERSY_MIN}-${ANALYSIS.CONTROVERSY_MAX}`);
  }
  if (!isNonEmptyString(analysis.reasoning)) errors.push('reasoning is required');
  if (!Array.isArray(analysis.key_phrases) || analysis.key_phrases.length === 0) {
    errors.push('key_phrases must be a non-empty array');
  }
  if (!isNonEmptyString(analysis.prompt_version)) errors.push('prompt_version is required');
  if (!isNonEmptyString(analysis.user_hash)) errors.push('user_hash is required');

  return { valid: errors.length === 0, errors };
}

/**
 * Validate knowledge upsert (POST /api/v1/knowledge/upsert)
 * @param {object} entry - Knowledge base entry
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateKnowledge(entry) {
  const errors = [];
  const validTypes = Object.values(KNOWLEDGE_CATEGORIES);

  if (!isNonEmptyString(entry.id)) errors.push('id is required');
  if (!validTypes.includes(entry.type)) {
    errors.push(`type must be one of: ${validTypes.join(', ')}`);
  }
  if (!isNonEmptyString(entry.title)) errors.push('title is required');
  if (!isNonEmptyString(entry.content)) errors.push('content is required');

  return { valid: errors.length === 0, errors };
}

/**
 * Validate user points update (integer cents only!)
 * @param {number} pointsCents - Points in integer cents
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePointsUpdate(pointsCents) {
  if (!Number.isInteger(pointsCents)) {
    return { valid: false, errors: ['points must be integer cents'] };
  }
  if (pointsCents < 0) {
    return { valid: false, errors: ['points cannot be negative'] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate article status transition (state machine enforcement)
 * @param {string} currentStatus - Current ARTICLE_STATUS value
 * @param {string} targetStatus - Target ARTICLE_STATUS value
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateStatusTransition(currentStatus, targetStatus) {
  if (!isValidArticleStatus(currentStatus)) {
    return { valid: false, errors: [`Invalid current status: ${currentStatus}`] };
  }
  if (!isValidArticleStatus(targetStatus)) {
    return { valid: false, errors: [`Invalid target status: ${targetStatus}`] };
  }
  if (!canTransitionStatus(currentStatus, targetStatus)) {
    return { valid: false, errors: [`Cannot transition from ${currentStatus} to ${targetStatus}`] };
  }
  return { valid: true, errors: [] };
}

export default {
  validateArticle,
  validateArticleBatch,
  validateAnalysis,
  validateKnowledge,
  validatePointsUpdate,
  validateStatusTransition
};
