/**
 * 🔖 PowerReader - Enumeration Definitions
 *
 * ⚠️ SINGLE SOURCE OF TRUTH (SSOT)
 * This file contains ALL enum-like values used across the system.
 * DO NOT hardcode enum values elsewhere - import from this file!
 *
 * Lesson from OceanRAG:
 * - All enum-like fields MUST be centrally managed
 * - Prevents inconsistencies between frontend, backend, and database
 * - Enables single-point refactoring
 *
 * 📍 Navigation:
 * - Upstream: CLAUDE.md, MASTER_ROADMAP.md, shared/config.js
 * - Downstream: All teams (T01-T07)
 * - Maintainer: T01 (System Architecture Team) + T02 (News Sources)
 * - Last Updated: 2026-03-07
 *
 * 📜 Change Log:
 * | Date       | Version | Changes                  | Reason           |
 * |------------|---------|--------------------------|------------------|
 * | 2025-03-06 | v1.0    | Initial enums            | Project kickoff  |
 * | 2026-03-07 | v2.0    | PowerReader: config boundaries, filtered status, knowledge categories | Architecture decisions #004-#010 |
 * | 2026-03-08 | v2.1    | +4 news sources (ETtoday, SETN, EBC, Newtalk) | Crawler expansion |
 * | 2026-03-10 | v3.1    | +5 news sources (鏡週刊, 匯流新聞, 台視, 中視, 華視) | Crawler expansion |
 * | 2026-03-08 | v3.0    | Three-Camp: CAMP_TYPES, getCampFromScore(), CAMP_COLORS, BLINDSPOT_TYPES, detectBlindspot(), SUBSCRIBER_TIERS, BADGE_TYPES, getWhiteAxisValue() | Decision #013-#016 |
 */

import { ANALYSIS, THREE_CAMP } from './config.js';

// =========================================
// 📰 News Sources (Taiwan Major Media)
// =========================================
// ⚠️ Maintained by: T02 (Data Acquisition Team)
// Add new sources here, then update T02_DATA_ACQUISITION/NEWS_SOURCES.md

export const NEWS_SOURCES = {
  // Traditional Pan-Green Media (傳統泛綠媒體)
  LIBERTY_TIMES: "自由時報",
  TAIWAN_APPLE_DAILY: "蘋果日報",  // ⚠️ DEPRECATED: Ceased 2021, historical data only, not crawled

  // Traditional Pan-Blue Media (傳統泛藍媒體)
  CHINA_TIMES: "中國時報",
  UNITED_DAILY_NEWS: "聯合報",

  // Neutral/Independent Media (中立/獨立媒體)
  COMMON_WEALTH: "天下雜誌",
  BUSINESS_WEEKLY: "商業週刊",
  THE_NEWS_LENS: "關鍵評論網",
  THE_REPORTER: "報導者",

  // Public Media (公共媒體)
  CNA: "中央社",         // Central News Agency
  PTS: "公視新聞",       // Public Television Service

  // Economic Media (財經媒體)
  ECONOMIC_DAILY_NEWS: "經濟日報",
  COMMERCIAL_TIMES: "工商時報",

  // Tech/New Media (科技/新媒體)
  INSIDE: "Inside",
  TECHNEWS: "科技新報",
  ITHOME: "iThome",

  // Investigative Journalism (調查報導)
  REW_CAUSAS: "新新聞",
  STORM_MEDIA: "風傳媒",

  // TV/Online Media (電視/網路媒體) — Added 2026-03-08
  ETTODAY: "ETtoday新聞雲",
  SETN: "三立新聞",
  EBC: "東森新聞",
  NEWTALK: "新頭殼",

  // Additional Sources — Added 2026-03-10
  MIRROR_MEDIA: "鏡週刊",
  CNEWS: "匯流新聞",
  TTV: "台視新聞",
  CTV: "中視新聞",
  CTS: "華視新聞"
};

// Create reverse mapping (value -> key)
export const NEWS_SOURCES_REVERSE = Object.fromEntries(
  Object.entries(NEWS_SOURCES).map(([key, value]) => [value, key])
);

