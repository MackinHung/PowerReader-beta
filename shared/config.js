/**
 * 🔧 PowerReader - Central Configuration
 *
 * ⚠️ SINGLE SOURCE OF TRUTH (SSOT)
 * This file contains ALL system-wide configuration.
 * DO NOT hardcode values elsewhere - import from this file!
 *
 * 📍 Navigation:
 * - Upstream: CLAUDE.md, MASTER_ROADMAP.md
 * - Downstream: All teams (T01-T07)
 * - Maintainer: T01 (System Architecture Team)
 * - Last Updated: 2026-03-08
 *
 * 📜 Change Log:
 * | Date       | Version | Changes                                            | Reason                          |
 * |------------|---------|----------------------------------------------------|---------------------------------|
 * | 2025-03-06 | v1.0    | Initial config                                     | Project kickoff                 |
 * | 2026-03-07 | v2.0    | PowerReader: 4B model, bge-m3, KV budget, boundaries | Architecture decisions #004-#010 |
 * | 2026-03-08 | v3.0    | THREE_CAMP config: camp boundaries, gradient zone, source tendency, clustering, blindspot, subscription | Decisions #013-#016 |
 * | 2026-03-08 | v3.1    | BENCHMARK config: Ollama detection, hardware benchmark, CPU/GPU timeout tiers; QWEN_TIMEOUT_MS 30s→120s | Decisions #017-#020 (desktop only, Mode A, CPU support) |
 * | 2026-03-08 | v3.2    | WebLLM migration: QWEN model → Qwen3-4B-q4f16_1-MLC; BENCHMARK section Ollama→WebGPU; +DUAL_PASS_ENABLED; +WEBLLM_*; -OLLAMA_* | Decision #022-#023 (WebLLM + Dual Pass) |
 */

// =========================================
// 🤖 AI Models Configuration
// =========================================
// ⚠️ CRITICAL: Embedding models are NOT interchangeable!
// bge-m3 (1024d) and bge-small-zh (512d) produce incompatible vector spaces.
// Use MODELS.EMBEDDING for knowledge queries, MODELS.FILTER for topic filtering ONLY.
export const MODELS = {
  // Client-side local inference (WebLLM, WebGPU browser)
  QWEN: "Qwen3-4B-q4f16_1-MLC",
  QWEN_PARAMS: {
    think: false,
    temperature: 0.5,
    top_p: 0.95,
  },
  QWEN_FALLBACK: "Qwen2.5-3B-Instruct-q4f16_1-MLC",  // Low VRAM fallback
  QWEN_SIZE_MB: 3400,           // 3.4GB WebLLM model (WebGPU browser cache)
  QWEN_TIMEOUT_MS: 120000,      // 120s inference timeout (CPU support, was 30s GPU-only)

  // Knowledge embedding (Cloudflare Workers AI, edge GPU)
  EMBEDDING: "@cf/baai/bge-m3",
  EMBEDDING_DIMENSIONS: 1024,
  EMBEDDING_NEURONS_PER_CALL: 1.6,  // Measured: ~1.6 neurons per embed

  // Topic filtering (Crawler-side CPU)
  FILTER: "bge-small-zh-v1.5",
  FILTER_DIMENSIONS: 512,
  FILTER_SIZE_MB: 130,
  FILTER_SPEED_MS: 100,         // ~0.1s per article on CPU
};

