/**
 * Knowledge Handlers — Barrel Re-export
 *
 * Split into:
 * - knowledge-read.js  — Public read endpoint (getArticleKnowledge)
 * - knowledge-admin.js — Admin CRUD endpoints (upsert, batch, search, list)
 *
 * This barrel file preserves the existing import path in router.js.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 *
 * Maintainer: T01 (System Architecture Team)
 */

export { getArticleKnowledge } from './knowledge-read.js';
export {
  upsertKnowledge,
  batchUpsertKnowledge,
  searchKnowledge,
  listKnowledge
} from './knowledge-admin.js';