// =========================================
// 📊 Article Status States
// =========================================
// Lesson from OceanRAG: Use state machine to prevent contradictory states
// State machine: crawled → filtered → deduplicated → analyzed → validated → published

export const ARTICLE_STATUS = {
  CRAWLED: "crawled",           // Just crawled, not processed yet
  FILTERED: "filtered",        // bge-small-zh topic filtering passed
  DEDUPLICATED: "deduplicated", // MinHash deduplication complete
  ANALYZED: "analyzed",         // Qwen analysis complete
  VALIDATED: "validated",       // Passed 4-layer quality gates
  PUBLISHED: "published",       // Published to users
  REJECTED: "rejected",         // Failed quality gates
  DUPLICATE: "duplicate"        // Marked as duplicate (similarity > 85%)
};

// State machine: Valid transitions
export const ARTICLE_STATUS_TRANSITIONS = {
  [ARTICLE_STATUS.CRAWLED]: [ARTICLE_STATUS.FILTERED, ARTICLE_STATUS.REJECTED],
  [ARTICLE_STATUS.FILTERED]: [ARTICLE_STATUS.DEDUPLICATED, ARTICLE_STATUS.REJECTED],
  [ARTICLE_STATUS.DEDUPLICATED]: [ARTICLE_STATUS.ANALYZED, ARTICLE_STATUS.DUPLICATE],
  [ARTICLE_STATUS.ANALYZED]: [ARTICLE_STATUS.VALIDATED, ARTICLE_STATUS.REJECTED],
  [ARTICLE_STATUS.VALIDATED]: [ARTICLE_STATUS.PUBLISHED],  // Auto-publish (Decision #003 Method A)
  [ARTICLE_STATUS.PUBLISHED]: [],  // Terminal state
  [ARTICLE_STATUS.REJECTED]: [],   // Terminal state
  [ARTICLE_STATUS.DUPLICATE]: []   // Terminal state
};

/**
 * Validate if status transition is allowed
 * Lesson from OceanRAG: Prevent contradictory states with state machine
 */
export function canTransitionStatus(from, to) {
  const allowedTransitions = ARTICLE_STATUS_TRANSITIONS[from] || [];
  return allowedTransitions.includes(to);
}

// =========================================
// 🎯 Bias Categories
// =========================================
export const BIAS_CATEGORIES = {
  EXTREME_LEFT: "extreme_left",       // Score < B1
  LEFT: "left",                       // Score B1-B2
  CENTER_LEFT: "center_left",         // Score B2-B3
  CENTER: "center",                   // Score B3-B4
  CENTER_RIGHT: "center_right",       // Score B4-B5
  RIGHT: "right",                     // Score B5-B6
  EXTREME_RIGHT: "extreme_right"      // Score > B6
};

/**
 * Get bias category from score
 * Boundaries from shared/config.js ANALYSIS.BIAS_BOUNDARIES
 */
export function getBiasCategory(score) {
  const [B1, B2, B3, B4, B5, B6] = ANALYSIS.BIAS_BOUNDARIES;
  if (score < B1) return BIAS_CATEGORIES.EXTREME_LEFT;
  if (score < B2) return BIAS_CATEGORIES.LEFT;
  if (score < B3) return BIAS_CATEGORIES.CENTER_LEFT;
  if (score <= B4) return BIAS_CATEGORIES.CENTER;
  if (score <= B5) return BIAS_CATEGORIES.CENTER_RIGHT;
  if (score <= B6) return BIAS_CATEGORIES.RIGHT;
  return BIAS_CATEGORIES.EXTREME_RIGHT;
}

// =========================================
// 🔥 Controversy Levels
// =========================================
export const CONTROVERSY_LEVELS = {
  NON_POLITICAL: "non_political",       // 0-20: 非政治或日常社會
  GENERAL_POLICY: "general_policy",     // 21-40: 一般政策
  PARTISAN_CLASH: "partisan_clash",     // 41-60: 政黨交鋒
  CORE_CONFLICT: "core_conflict",       // 61-80: 核心對立議題
  NATIONAL_SECURITY: "national_security" // 81-100: 國安外交重大爭議
};