// =========================================
// ☁️ Cloudflare Configuration
// =========================================
export const CLOUDFLARE = {
  // KV Cache TTL
  KV_METADATA_TTL: 30,        // 30 seconds for metadata
  KV_ARTICLE_TTL: 3600,       // 1 hour for article content
  KV_STATIC_TTL: 864000,      // 10 days for static resources

  // CDN Cache TTL
  CDN_NEWS_LIST_TTL: 5,       // 5 seconds for news list
  CDN_ARTICLE_TTL: 3600,      // 1 hour for article
  CDN_STATIC_TTL: 864000,     // 10 days for static

  // KV Write Limits (Free tier)
  KV_DAILY_WRITE_LIMIT: 1000, // Free: 1000 writes/day
  KV_MONTHLY_WRITE_LIMIT: 30000,
  KV_DAILY_READ_LIMIT: 100000,

  // Workers AI Limits (Free tier)
  WORKERS_AI_DAILY_LIMIT: 10000,  // Free: 10000 neurons/day
  WORKERS_AI_NEURONS_PER_EMBED: 1.6,
  WORKERS_AI_DAILY_NEURON_BUDGET: 10000,
  // Estimated daily usage: 600 articles × 1.6 = 960 neurons (9.6%)

  // Vectorize
  VECTORIZE_INDEX: "powerreader-knowledge",
  VECTORIZE_DIMENSIONS: 1024,
  VECTORIZE_METRIC: "cosine",
  VECTORIZE_TOP_K: 5,
  VECTORIZE_MIN_SCORE: 0.55,
  VECTORIZE_MONTHLY_QUERY_DIM_LIMIT: 30000000,

  // R2 Storage
  R2_BUCKET: "powerreader-articles",
  R2_ARTICLE_PATH_PREFIX: "articles",   // articles/{date}/{id}.json
  R2_KNOWLEDGE_PATH_PREFIX: "knowledge",
  R2_MAX_STORAGE_GB: 10,               // Free tier: 10GB

  // D1 Database
  D1_DATABASE: "powerreader-db",
  D1_MAX_STORAGE_GB: 5,
  D1_DAILY_READ_LIMIT: 5000000,

  // Workers Requests
  WORKERS_DAILY_REQUEST_LIMIT: 100000,  // Free tier: 100K/day
};

// =========================================
// 📊 KV Write Budget (Free tier: 1000/day)
// =========================================
// Each team has a daily KV write budget. Exceeding triggers queue/degrade.
export const KV_WRITE_BUDGET = {
  T02_CRAWLER: 400,      // Batch writes, ~50 per 2h run
  T03_ANALYSIS: 300,     // Analysis results
  T05_REWARD: 150,       // Points + anti-cheat
  T07_METRICS: 50,       // Monitoring flush (hourly)
  T01_SYSTEM: 100,       // Config cache, session cleanup, misc
  // Total = 1000 (Cloudflare free tier daily limit)
  // Note: Rate limiting uses Workers Cache API (free, no KV budget impact)
};

// =========================================
// 🕷️ Crawler Configuration
// =========================================
export const CRAWLER = {
  // Rate Limiting (MUST BE PERSISTENT in KV, not in-memory!)
  // Lesson from OceanRAG: In-memory rate limits reset on restart
  RATE_LIMIT_DELAY_MS: 2000,   // ≥ 2 seconds between requests per source
  RATE_LIMIT_PERSISTENT: true, // Store in KV

  // User-Agent
  USER_AGENT: "PowerReaderBot/1.0 (+https://github.com/powerreader)",

  // Cache Strategy
  CACHE_DURATION_HOURS: 24,    // Don't re-crawl same article within 24h

  // GitHub Actions Schedule
  CRON_SCHEDULE: "0 */2 * * *", // Every 2 hours

  // Error Handling
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,

  // Article Limits
  MAX_ARTICLES_PER_RUN: 50,    // ~50 articles per 2h run (after dedup)
  ARTICLES_PER_DAY: 600,       // ~600 articles/day total

  // Topic filtering (bge-small-zh cosine similarity)
  FILTER_COSINE_THRESHOLD: 0.5,  // Minimum similarity to topic vectors
};

