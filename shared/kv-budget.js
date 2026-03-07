/**
 * PowerReader - KV Write Budget Middleware
 *
 * Tracks and enforces daily KV write limits per team.
 * Cloudflare free tier: 1000 writes/day total.
 * Budget allocation defined in shared/config.js KV_WRITE_BUDGET.
 *
 * Usage (Cloudflare Workers):
 *   import { createKvBudgetTracker } from '../shared/kv-budget.js';
 *   const budget = createKvBudgetTracker(env.KV_CONFIG);
 *   const allowed = await budget.canWrite('T02_CRAWLER', 5);
 *   if (allowed) {
 *     await budget.recordWrites('T02_CRAWLER', 5);
 *     // ... perform KV writes ...
 *   }
 *
 * Navigation:
 * - Upstream: shared/config.js (KV_WRITE_BUDGET, CLOUDFLARE.KV_DAILY_WRITE_LIMIT)
 * - Downstream: T01 (API middleware), T02, T03, T05, T07
 * - Maintainer: T01 (System Architecture Team)
 * - Last Updated: 2026-03-07
 *
 * Change Log:
 * | Date       | Version | Changes                     | Reason                |
 * |------------|---------|----------------------------|-----------------------|
 * | 2026-03-07 | v1.0    | Initial KV budget tracker  | Phase 2 shared libs   |
 */

import { KV_WRITE_BUDGET, CLOUDFLARE } from './config.js';
import { nowISO, formatDate } from './utils.js';

/**
 * Get today's date key for budget tracking (YYYY-MM-DD in Asia/Taipei).
 * @returns {string}
 */
function getTodayKey() {
  return formatDate(nowISO());
}

/**
 * Create a KV budget tracker bound to a specific KV namespace.
 *
 * @param {object} kvNamespace - Cloudflare KV namespace binding (env.KV_CONFIG)
 * @returns {object} Budget tracker with canWrite, recordWrites, getUsage methods
 */
export function createKvBudgetTracker(kvNamespace) {
  const KV_BUDGET_KEY_PREFIX = 'config:kv_budget:';

  /**
   * Read current daily usage from KV.
   * @param {string} dateKey - YYYY-MM-DD
   * @returns {Promise<object>} Usage counts per team
   */
  async function readDailyUsage(dateKey) {
    const key = `${KV_BUDGET_KEY_PREFIX}${dateKey}`;
    const raw = await kvNamespace.get(key, { type: 'json' });
    return raw || {};
  }

  /**
   * Write daily usage to KV.
   * @param {string} dateKey - YYYY-MM-DD
   * @param {object} usage - Usage counts per team
   */
  async function writeDailyUsage(dateKey, usage) {
    const key = `${KV_BUDGET_KEY_PREFIX}${dateKey}`;
    await kvNamespace.put(key, JSON.stringify({
      ...usage,
      last_updated: nowISO()
    }), {
      expirationTtl: 86400 // 24 hours
    });
  }

  return {
    /**
     * Check if a team can perform N KV writes within their budget.
     * @param {string} teamKey - KV_WRITE_BUDGET key (e.g., 'T02_CRAWLER')
     * @param {number} writeCount - Number of writes planned
     * @returns {Promise<boolean>}
     */
    async canWrite(teamKey, writeCount) {
      const budget = KV_WRITE_BUDGET[teamKey];
      if (budget === undefined) return false;

      const dateKey = getTodayKey();
      const usage = await readDailyUsage(dateKey);
      const currentUsage = usage[teamKey] || 0;

      return (currentUsage + writeCount) <= budget;
    },

    /**
     * Record completed KV writes for a team.
     * @param {string} teamKey - KV_WRITE_BUDGET key
     * @param {number} writeCount - Number of writes completed
     * @returns {Promise<object>} Updated usage for the team
     */
    async recordWrites(teamKey, writeCount) {
      const dateKey = getTodayKey();
      const usage = await readDailyUsage(dateKey);
      const currentUsage = usage[teamKey] || 0;
      const newUsage = currentUsage + writeCount;

      const updatedUsage = {
        ...usage,
        [teamKey]: newUsage
      };
      await writeDailyUsage(dateKey, updatedUsage);

      return { team: teamKey, used: newUsage, budget: KV_WRITE_BUDGET[teamKey] };
    },

    /**
     * Get full daily usage report for all teams.
     * @returns {Promise<object>} Usage report with per-team and total stats
     */
    async getUsage() {
      const dateKey = getTodayKey();
      const usage = await readDailyUsage(dateKey);

      const report = {};
      let totalUsed = 0;

      for (const [teamKey, budget] of Object.entries(KV_WRITE_BUDGET)) {
        const used = usage[teamKey] || 0;
        totalUsed += used;
        report[teamKey] = {
          used,
          budget,
          remaining: Math.max(0, budget - used),
          pct: budget > 0 ? ((used / budget) * 100).toFixed(1) : '0.0'
        };
      }

      return {
        date: dateKey,
        teams: report,
        total: {
          used: totalUsed,
          limit: CLOUDFLARE.KV_DAILY_WRITE_LIMIT,
          remaining: Math.max(0, CLOUDFLARE.KV_DAILY_WRITE_LIMIT - totalUsed),
          pct: ((totalUsed / CLOUDFLARE.KV_DAILY_WRITE_LIMIT) * 100).toFixed(1)
        },
        last_updated: usage.last_updated || null
      };
    }
  };
}

export default { createKvBudgetTracker };