/**
 * Get controversy level from score (5-level, aligned with prompt)
 * Boundaries from shared/config.js ANALYSIS.CONTROVERSY_BOUNDARIES [20, 40, 60, 80]
 */
export function getControversyLevel(score) {
  const [C1, C2, C3, C4] = ANALYSIS.CONTROVERSY_BOUNDARIES;
  if (score <= C1) return CONTROVERSY_LEVELS.NON_POLITICAL;
  if (score <= C2) return CONTROVERSY_LEVELS.GENERAL_POLICY;
  if (score <= C3) return CONTROVERSY_LEVELS.PARTISAN_CLASH;
  if (score <= C4) return CONTROVERSY_LEVELS.CORE_CONFLICT;
  return CONTROVERSY_LEVELS.NATIONAL_SECURITY;
}

// =========================================
// 📝 Article Types
// =========================================
export const ARTICLE_TYPES = {
  ORIGINAL: "original",          // Similarity < 30%
  DIFFERENT_ANGLE: "different_angle",  // Similarity 30-70%
  REWRITE: "rewrite",            // Similarity 70-85%
  DUPLICATE: "duplicate"         // Similarity > 85%
};

/**
 * Get article type from similarity score
 */
export function getArticleType(similarity) {
  if (similarity < 0.30) return ARTICLE_TYPES.ORIGINAL;
  if (similarity < 0.70) return ARTICLE_TYPES.DIFFERENT_ANGLE;
  if (similarity < 0.85) return ARTICLE_TYPES.REWRITE;
  return ARTICLE_TYPES.DUPLICATE;
}

// =========================================
// ✅ Quality Gate Results
// =========================================
export const QUALITY_GATE_RESULTS = {
  PASSED: "passed",              // All 4 layers passed
  FAILED_FORMAT: "failed_format",         // Layer 1: JSON format invalid
  FAILED_RANGE: "failed_range",           // Layer 2: Values out of range
  FAILED_CONSISTENCY: "failed_consistency", // Layer 3: Inconsistent with same author
  FAILED_DUPLICATE: "failed_duplicate",    // Layer 4: Duplicate submission
  PENDING: "pending"             // Not yet validated
};

// =========================================
// 👤 User Roles
// =========================================
export const USER_ROLES = {
  ANONYMOUS: "anonymous",        // Not logged in
  CONTRIBUTOR: "contributor",    // Logged in, can contribute analysis
  VERIFIED: "verified",          // Email verified
  ADMIN: "admin"                 // System administrator
};

// =========================================
// 💰 Reward Status
// =========================================
export const REWARD_STATUS = {
  PENDING: "pending",            // Analysis submitted, not yet validated
  EARNED: "earned",              // Passed validation, points earned
  REJECTED: "rejected",          // Failed validation
  CLAIMED: "claimed"             // Points claimed/used
};

// =========================================
// 📱 Platform Types
// =========================================
export const PLATFORMS = {
  WEB: "web",                    // PWA web app
  LINE_BOT: "line_bot",          // LINE Bot
  BROWSER_EXTENSION: "browser_extension",  // Chrome/Firefox extension
  EMAIL: "email",                // Email subscription
  API: "api"                     // Direct API access
};

// =========================================
// 🔔 Notification Types
// =========================================
export const NOTIFICATION_TYPES = {
  ANALYSIS_COMPLETE: "analysis_complete",
  REWARD_EARNED: "reward_earned",
  VOTE_RESULT: "vote_result",
  SYSTEM_UPDATE: "system_update",
  SECURITY_ALERT: "security_alert"
};