// =========================================
// 🎯 Analysis Configuration
// =========================================
export const ANALYSIS = {
  // Quality Gates (4-layer validation)
  MIN_CHUNK_CHARS: 5,          // Filter garbage chunks
  MIN_ARTICLE_CHARS: 100,      // Min article length

  // Bias Score Range
  BIAS_SCORE_MIN: 0,
  BIAS_SCORE_MAX: 100,

  // Bias score boundaries (0-100, 0=deep green, 100=deep blue)
  BIAS_BOUNDARIES: [5, 40, 48, 52, 60, 95],
  // Categories: extreme_left | left | center_left | center | center_right | right | extreme_right

  // Controversy score boundaries
  CONTROVERSY_MIN: 0,
  CONTROVERSY_MAX: 100,
  CONTROVERSY_BOUNDARIES: [5, 15, 50],
  // Categories: low | moderate | high | very_high

  // Deduplication (MinHash)
  SIMILARITY_DUPLICATE_THRESHOLD: 0.85,  // > 85% = duplicate
  SIMILARITY_ORIGINAL_THRESHOLD: 0.30,   // < 30% = original
  SIMILARITY_REWRITE_THRESHOLD: 0.70,    // > 70% = rewrite

  // Consistency Check
  SAME_AUTHOR_MAX_DIFF_PCT: 0.35,  // Same author's bias scores should differ < 35%

  // Target Pass Rate
  TARGET_PASS_RATE_MIN: 0.60,  // 60%
  TARGET_PASS_RATE_MAX: 0.70   // 70%
};

// =========================================
// 💰 Reward System Configuration
// =========================================
export const REWARD = {
  // Points Mechanism (integer cents to avoid floating point!)
  POINTS_USE_CENTS: true,                // All point values stored as integer cents
  POINTS_PER_VALID_ANALYSIS: 10,         // 10 cents = 0.1 points
  POINTS_PER_VOTE_RIGHT: 1000,           // 1000 cents = 10.00 points = 1 vote right

  // Fisher-Yates Shuffle (Phase 2+)
  SHUFFLE_SEED_SOURCE: "record_hash",    // Use last record hash as seed

  // Audit
  AUDIT_COMMIT_TO_GITHUB: true,
  AUDIT_RETENTION_DAYS: 365,  // Keep audit logs for 1 year

  // Anti-cheat
  DAILY_ANALYSIS_LIMIT: 50,             // Max analyses per user per day
  MIN_ANALYSIS_TIME_MS: 5000,           // 5s min time; aligns with Qwen inference (~6s)
  CONSECUTIVE_FAILURE_COOLDOWN: 3,      // After 3 failures, cooldown
  COOLDOWN_DURATION_MIN: 60,            // 60 min cooldown
};

// =========================================
// 🏛️ Three-Camp System Configuration (三營陣系統)
// =========================================
// Decision #013: Taiwan political camps mapped from bias_score
// ⚠️ REUSES EXISTING: articles.bias_score (0-100)
// ⚠️ DERIVED: white axis = 100 - abs(score-50)*2 (no new AI output needed)
export const THREE_CAMP = {
  GREEN_MAX: 40,                // bias_score <= 40 → 泛綠 (pan_green)
  WHITE_MIN: 40,                // 40 < score < 60 → 泛白/中立 (pan_white)
  WHITE_MAX: 60,
  BLUE_MIN: 60,                 // bias_score >= 60 → 泛藍 (pan_blue)
  GRADIENT_ZONE: 5,             // ±5 分邊界漸進區 (避免 39→41 顏色跳變)

  // Source tendency (社群推導, not pre-labeled)
  // Decision #014: 30-day sliding window AVG(bias_score) per source
  MIN_SAMPLES: 10,              // 最低有效樣本數 (< 10 → "insufficient")
  TENDENCY_WINDOW_DAYS: 30,     // 滑動視窗天數

  // Event clustering (reuses existing title bigram Jaccard)
  // Decision: keep zero-neuron Jaccard, raise threshold to 0.45
  CLUSTER_JACCARD_THRESHOLD: 0.45,  // ⚠️ CHANGED: was implicit, now explicit
  CLUSTER_MIN_ARTICLES: 2,          // 至少 2 篇才成事件

  // Blindspot detection thresholds
  BLINDSPOT_DOMINANT_PCT: 0.8,      // 單營陣占比 >= 80% → blindspot
  BLINDSPOT_IMBALANCE_PCT: 0.7,     // 單營陣占比 >= 70% → imbalanced
  BLINDSPOT_MIN_ARTICLES: 3,        // 至少 3 篇才做盲區判定

  // Subscription
  SUBSCRIBER_VOTE_MULTIPLIER: 2,    // 訂閱者投票權倍率
  SUBSCRIBER_EARLY_ACCESS_HOURS: 24 // 搶先體驗時數
};

