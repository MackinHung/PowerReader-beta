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
 */

import { ANALYSIS } from './config.js';

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
  STORM_MEDIA: "風傳媒"
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
  LOW: "low",                    // Score < C1
  MODERATE: "moderate",          // Score C1-C2
  HIGH: "high",                  // Score C2-C3
  VERY_HIGH: "very_high"         // Score > C3
};

/**
 * Get controversy level from score
 * Boundaries from shared/config.js ANALYSIS.CONTROVERSY_BOUNDARIES
 */
export function getControversyLevel(score) {
  const [C1, C2, C3] = ANALYSIS.CONTROVERSY_BOUNDARIES;
  if (score < C1) return CONTROVERSY_LEVELS.LOW;
  if (score < C2) return CONTROVERSY_LEVELS.MODERATE;
  if (score < C3) return CONTROVERSY_LEVELS.HIGH;
  return CONTROVERSY_LEVELS.VERY_HIGH;
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
  // Helper functions
  canTransitionStatus,
  getBiasCategory,
  getControversyLevel,
  getArticleType,
  getUserErrorMessage,
  isValidNewsSource,
  isValidArticleStatus,
  validateEnum
};
