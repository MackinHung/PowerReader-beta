/**
 * PowerReader - State Machine Validation (Pre-deploy CI Check)
 *
 * Validates ARTICLE_STATUS state machine integrity before deployment.
 * Referenced by: .github/workflows/deploy.yml (line 42), package.json (validate script)
 * Usage: node scripts/validate-state-machine.js
 *
 * Navigation:
 * - Upstream: shared/enums.js (ARTICLE_STATUS, ARTICLE_STATUS_TRANSITIONS, canTransitionStatus)
 * - Downstream: T07 CI/CD pipeline
 * - Maintainer: T07 (Deployment & Monitoring Team)
 * - Last Updated: 2026-03-07
 */

import {
  ARTICLE_STATUS,
  ARTICLE_STATUS_TRANSITIONS,
  canTransitionStatus
} from '../shared/enums.js';

const errors = [];
const allStates = new Set(Object.values(ARTICLE_STATUS));
const terminalStates = new Set(['published', 'rejected', 'duplicate']);

// --- 1. Every ARTICLE_STATUS value has an entry in ARTICLE_STATUS_TRANSITIONS ---
for (const state of allStates) {
  if (!(state in ARTICLE_STATUS_TRANSITIONS)) {
    errors.push(`Missing transitions entry for state: "${state}"`);
  }
}

// --- 2. No ARTICLE_STATUS_TRANSITIONS key references a nonexistent state ---
for (const key of Object.keys(ARTICLE_STATUS_TRANSITIONS)) {
  if (!allStates.has(key)) {
    errors.push(`Transitions key "${key}" is not a valid ARTICLE_STATUS value`);
  }
}

// --- 3. All transition targets exist in ARTICLE_STATUS ---
for (const [from, targets] of Object.entries(ARTICLE_STATUS_TRANSITIONS)) {
  for (const target of targets) {
    if (!allStates.has(target)) {
      errors.push(`Transition target "${target}" (from "${from}") is not a valid state`);
    }
  }
}

// --- 4. Terminal states have empty transition arrays ---
for (const state of terminalStates) {
  const transitions = ARTICLE_STATUS_TRANSITIONS[state];
  if (!Array.isArray(transitions) || transitions.length !== 0) {
    errors.push(`Terminal state "${state}" must have empty transitions, got: [${transitions}]`);
  }
}

// --- 5. No cycles: crawled should not be reachable from itself ---
function findReachable(startState) {
  const visited = new Set();
  const queue = [startState];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of (ARTICLE_STATUS_TRANSITIONS[current] || [])) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

const reachableFromCrawled = findReachable(ARTICLE_STATUS.CRAWLED);
if (reachableFromCrawled.has(ARTICLE_STATUS.CRAWLED)) {
  errors.push(`Cycle detected: "${ARTICLE_STATUS.CRAWLED}" is reachable from itself`);
}

// --- 6. canTransitionStatus() correctness ---
const validTransitions = [
  [ARTICLE_STATUS.CRAWLED, ARTICLE_STATUS.FILTERED],
  [ARTICLE_STATUS.ANALYZED, ARTICLE_STATUS.VALIDATED],
  [ARTICLE_STATUS.VALIDATED, ARTICLE_STATUS.PUBLISHED],
];
const invalidTransitions = [
  [ARTICLE_STATUS.PUBLISHED, ARTICLE_STATUS.CRAWLED],
  [ARTICLE_STATUS.REJECTED, ARTICLE_STATUS.ANALYZED],
  [ARTICLE_STATUS.DUPLICATE, ARTICLE_STATUS.FILTERED],
];

for (const [from, to] of validTransitions) {
  if (!canTransitionStatus(from, to)) {
    errors.push(`canTransitionStatus("${from}", "${to}") should be true but returned false`);
  }
}
for (const [from, to] of invalidTransitions) {
  if (canTransitionStatus(from, to)) {
    errors.push(`canTransitionStatus("${from}", "${to}") should be false but returned true`);
  }
}

// --- 7. Reachable path from CRAWLED to PUBLISHED ---
if (!reachableFromCrawled.has(ARTICLE_STATUS.PUBLISHED)) {
  errors.push(`No reachable path from "${ARTICLE_STATUS.CRAWLED}" to "${ARTICLE_STATUS.PUBLISHED}"`);
}

// --- Result ---
if (errors.length > 0) {
  console.error(`State machine validation FAILED (${errors.length} error(s)):\n`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
} else {
  console.log('\u2705 State machine validation passed');
  process.exit(0);
}