// =========================================
// 🚨 Error Types
// =========================================
// Lesson from OceanRAG: Never leak internal errors to users!
export const ERROR_TYPES = {
  // Client-facing errors (safe to show)
  VALIDATION_ERROR: "validation_error",
  NOT_FOUND: "not_found",
  RATE_LIMIT_EXCEEDED: "rate_limit_exceeded",
  UNAUTHORIZED: "unauthorized",

  // Server-side errors (log only, show generic message)
  INTERNAL_ERROR: "internal_error",
  DATABASE_ERROR: "database_error",
  API_ERROR: "api_error",
  MODEL_ERROR: "model_error"
};

/**
 * Get user-facing error message
 * Lesson from OceanRAG: Never expose internal details
 */
export function getUserErrorMessage(errorType) {
  const SAFE_MESSAGES = {
    [ERROR_TYPES.VALIDATION_ERROR]: "輸入資料格式錯誤,請檢查後重試",
    [ERROR_TYPES.NOT_FOUND]: "找不到請求的資源",
    [ERROR_TYPES.RATE_LIMIT_EXCEEDED]: "請求過於頻繁,請稍後再試",
    [ERROR_TYPES.UNAUTHORIZED]: "未授權,請先登入"
  };

  // For server-side errors, always return generic message
  return SAFE_MESSAGES[errorType] || "系統錯誤,請稍後再試";
}

// =========================================
// 📊 News Categories (Taiwan-specific)
// =========================================
export const NEWS_CATEGORIES = {
  POLITICS: "政治",
  ECONOMY: "經濟",
  SOCIETY: "社會",
  TECHNOLOGY: "科技",
  INTERNATIONAL: "國際",
  ENTERTAINMENT: "娛樂",
  SPORTS: "體育",
  HEALTH: "健康",
  EDUCATION: "教育",
  ENVIRONMENT: "環境"
};

// =========================================
// 📚 Knowledge Categories (RAG Layer 2)
// =========================================
export const KNOWLEDGE_CATEGORIES = {
  POLITICIAN: "politician",      // 政治人物 → 黨派+立場標籤
  MEDIA: "media",                // 媒體 → 傾向分數
  TOPIC: "topic",                // 議題 → 藍綠立場對照+爭議程度
  TERM: "term",                  // 台灣特定名詞 → 定義+政治脈絡
  EVENT: "event",                // 近期事件 → 背景脈絡
};

// =========================================
// 🏛️ Three-Camp System (三營陣系統)
// =========================================
// Decision #013: Taiwan political spectrum mapped to Green/White/Blue camps
// bias_score boundaries: GREEN 0-40 / WHITE 40-60 / BLUE 60-100
// With ±GRADIENT_ZONE for smooth transitions at boundaries

export const CAMP_TYPES = {
  PAN_GREEN: "pan_green",       // 泛綠 (DPP + allies): bias_score <= GREEN_MAX
  PAN_WHITE: "pan_white",       // 泛白/中立 (TPP + independents): GREEN_MAX < score < BLUE_MIN
  PAN_BLUE: "pan_blue",         // 泛藍 (KMT + allies): bias_score >= BLUE_MIN
  INSUFFICIENT: "insufficient"  // 樣本不足,無法判定
};

/**
 * Get camp classification from bias_score with gradient weights.
 * Returns { camp, weights: { green, white, blue } } where weights sum to 1.0.
 *
 * Uses config.js THREE_CAMP boundaries (GREEN_MAX=40, BLUE_MIN=60, GRADIENT_ZONE=5).
 * Within ±GRADIENT_ZONE of boundaries, returns blended weights for smooth transitions.
 *
 * ⚠️ REUSES EXISTING: articles.bias_score (0-100) — no new column needed.
 *
 * @param {number} score - bias_score (0-100)
 * @returns {{ camp: string, weights: { green: number, white: number, blue: number } }}
 */
