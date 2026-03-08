# D1 Migration v2.0 — 三營陣 + 事件聚合 + 訂閱系統

## 導航
- **上游文件**: `MASTER_ROADMAP.md` (決策 #013-#016), `T01_SYSTEM_ARCHITECTURE/API_ROUTES.md`
- **下游文件**: `src/workers/migrations/0005_three_camp.sql` (待建立)
- **維護者**: T01 (系統架構團隊)
- **最後更新**: 2026-03-08
- **狀態**: 設計完成,待實作

---

## 設計原則

1. **⚠️ REUSES EXISTING**: 盡可能利用現有欄位 (`articles.bias_score`, `articles.source`, `articles.published_at`)
2. **DERIVED**: 三營陣映射從 `bias_score` 推導,白軸為計算值,不需額外 AI 輸出
3. **零 neuron 成本**: 事件聚類用 title bigram Jaccard,不消耗 Workers AI
4. **漸進式 migration**: 新表獨立建立,現有表只加欄位不改既有欄位

---

## 現有 Schema 回顧

### 已存在的 Migration 檔案
| 檔案 | 內容 | 表 |
|------|------|-----|
| `0001_initial.sql` | 核心 Schema | articles, analyses, users, sessions, crawler_runs |
| `0002_metrics.sql` | 監控系統 | metrics_hourly, metrics_raw, alerts, daily_counters |
| `0003_t05_reward.sql` | 獎勵系統擴充 | reward_dedup + users ALTER |
| `0004_knowledge_entries.sql` | 知識庫 | knowledge_entries |

### 可利用的現有欄位 (⚠️ REUSES EXISTING)
| 欄位 | 表 | v2.0 用途 |
|------|-----|----------|
| `bias_score` (0-100) | articles | → 三營陣映射 (綠 0-40 / 白 40-60 / 藍 60-100) |
| `source` | articles | → 來源傾向計算 (30 天 AVG) |
| `published_at` | articles | → 事件聚類時間窗口 |
| `title` | articles | → Jaccard bigram 聚類 |
| `controversy_score` | articles | → 事件爭議度 |
| `user_hash` | users | → 閱讀歷史、訂閱 |
| `total_points_cents` | users | → 訂閱者權益判定 |

---

## 新增 Migration: `0005_three_camp.sql`

### 1. articles 表擴充 (ALTER)

```sql
-- =========================================
-- articles 表: 新增三營陣欄位
-- ⚠️ DERIVED: 從 bias_score 推導, 由 Workers cron 或寫入時計算
-- =========================================
ALTER TABLE articles ADD COLUMN camp TEXT;
-- 值: 'pan_green' | 'pan_white' | 'pan_blue' | NULL
-- 來源: getCampFromScore(bias_score).camp (enums.js)

ALTER TABLE articles ADD COLUMN camp_weights TEXT;
-- JSON: {"green": 0.7, "white": 0.3, "blue": 0.0}
-- 來源: getCampFromScore(bias_score).weights
-- ⚠️ 漸進區 (±5 分邊界) 會有非 0/1 的權重

ALTER TABLE articles ADD COLUMN thumbnail_url TEXT;
-- og:image URL 從 Crawler 提取，用於首頁事件卡片圖片

ALTER TABLE analyses ADD COLUMN model_name TEXT DEFAULT 'Qwen3-4B-q4f16_1-MLC';
-- 分析使用的模型名稱，目前只有 Qwen3-4B (WebLLM) 但未來可能多模型

-- 索引: 加速按營陣篩選
CREATE INDEX idx_articles_camp ON articles(camp);
```

**回填策略**: 部署後執行一次性 UPDATE:
```sql
-- 回填示意 (實際由 Workers 程式碼執行, 用 getCampFromScore)
-- 此處只是 SQL 近似, 漸進區權重需要程式碼處理
UPDATE articles SET camp = CASE
  WHEN bias_score <= 35 THEN 'pan_green'
  WHEN bias_score >= 65 THEN 'pan_blue'
  WHEN bias_score > 40 AND bias_score < 60 THEN 'pan_white'
  ELSE 'pan_white'  -- 漸進區預設
END
WHERE bias_score IS NOT NULL AND camp IS NULL;
```

---

### 2. event_clusters — 事件聚類

```sql
-- =========================================
-- 事件聚類: 將多篇報導同一事件的文章分組
-- 決策 #013: Jaccard bigram ≥ 0.45, 零 neuron 成本
-- =========================================
CREATE TABLE event_clusters (
  cluster_id TEXT PRIMARY KEY,                    -- 格式: evt_{YYYYMMDD}_{hash8}
  title TEXT NOT NULL,                            -- 事件代表標題 (最早的文章標題)
  summary TEXT,                                   -- Workers AI 生成的事件摘要 (Phase 5, nullable)
  article_count INTEGER NOT NULL DEFAULT 0,       -- 成員文章數
  source_count INTEGER NOT NULL DEFAULT 0,        -- 來源數 (跨媒體覆蓋)

  -- ⚠️ DERIVED: 從成員文章的 camp 統計
  camp_distribution TEXT,                         -- JSON: {"pan_green": 3, "pan_white": 2, "pan_blue": 5}
  camp_pct TEXT,                                  -- JSON: {"green": 0.30, "white": 0.20, "blue": 0.50}

  -- ⚠️ DERIVED: 從 camp_pct 規則判定
  blindspot TEXT,                                 -- 'green_only' | 'blue_only' | 'white_missing' | 'imbalanced' | NULL
  consensus_score REAL,                           -- 0.0-1.0 跨媒體一致度 (bias_score 標準差反向)

  -- 時間範圍
  earliest_published_at TEXT NOT NULL,            -- 最早文章時間
  latest_published_at TEXT NOT NULL,              -- 最新文章時間

  -- ⚠️ REUSES EXISTING: 最高爭議度的文章
  max_controversy_score INTEGER,
  dominant_topic TEXT,                            -- 最常見的 matched_topic

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_event_clusters_latest ON event_clusters(latest_published_at DESC);
CREATE INDEX idx_event_clusters_blindspot ON event_clusters(blindspot) WHERE blindspot IS NOT NULL;
CREATE INDEX idx_event_clusters_controversy ON event_clusters(max_controversy_score DESC);
```

---

### 3. event_cluster_members — 事件成員

```sql
-- =========================================
-- 事件聚類成員: 多對多關係
-- ⚠️ REUSES EXISTING: article_id 來自 articles 表
-- =========================================
CREATE TABLE event_cluster_members (
  cluster_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  jaccard_score REAL,                             -- 與代表文章的 Jaccard 相似度
  added_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (cluster_id, article_id),
  FOREIGN KEY (cluster_id) REFERENCES event_clusters(cluster_id),
  FOREIGN KEY (article_id) REFERENCES articles(article_id)
);

CREATE INDEX idx_ecm_article ON event_cluster_members(article_id);
```

---

### 4. source_tendencies — 來源傾向 (社群推導)

```sql
-- =========================================
-- 來源傾向: 30 天滑動視窗 AVG(bias_score)
-- 決策 #014: 社群推導, 不預設標籤, 最低 10 篇門檻
-- ⚠️ REUSES EXISTING: 從 articles.source + articles.bias_score 聚合
-- =========================================
CREATE TABLE source_tendencies (
  source TEXT NOT NULL,                           -- NEWS_SOURCES enum
  month TEXT NOT NULL,                            -- 'YYYY-MM' 月度快照
  sample_count INTEGER NOT NULL DEFAULT 0,        -- 該月有效文章數
  avg_bias_score REAL,                            -- 月均 bias_score
  std_bias_score REAL,                            -- 標準差 (一致性指標)
  camp TEXT,                                      -- 推導營陣 (sample_count >= 10 才計算)
  camp_weights TEXT,                              -- JSON: {"green": 0.1, "white": 0.8, "blue": 0.1}
  is_sufficient INTEGER NOT NULL DEFAULT 0,       -- sample_count >= MIN_SAMPLES (10)
  computed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (source, month)
);

CREATE INDEX idx_source_tendencies_camp ON source_tendencies(camp) WHERE is_sufficient = 1;
```

**計算觸發**: Workers cron (每日一次) 或文章寫入時增量更新:
```sql
-- 計算示意 (實際由 Workers 程式碼執行)
SELECT source,
       strftime('%Y-%m', published_at) as month,
       COUNT(*) as sample_count,
       AVG(bias_score) as avg_bias_score,
       -- SQLite 無內建 STDDEV, 需程式碼計算
       CASE WHEN COUNT(*) >= 10 THEN 1 ELSE 0 END as is_sufficient
FROM articles
WHERE bias_score IS NOT NULL
  AND published_at >= date('now', '-30 days')
GROUP BY source, strftime('%Y-%m', published_at);
```

---

### 5. subscribers — 訂閱者

```sql
-- =========================================
-- 訂閱者: 公民贊助模式
-- 決策 #015: 不鎖功能, 投票權 2x + 搶先體驗 24h + 完整報告
-- =========================================
CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_hash TEXT NOT NULL UNIQUE,                 -- ⚠️ REUSES EXISTING: users.user_hash
  tier TEXT NOT NULL DEFAULT 'supporter',          -- 'supporter' (目前僅一級)
  email TEXT,                                      -- 訂閱通知用 (nullable, 加密儲存)
  notification_preferences TEXT,                   -- JSON: {"daily_summary": true, "blindspot_alert": true, "analysis_result": false}
  vote_multiplier INTEGER NOT NULL DEFAULT 2,     -- 投票權倍率 (config: SUBSCRIBER_VOTE_MULTIPLIER)
  early_access_hours INTEGER NOT NULL DEFAULT 24, -- 搶先體驗時數
  subscribed_at TEXT NOT NULL,
  expires_at TEXT,                                 -- NULL = 永久 (早期支持者)
  status TEXT NOT NULL DEFAULT 'active',           -- 'active' | 'expired' | 'cancelled'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_hash) REFERENCES users(user_hash)
);

CREATE INDEX idx_subscribers_status ON subscribers(status) WHERE status = 'active';
CREATE INDEX idx_subscribers_email ON subscribers(email) WHERE email IS NOT NULL;
```

---

### 6. user_reading_history — 閱讀歷史

```sql
-- =========================================
-- 閱讀歷史: 追蹤用戶閱讀行為 → 個人閱讀偏見分析
-- ⚠️ REUSES EXISTING: article_id, user_hash
-- =========================================
CREATE TABLE user_reading_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_hash TEXT NOT NULL,
  article_id TEXT NOT NULL,
  camp TEXT,                                       -- 該文章的營陣 (冗餘, 加速查詢)
  source TEXT,                                     -- 該文章的來源 (冗餘, 加速查詢)
  read_duration_ms INTEGER,                        -- 閱讀時長 (可選, 前端回報)
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_hash) REFERENCES users(user_hash),
  FOREIGN KEY (article_id) REFERENCES articles(article_id)
);

CREATE INDEX idx_urh_user_date ON user_reading_history(user_hash, read_at DESC);
CREATE INDEX idx_urh_user_camp ON user_reading_history(user_hash, camp);
-- 注意: 不加 UNIQUE 約束, 同篇文章可重複閱讀 (計入偏見統計)
```

**閱讀偏見查詢** (API: `GET /api/v1/user/me/reading-bias`):
```sql
-- 近 30 天閱讀營陣分布
SELECT camp, COUNT(*) as count
FROM user_reading_history
WHERE user_hash = ?
  AND read_at >= date('now', '-30 days')
  AND camp IS NOT NULL
GROUP BY camp;

-- 近 30 天來源多元度
SELECT source, COUNT(*) as count
FROM user_reading_history
WHERE user_hash = ?
  AND read_at >= date('now', '-30 days')
GROUP BY source
ORDER BY count DESC;
```

---

### 7. user_streaks — 連勝紀錄

```sql
-- =========================================
-- 連勝紀錄: 追蹤連續貢獻天數 (激勵機制)
-- ⚠️ REUSES EXISTING: user_hash
-- =========================================
CREATE TABLE user_streaks (
  user_hash TEXT PRIMARY KEY,
  current_streak INTEGER NOT NULL DEFAULT 0,       -- 當前連續天數
  longest_streak INTEGER NOT NULL DEFAULT 0,       -- 歷史最長連續天數
  last_contribution_date TEXT,                     -- 'YYYY-MM-DD' 最後貢獻日期
  total_contribution_days INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_hash) REFERENCES users(user_hash)
);
```

**連勝更新邏輯** (每次分析提交時):
```
IF last_contribution_date == today:
  → 不更新 (同日重複)
ELIF last_contribution_date == yesterday:
  → current_streak += 1
  → longest_streak = MAX(longest_streak, current_streak)
ELSE:
  → current_streak = 1  (斷鏈重計)
```

---

### 8. user_badges — 徽章

```sql
-- =========================================
-- 徽章系統: 成就解鎖
-- 對應 enums.js BADGE_TYPES
-- =========================================
CREATE TABLE user_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_hash TEXT NOT NULL,
  badge_type TEXT NOT NULL,                        -- BADGE_TYPES enum
  -- 'beginner_analyst'    — 首次分析
  -- 'stance_observer'     — 完成 50 次分析
  -- 'cross_media_expert'  — 閱讀 10+ 來源
  -- 'blindspot_finder'    — 發現 5 個盲區事件
  -- 'neutral_guardian'    — 連續 7 天閱讀平衡 (綠/白/藍各 >= 20%)
  earned_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT,                                   -- JSON: 解鎖時的統計快照
  FOREIGN KEY (user_hash) REFERENCES users(user_hash),
  UNIQUE(user_hash, badge_type)                    -- 每種徽章只能獲得一次
);

CREATE INDEX idx_user_badges_user ON user_badges(user_hash);
```

---

### 9. blindspot_events — 盲區事件快取

```sql
-- =========================================
-- 盲區事件快取: 預計算的盲區事件
-- 決策 #016: 營陣占比 >= 80% → 盲區, >= 70% → 失衡
-- ⚠️ DERIVED: 從 event_clusters.camp_pct 規則判定
-- =========================================
CREATE TABLE blindspot_events (
  cluster_id TEXT PRIMARY KEY,
  blindspot_type TEXT NOT NULL,                    -- BLINDSPOT_TYPES enum
  dominant_camp TEXT NOT NULL,                     -- 主導營陣
  dominant_pct REAL NOT NULL,                      -- 主導占比 (0.0-1.0)
  missing_camps TEXT,                              -- JSON array: 缺失的營陣
  article_count INTEGER NOT NULL,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cluster_id) REFERENCES event_clusters(cluster_id)
);

CREATE INDEX idx_blindspot_type ON blindspot_events(blindspot_type);
CREATE INDEX idx_blindspot_detected ON blindspot_events(detected_at DESC);
```

---

### 10. article_feedback — 文章回饋

```sql
-- =========================================
-- 文章回饋: 使用者對分析品質的 👍👎 回饋
-- 決策: v2.0 UX 功能 B9
-- =========================================
CREATE TABLE IF NOT EXISTS article_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  type TEXT NOT NULL,                               -- 'thumbs_up' | 'thumbs_down'
  comment TEXT,                                      -- 選填文字回饋 (max 500 chars)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES articles(article_id),
  FOREIGN KEY (user_hash) REFERENCES users(user_hash),
  UNIQUE(article_id, user_hash)                     -- 每人每篇只能一次回饋 (upsert)
);

CREATE INDEX idx_article_feedback_article ON article_feedback(article_id);
CREATE INDEX idx_article_feedback_user ON article_feedback(user_hash);
```

---

## 完整 Migration SQL (合併版)

```sql
-- =========================================
-- 0005_three_camp.sql
-- PowerReader v2.0: 三營陣 + 事件聚合 + 訂閱系統
-- 決策: #013 (三營陣), #014 (來源傾向), #015 (訂閱), #016 (盲區)
-- 日期: 2026-03-08
-- =========================================

-- 1. articles 擴充
ALTER TABLE articles ADD COLUMN camp TEXT;
ALTER TABLE articles ADD COLUMN camp_weights TEXT;
ALTER TABLE articles ADD COLUMN thumbnail_url TEXT;
CREATE INDEX idx_articles_camp ON articles(camp);

-- 1b. analyses 擴充
ALTER TABLE analyses ADD COLUMN model_name TEXT DEFAULT 'Qwen3-4B-q4f16_1-MLC';

-- 2. 事件聚類
CREATE TABLE IF NOT EXISTS event_clusters (
  cluster_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  article_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  camp_distribution TEXT,
  camp_pct TEXT,
  blindspot TEXT,
  consensus_score REAL,
  earliest_published_at TEXT NOT NULL,
  latest_published_at TEXT NOT NULL,
  max_controversy_score INTEGER,
  dominant_topic TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_event_clusters_latest ON event_clusters(latest_published_at DESC);
CREATE INDEX idx_event_clusters_blindspot ON event_clusters(blindspot) WHERE blindspot IS NOT NULL;
CREATE INDEX idx_event_clusters_controversy ON event_clusters(max_controversy_score DESC);

-- 3. 事件成員
CREATE TABLE IF NOT EXISTS event_cluster_members (
  cluster_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  jaccard_score REAL,
  added_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (cluster_id, article_id),
  FOREIGN KEY (cluster_id) REFERENCES event_clusters(cluster_id),
  FOREIGN KEY (article_id) REFERENCES articles(article_id)
);
CREATE INDEX idx_ecm_article ON event_cluster_members(article_id);

-- 4. 來源傾向
CREATE TABLE IF NOT EXISTS source_tendencies (
  source TEXT NOT NULL,
  month TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  avg_bias_score REAL,
  std_bias_score REAL,
  camp TEXT,
  camp_weights TEXT,
  is_sufficient INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (source, month)
);
CREATE INDEX idx_source_tendencies_camp ON source_tendencies(camp) WHERE is_sufficient = 1;

-- 5. 訂閱者
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_hash TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL DEFAULT 'supporter',
  email TEXT,
  notification_preferences TEXT,
  vote_multiplier INTEGER NOT NULL DEFAULT 2,
  early_access_hours INTEGER NOT NULL DEFAULT 24,
  subscribed_at TEXT NOT NULL,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_hash) REFERENCES users(user_hash)
);
CREATE INDEX idx_subscribers_status ON subscribers(status) WHERE status = 'active';
CREATE INDEX idx_subscribers_email ON subscribers(email) WHERE email IS NOT NULL;

-- 6. 閱讀歷史
CREATE TABLE IF NOT EXISTS user_reading_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_hash TEXT NOT NULL,
  article_id TEXT NOT NULL,
  camp TEXT,
  source TEXT,
  read_duration_ms INTEGER,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_hash) REFERENCES users(user_hash),
  FOREIGN KEY (article_id) REFERENCES articles(article_id)
);
CREATE INDEX idx_urh_user_date ON user_reading_history(user_hash, read_at DESC);
CREATE INDEX idx_urh_user_camp ON user_reading_history(user_hash, camp);

-- 7. 連勝紀錄
CREATE TABLE IF NOT EXISTS user_streaks (
  user_hash TEXT PRIMARY KEY,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_contribution_date TEXT,
  total_contribution_days INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_hash) REFERENCES users(user_hash)
);

-- 8. 徽章
CREATE TABLE IF NOT EXISTS user_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_hash TEXT NOT NULL,
  badge_type TEXT NOT NULL,
  earned_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT,
  FOREIGN KEY (user_hash) REFERENCES users(user_hash),
  UNIQUE(user_hash, badge_type)
);
CREATE INDEX idx_user_badges_user ON user_badges(user_hash);

-- 9. 盲區事件快取
CREATE TABLE IF NOT EXISTS blindspot_events (
  cluster_id TEXT PRIMARY KEY,
  blindspot_type TEXT NOT NULL,
  dominant_camp TEXT NOT NULL,
  dominant_pct REAL NOT NULL,
  missing_camps TEXT,
  article_count INTEGER NOT NULL,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cluster_id) REFERENCES event_clusters(cluster_id)
);
CREATE INDEX idx_blindspot_type ON blindspot_events(blindspot_type);
CREATE INDEX idx_blindspot_detected ON blindspot_events(detected_at DESC);

-- 10. 文章回饋
CREATE TABLE IF NOT EXISTS article_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES articles(article_id),
  FOREIGN KEY (user_hash) REFERENCES users(user_hash),
  UNIQUE(article_id, user_hash)
);
CREATE INDEX idx_article_feedback_article ON article_feedback(article_id);
CREATE INDEX idx_article_feedback_user ON article_feedback(user_hash);

-- articles 新增欄位
ALTER TABLE articles ADD COLUMN thumbnail_url TEXT;

-- analyses 新增欄位
ALTER TABLE analyses ADD COLUMN model_name TEXT DEFAULT 'Qwen3-4B-q4f16_1-MLC';
```

---

## 資源用量預估

### D1 儲存影響
| 表 | 預估列數/月 | 預估大小/月 |
|----|-------------|-------------|
| articles (+2 欄) | ~18,000 | +~0.5MB (camp + camp_weights) |
| event_clusters | ~3,000 | ~1MB |
| event_cluster_members | ~18,000 | ~0.5MB |
| source_tendencies | ~18 × 1 = 18 | <1KB |
| subscribers | 增長型 | <10KB |
| user_reading_history | 增長型 (高流量) | ~5MB/月 (需定期清理) |
| user_streaks | 1:1 users | <10KB |
| user_badges | 增長型 | <50KB |
| blindspot_events | ~500 | ~50KB |
| article_feedback | 增長型 | <50KB |
| **合計新增** | | **~7MB/月** |

### 現有 D1 用量: ~3.9MB (384 篇, 11 來源)
### D1 免費額度: 5GB → 預估可用 **~700 個月** (遠低於上限)

---

## 清理策略

```sql
-- user_reading_history: 保留 90 天 (SECURITY.DATA_RETENTION_DAYS 為 365, 但閱讀歷史可縮短)
DELETE FROM user_reading_history WHERE read_at < date('now', '-90 days');

-- blindspot_events: 保留 30 天 (與事件聚類同步)
DELETE FROM blindspot_events WHERE detected_at < date('now', '-30 days');

-- event_clusters: 保留 30 天
DELETE FROM event_cluster_members WHERE cluster_id IN (
  SELECT cluster_id FROM event_clusters WHERE latest_published_at < date('now', '-30 days')
);
DELETE FROM event_clusters WHERE latest_published_at < date('now', '-30 days');

-- metrics_raw: 已有清理 (0002), 保留 24h
-- sessions: 已有清理 (Workers cron)
```

---

## 部署順序

1. `wrangler d1 execute powerreader-db --file=./migrations/0005_three_camp.sql`
2. 部署 Workers 更新 (含 camp 計算邏輯 + 聚類 cron)
3. 執行 articles 回填 (camp + camp_weights, 一次性)
4. 執行首次 source_tendencies 計算
5. 執行首次 event_clusters 聚類

---

## 變更紀錄

| 版本 | 日期 | 變更內容 | 變更者 |
|------|------|---------|--------|
| v1.0 | 2026-03-08 | 初版: 8 新表 + articles 2 新欄位 | T01 |
| v1.1 | 2026-03-08 | 新增: article_feedback 表, articles.thumbnail_url, analyses.model_name | T01 |
| v1.2 | 2026-03-08 | model_name DEFAULT 從 Ollama `qwen3.5:4b` 改為 WebLLM `Qwen3-4B-q4f16_1-MLC` | T01 |
