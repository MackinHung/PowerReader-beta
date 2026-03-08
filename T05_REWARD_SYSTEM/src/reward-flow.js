/**
 * T05 - Reward Flow Orchestration
 *
 * Business logic for processing analysis rewards and failures.
 * Coordinates calculation, cooldown, and repository modules.
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 * @module T05/reward-flow
 */

import {
  POINTS_PER_VALID_ANALYSIS_CENTS,
  DAILY_ANALYSIS_LIMIT,
  MAX_ANALYSIS_TIME_MS,
  addPoints,
  incrementDailyCount,
  getTodayDateString,
} from './calculation.js';

import {
  checkCooldown,
  clearExpiredCooldown,
  recordFailure,
} from './cooldown.js';

/**
 * Process a valid analysis submission: anti-gaming checks + point award.
 *
 * @param {Object} repo
 * @param {string} userHash
 * @param {string} articleId
 * @param {string} contentHash
 * @param {number} timeSpentMs
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, record?: Object, error?: string, code?: number }>}
 */
export async function processAnalysisReward(repo, userHash, articleId, contentHash, timeSpentMs, options = {}) {
  const {
    dailyLimit = DAILY_ANALYSIS_LIMIT,
    minTimeMs = 5000,
    maxTimeMs = MAX_ANALYSIS_TIME_MS,
    failureThreshold = 3,
    cooldownSeconds = 3600,
    now = new Date().toISOString(),
  } = options;

  const todayDate = getTodayDateString(now);

  let record = await repo.ensureUser(userHash, todayDate, now);
  record = clearExpiredCooldown(record, now);

  // Prerequisite: Cooldown check
  const cooldownStatus = checkCooldown(record, now);
  if (cooldownStatus.inCooldown) {
    return {
      success: false,
      error: `冷卻中，請等待 ${Math.ceil(cooldownStatus.remainingMs / 1000)} 秒後再試`,
      code: 429,
    };
  }

  // Pre-Check A: Daily limit
  const isNewDay = record.daily_analysis_date !== todayDate;
  const currentDailyCount = isNewDay ? 0 : record.daily_analysis_count;

  if (currentDailyCount >= dailyLimit) {
    return { success: false, error: "今日分析額度已用完，明天再來", code: 429 };
  }

  // Pre-Check B: Analysis time bounds
  if (timeSpentMs < minTimeMs) {
    return { success: false, error: "分析時間過短", code: 400 };
  }
  if (timeSpentMs > maxTimeMs) {
    return { success: false, error: "分析時間異常", code: 400 };
  }

  // Pre-Check C: Article deduplication
  if (await repo.hasArticleDuplicate(userHash, articleId)) {
    console.warn(`article_duplicate_rejected: user=${userHash.slice(0, 8)}, articleId=${articleId.slice(0, 8)}`);
    return { success: false, error: "已分析過此文章", code: 409 };
  }

  // Pre-Check D: Content-hash deduplication
  if (await repo.hasContentDuplicate(userHash, contentHash)) {
    console.warn(`content_duplicate_rejected: user=${userHash.slice(0, 8)}, contentHash=${contentHash.slice(0, 8)}`);
    return { success: false, error: "您已分析過相同內容的文章", code: 409 };
  }

  // Award points
  record = incrementDailyCount(record, todayDate, now);
  record = addPoints(record, POINTS_PER_VALID_ANALYSIS_CENTS, now);

  await repo.persistReward(record, articleId, contentHash, now);

  return { success: true, record };
}

/**
 * Process a failed analysis submission.
 *
 * @param {Object} repo
 * @param {string} userHash
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, record: Object, cooldownTriggered: boolean }>}
 */
export async function processAnalysisFailure(repo, userHash, options = {}) {
  const {
    failureThreshold = 3,
    cooldownSeconds = 3600,
    now = new Date().toISOString(),
  } = options;

  const todayDate = getTodayDateString(now);
  let record = await repo.ensureUser(userHash, todayDate, now);
  record = clearExpiredCooldown(record, now);
  record = recordFailure(record, failureThreshold, cooldownSeconds, now);

  await repo.updateUser(record);

  return {
    success: true,
    record,
    cooldownTriggered: record.cooldown_until !== null,
  };
}
