/**
 * Pre-deploy Enum Validation
 * Validates shared/enums.js structural integrity before deployment.
 *
 * Usage: node scripts/validate-enums.js
 * Referenced by: .github/workflows/deploy.yml (line 40), package.json (validate script)
 *
 * Navigation:
 * - Upstream: shared/enums.js (SSOT), .github/workflows/deploy.yml
 * - Downstream: CI/CD pipeline gate
 * - Maintainer: T07 (Deployment & Monitoring Team)
 * - Last Updated: 2026-03-07
 */

import {
  NEWS_SOURCES, ARTICLE_STATUS, BIAS_CATEGORIES, CONTROVERSY_LEVELS,
  ARTICLE_TYPES, QUALITY_GATE_RESULTS, USER_ROLES, REWARD_STATUS,
  PLATFORMS, NOTIFICATION_TYPES, ERROR_TYPES, NEWS_CATEGORIES,
  KNOWLEDGE_CATEGORIES, THEME_COLORS,
  canTransitionStatus, getBiasCategory, getControversyLevel,
  getArticleType, getUserErrorMessage, isValidNewsSource,
  isValidArticleStatus, validateEnum
} from '../shared/enums.js';

const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

// ── 1. All top-level enum objects exist ──────────────────────────────
const REQUIRED_ENUMS = {
  NEWS_SOURCES, ARTICLE_STATUS, BIAS_CATEGORIES, CONTROVERSY_LEVELS,
  ARTICLE_TYPES, QUALITY_GATE_RESULTS, USER_ROLES, REWARD_STATUS,
  PLATFORMS, NOTIFICATION_TYPES, ERROR_TYPES, NEWS_CATEGORIES,
  KNOWLEDGE_CATEGORIES, THEME_COLORS
};

for (const [name, obj] of Object.entries(REQUIRED_ENUMS)) {
  check(obj != null && typeof obj === 'object', `${name} must exist and be an object`);
}

// ── 2. No empty string values ───────────────────────────────────────
for (const [name, obj] of Object.entries(REQUIRED_ENUMS)) {
  if (obj == null) continue;
  for (const [key, val] of Object.entries(obj)) {
    check(val !== '', `${name}.${key} must not be an empty string`);
  }
}

// ── 3. No duplicate values within the same enum ─────────────────────
for (const [name, obj] of Object.entries(REQUIRED_ENUMS)) {
  if (obj == null) continue;
  const values = Object.values(obj);
  const unique = new Set(values);
  check(values.length === unique.size, `${name} has duplicate values (${values.length} total, ${unique.size} unique)`);
}

// ── 4. ARTICLE_STATUS required states ───────────────────────────────
const REQUIRED_STATES = [
  'crawled', 'filtered', 'deduplicated', 'analyzed',
  'validated', 'published', 'rejected', 'duplicate'
];

if (ARTICLE_STATUS != null) {
  const statusValues = Object.values(ARTICLE_STATUS);
  for (const state of REQUIRED_STATES) {
    check(statusValues.includes(state), `ARTICLE_STATUS missing required state: "${state}"`);
  }
}

// ── 5. NEWS_SOURCES has at least 10 entries ─────────────────────────
if (NEWS_SOURCES != null) {
  const count = Object.keys(NEWS_SOURCES).length;
  check(count >= 10, `NEWS_SOURCES must have >= 10 entries (got ${count})`);
}

// ── 6. Validation functions exist and are callable ──────────────────
const REQUIRED_FUNCTIONS = {
  canTransitionStatus, getBiasCategory, getControversyLevel,
  getArticleType, getUserErrorMessage, isValidNewsSource,
  isValidArticleStatus, validateEnum
};

for (const [name, fn] of Object.entries(REQUIRED_FUNCTIONS)) {
  check(typeof fn === 'function', `${name} must be a callable function`);
}

// ── Result ──────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error(`Enum validation failed with ${errors.length} error(s):\n`);
  for (const msg of errors) console.error(`  - ${msg}`);
  process.exit(1);
} else {
  console.log('\u2705 Enum validation passed');
  process.exit(0);
}