export function getCampFromScore(score) {
  const { GREEN_MAX, BLUE_MIN, GRADIENT_ZONE } = THREE_CAMP;

  // Pure zones (outside gradient)
  if (score <= GREEN_MAX - GRADIENT_ZONE) {
    return { camp: CAMP_TYPES.PAN_GREEN, weights: { green: 1.0, white: 0.0, blue: 0.0 } };
  }
  if (score >= BLUE_MIN + GRADIENT_ZONE) {
    return { camp: CAMP_TYPES.PAN_BLUE, weights: { green: 0.0, white: 0.0, blue: 1.0 } };
  }
  if (score > GREEN_MAX + GRADIENT_ZONE && score < BLUE_MIN - GRADIENT_ZONE) {
    return { camp: CAMP_TYPES.PAN_WHITE, weights: { green: 0.0, white: 1.0, blue: 0.0 } };
  }

  // Gradient zone: Green ↔ White boundary (35-45)
  if (score > GREEN_MAX - GRADIENT_ZONE && score <= GREEN_MAX + GRADIENT_ZONE) {
    const t = (score - (GREEN_MAX - GRADIENT_ZONE)) / (2 * GRADIENT_ZONE);
    return {
      camp: t < 0.5 ? CAMP_TYPES.PAN_GREEN : CAMP_TYPES.PAN_WHITE,
      weights: { green: 1.0 - t, white: t, blue: 0.0 }
    };
  }

  // Gradient zone: White ↔ Blue boundary (55-65)
  if (score >= BLUE_MIN - GRADIENT_ZONE && score < BLUE_MIN + GRADIENT_ZONE) {
    const t = (score - (BLUE_MIN - GRADIENT_ZONE)) / (2 * GRADIENT_ZONE);
    return {
      camp: t < 0.5 ? CAMP_TYPES.PAN_WHITE : CAMP_TYPES.PAN_BLUE,
      weights: { green: 0.0, white: 1.0 - t, blue: t }
    };
  }

  // Fallback (should not reach)
  return { camp: CAMP_TYPES.PAN_WHITE, weights: { green: 0.0, white: 1.0, blue: 0.0 } };
}

/**
 * Calculate white-axis value for radar chart.
 * Decision: white = 100 - abs(score-50)*2 (Qwen can't reliably output multi-dimensional)
 * ⚠️ DERIVED VALUE: computed from existing bias_score, no new column needed.
 *
 * @param {number} biasScore - bias_score (0-100)
 * @returns {number} white axis value (0-100, peaks at 50)
 */
export function getWhiteAxisValue(biasScore) {
  return Math.max(0, 100 - Math.abs(biasScore - 50) * 2);
}

// Camp display colors (three-bar + radar chart)
export const CAMP_COLORS = {
  PAN_GREEN: "#2E7D32",       // Forest green (泛綠)
  PAN_WHITE: "#757575",       // Neutral gray (泛白/中立)
  PAN_BLUE: "#1565C0",        // Deep blue (泛藍)
  INSUFFICIENT: "#BDBDBD"     // Light gray (資料不足)
};

// Blindspot detection types
// ⚠️ DERIVED from event_cluster camp distribution — no AI cost
export const BLINDSPOT_TYPES = {
  GREEN_ONLY: "green_only",       // Event covered only by green-leaning sources
  BLUE_ONLY: "blue_only",         // Event covered only by blue-leaning sources
  WHITE_MISSING: "white_missing", // No neutral/independent coverage
  IMBALANCED: "imbalanced"        // Severe camp imbalance (e.g., 80%+ one camp)
};

/**
 * Detect blindspot type from camp distribution.
 * ⚠️ REUSES EXISTING: articles.bias_score → getCampFromScore() per cluster member
 *
 * @param {{ green: number, white: number, blue: number }} campCounts - article count per camp
 * @returns {string|null} BLINDSPOT_TYPES value, or null if balanced
 */