// =========================================
// 🔬 Benchmark Configuration (WebGPU Hardware Detection)
// =========================================
// Decision #018/#022: Detect WebGPU → benchmark → determine GPU capability
export const BENCHMARK = {
  // WebLLM configuration
  WEBLLM_MODEL_ID: "Qwen3-4B-q4f16_1-MLC",        // Primary model (3,432 MB VRAM)
  WEBLLM_MODEL_VRAM_MB: 3432,                       // Required VRAM
  WEBLLM_FALLBACK_MODEL_ID: "Qwen2.5-3B-Instruct-q4f16_1-MLC",  // Low VRAM fallback (2,505 MB)
  WEBLLM_FALLBACK_VRAM_MB: 2505,

  // Dual Pass architecture (Decision #023)
  DUAL_PASS_ENABLED: true,                           // Run article through 2 passes with different focus
  DUAL_PASS_TOTAL_TIMEOUT_MS: 60000,                 // 60s total for both passes

  // Benchmark parameters
  BENCHMARK_PROMPT: "分析以下新聞標題的政治立場：總統出席國防展覽",  // Short test prompt
  BENCHMARK_MAX_WAIT_MS: 30000,                      // 30s max for benchmark inference
  BENCHMARK_GPU_THRESHOLD_MS: 8000,                  // < 8s → GPU detected
  BENCHMARK_CPU_THRESHOLD_MS: 60000,                 // < 60s → CPU acceptable (WASM fallback)

  // Timeout tiers based on benchmark
  TIMEOUT_GPU_MS: 30000,                             // GPU: 30s timeout per pass
  TIMEOUT_CPU_MS: 120000,                            // CPU: 120s timeout per pass
  TIMEOUT_CPU_SLOW_MS: 180000,                       // Slow CPU: 180s timeout per pass

  // LocalStorage keys
  LS_BENCHMARK_RESULT: "pr_benchmark_result",        // { mode: "gpu"|"cpu"|"none", latency_ms, tested_at }
  LS_WEBGPU_AVAILABLE: "pr_webgpu_available",        // boolean
};

// =========================================
// 📱 Frontend Configuration
// =========================================
export const FRONTEND = {
  // PWA
  PWA_NAME: "PowerReader - 台灣新聞立場分析",
  PWA_SHORT_NAME: "PowerReader",

  // IndexedDB
  INDEXEDDB_NAME: "PowerReader",
  INDEXEDDB_VERSION: 1,
  INDEXEDDB_CACHE_DAYS: 10,

  // Download Conditions
  DOWNLOAD_WIFI_ONLY: true,
  DOWNLOAD_MIN_BATTERY_PCT: 20,
  DOWNLOAD_REQUIRE_CHARGING: false,
  DOWNLOAD_MIN_STORAGE_MB: 4000,  // Need ~3.4GB for Qwen model

  // Storage Persistence
  STORAGE_PERSIST: true,  // Request persistent storage

  // LINE Bot
  LINE_BOT_SUMMARY_MAX_CHARS: 200,  // Max 200 chars in summary
  LINE_BOT_FLEX_MESSAGE_MAX_SIZE: 10000,  // Flex Message size limit

  // Error Messages (Generic only - no internal details!)
  // Lesson from OceanRAG: Never leak internal errors to users
  ERROR_MESSAGE_GENERIC: "系統錯誤,請稍後再試"
};

// =========================================
// 🔒 Security Configuration
// =========================================
export const SECURITY = {
  // JWT
  JWT_TTL_DAYS: 30,
  JWT_ALGORITHM: "RS256",  // Asymmetric encryption

  // Session
  SESSION_TTL_HOURS: 24,
  SESSION_CROSS_VERIFY: true,  // Cross-verify JWT and session

  // XSS Protection
  ESCAPE_HTML: true,  // Always escape user input

  // GDPR/Privacy
  DATA_RETENTION_DAYS: 365,
  ANONYMIZE_CONTRIBUTORS: true,

  // Rate Limiting (API)
  API_RATE_LIMIT_PER_MINUTE: 60,
  API_RATE_LIMIT_PER_HOUR: 1000
};