export function detectBlindspot(campCounts) {
  const total = campCounts.green + campCounts.white + campCounts.blue;
  if (total === 0) return null;

  const greenPct = campCounts.green / total;
  const bluePct = campCounts.blue / total;
  const whitePct = campCounts.white / total;

  if (greenPct >= 0.8 && campCounts.blue === 0) return BLINDSPOT_TYPES.GREEN_ONLY;
  if (bluePct >= 0.8 && campCounts.green === 0) return BLINDSPOT_TYPES.BLUE_ONLY;
  if (whitePct === 0 && total >= 3) return BLINDSPOT_TYPES.WHITE_MISSING;
  if (greenPct >= 0.7 || bluePct >= 0.7) return BLINDSPOT_TYPES.IMBALANCED;

  return null; // Balanced
}

// Subscriber tiers
export const SUBSCRIBER_TIERS = {
  FREE: "free",                // 免費用戶 (所有功能可用)
  SUPPORTER: "supporter"       // 公民贊助者 (投票權 2x + 搶先體驗 + 完整報告)
};

// Badge types (gamification)
export const BADGE_TYPES = {
  BEGINNER_ANALYST: "beginner_analyst",       // 新手分析師: 完成首次分析
  STANCE_OBSERVER: "stance_observer",         // 立場觀察家: 分析 50 篇
  CROSS_MEDIA_EXPERT: "cross_media_expert",   // 跨媒體達人: 閱讀 3+ 來源同事件
  BLINDSPOT_FINDER: "blindspot_finder",       // 盲區發現者: 閱讀 10 篇盲區文章
  NEUTRAL_GUARDIAN: "neutral_guardian"         // 中立守護者: 閱讀偏見 < 15%
};

// =========================================
// 🌈 UI Theme Colors (Taiwan Localization)
// =========================================
export const THEME_COLORS = {
  // Bias visualization colors
  EXTREME_LEFT: "#0066CC",       // Blue
  LEFT: "#3399FF",
  CENTER: "#999999",             // Gray
  RIGHT: "#FF6666",
  EXTREME_RIGHT: "#CC0000",      // Red

  // Controversy colors
  CONTROVERSY_LOW: "#28A745",    // Green
  CONTROVERSY_MODERATE: "#FFC107",  // Yellow
  CONTROVERSY_HIGH: "#FD7E14",   // Orange
  CONTROVERSY_VERY_HIGH: "#DC3545"  // Red
};

// =========================================
// 📦 Export Validation Functions
// =========================================

/**
 * Validate if a news source is recognized
 */
export function isValidNewsSource(source) {
  return Object.values(NEWS_SOURCES).includes(source);
}

/**
 * Validate if an article status is valid
 */
export function isValidArticleStatus(status) {
  return Object.values(ARTICLE_STATUS).includes(status);
}

/**
 * Validate enum value against allowed values
 * Generic validation function for any enum
 */
export function validateEnum(value, enumObject, enumName) {
  if (!Object.values(enumObject).includes(value)) {
    throw new Error(`Invalid ${enumName}: ${value}. Allowed: ${Object.values(enumObject).join(', ')}`);
  }
  return true;
}

// =========================================
// 📝 Export All
// =========================================
export default {
  NEWS_SOURCES,
  NEWS_SOURCES_REVERSE,
  ARTICLE_STATUS,
  ARTICLE_STATUS_TRANSITIONS,
  BIAS_CATEGORIES,
  CONTROVERSY_LEVELS,
  ARTICLE_TYPES,
  QUALITY_GATE_RESULTS,
  USER_ROLES,
  REWARD_STATUS,
  PLATFORMS,
  NOTIFICATION_TYPES,
  ERROR_TYPES,
  NEWS_CATEGORIES,
  KNOWLEDGE_CATEGORIES,
  THEME_COLORS,
  // Three-Camp System (v2.0)
  CAMP_TYPES,
  CAMP_COLORS,
  BLINDSPOT_TYPES,
  SUBSCRIBER_TIERS,
  BADGE_TYPES,
  // Helper functions
  canTransitionStatus,
  getBiasCategory,
  getControversyLevel,
  getArticleType,
  getUserErrorMessage,
  isValidNewsSource,
  isValidArticleStatus,
  validateEnum,
  // Three-Camp helpers (v2.0)
  getCampFromScore,
  getWhiteAxisValue,
  detectBlindspot
};