// =========================================
// 📊 Monitoring Configuration
// =========================================
export const MONITORING = {
  // Performance Targets
  TARGET_KV_LATENCY_MS: 30,
  TARGET_CDN_CACHE_HIT_RATE: 0.80,  // 80%
  TARGET_MODEL_INFERENCE_SEC: 10,    // Qwen 4B: 6-10s

  // Dashboard Refresh
  DASHBOARD_REFRESH_INTERVAL_SEC: 3600,  // 1 hour

  // Alerts — latency & rate thresholds
  ALERT_KV_LATENCY_MS: 100,              // Alert if KV avg latency > 100ms
  ALERT_CDN_HIT_RATE_THRESHOLD: 0.60,    // Alert if CDN hit rate < 60%
  ALERT_CRAWLER_FAILURE_THRESHOLD: 0.10,  // Alert if > 10% fail
  ALERT_ANALYSIS_FAILURE_THRESHOLD: 0.40, // Alert if < 60% pass

  // Free tier usage alerts (80% threshold)
  ALERT_KV_WRITES_PCT: 0.80,             // 800/1000
  ALERT_WORKERS_AI_NEURONS_PCT: 0.80,     // 8000/10000
  ALERT_WORKERS_REQUESTS_PCT: 0.80,       // 80K/100K
  ALERT_VECTORIZE_QUERIES_PCT: 0.80,      // 24M/30M
  ALERT_R2_STORAGE_PCT: 0.80,             // 8GB/10GB
  ALERT_D1_STORAGE_PCT: 0.80,             // 4GB/5GB
};

// =========================================
// 🌍 Localization Configuration
// =========================================
export const LOCALIZATION = {
  DEFAULT_LOCALE: "zh-TW",  // Traditional Chinese (Taiwan)
  DEFAULT_TIMEZONE: "Asia/Taipei",
  DATE_FORMAT: "YYYY-MM-DD",
  TIME_FORMAT: "HH:mm:ss"
};

// =========================================
// 🧪 Development Configuration
// =========================================
export const DEV = {
  // Debug Mode
  DEBUG: false,  // Set to true only in development
  VERBOSE_LOGGING: false,

  // Skip Model Cache (for testing)
  SKIP_MODEL_CACHE: false,  // Set to true to force re-download

  // Mock Data
  USE_MOCK_DATA: false
};

// =========================================
// 🔍 Validation Functions
// =========================================

/**
 * Validate if a bias score is within valid range
 */
export function isValidBiasScore(score) {
  return typeof score === 'number' && score >= ANALYSIS.BIAS_SCORE_MIN && score <= ANALYSIS.BIAS_SCORE_MAX;
}

/**
 * Validate if a controversy score is within valid range
 */
export function isValidControversyScore(score) {
  return typeof score === 'number' && score >= ANALYSIS.CONTROVERSY_MIN && score <= ANALYSIS.CONTROVERSY_MAX;
}

/**
 * Check if production environment is using secure tokens
 * Lesson from OceanRAG: Never use default tokens in production!
 */
export function validateProductionSecurity(env, serviceToken) {
  if (env === 'production' && serviceToken.startsWith('default_')) {
    throw new Error("FATAL: Must set secure service token in production!");
  }
  return true;
}

// =========================================
// 📝 Export All
// =========================================
export default {
  MODELS,
  CLOUDFLARE,
  KV_WRITE_BUDGET,
  CRAWLER,
  ANALYSIS,
  REWARD,
  THREE_CAMP,
  BENCHMARK,
  FRONTEND,
  SECURITY,
  MONITORING,
  LOCALIZATION,
  DEV,
  // Helper functions
  isValidBiasScore,
  isValidControversyScore,
  validateProductionSecurity
};
