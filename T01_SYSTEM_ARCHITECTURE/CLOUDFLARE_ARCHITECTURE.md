# Cloudflare Architecture - PowerReader

## 導航
- **上游文件**: CLAUDE.md, MASTER_ROADMAP.md
- **下游文件**: T02 Crawler Spec, T03 Prompt Versions, T04 PWA Spec
- **維護者**: T01 (System Architecture Team)
- **最後更新**: 2026-03-07

---

## 服務總覽

| 服務 | 用途 | 免費額度 | 預估使用率 |
|------|------|---------|-----------|
| **Workers** | API 端點 + 業務邏輯 | 100K req/天 | ~2% |
| **Workers AI** | bge-m3 嵌入 (1024d) | 10K neurons/天 | ~9.6% |
| **Vectorize** | 知識庫向量搜索 | 30M 查詢維度/月 | ~61% |
| **R2** | 文章全文 + 靜態資源 | 10GB, 出流量免費 | ~22%/年 |
| **D1** | 結構化資料 (使用者/分析/獎勵) | 5GB, 5M 讀/天 | <1% |
| **KV** | 系統設定 + API 回應快取 | 1GB, 100K 讀/天 | <1% |
| **Pages** | PWA 前端 (靜態) | 無限 | N/A |

---

## API 端點設計

### 接收端 (Crawler → PowerReader)

| Method | Path | 說明 | 認證 |
|--------|------|------|------|
| POST | `/api/articles/batch` | 批量接收爬蟲推送的文章 | API Key |
| GET | `/api/health` | 健康檢查 | 無 |

### 客戶端 API

| Method | Path | 說明 | 認證 |
|--------|------|------|------|
| GET | `/api/articles/latest` | 最新文章列表 (分頁) | 無 |
| GET | `/api/articles/:id` | 單篇文章詳情 + 知識條目 | 無 |
| GET | `/api/articles/:id/knowledge` | 該文章關聯的知識庫條目 | 無 |
| POST | `/api/analyses` | 提交分析結果 (品質驗證) | User Hash |
| GET | `/api/users/:hash/stats` | 使用者統計 + 獎勵點數 | User Hash |

### 管理 API

| Method | Path | 說明 | 認證 |
|--------|------|------|------|
| POST | `/api/knowledge/upsert` | 新增/更新知識庫條目 | Admin Key |
| GET | `/api/monitoring/usage` | 用量追蹤 (neurons/vectorize/storage) | Admin Key |

---

## 資料流

```
Crawler (每 2h) ──POST /api/articles/batch──→ Workers
                                                ├→ Workers AI: bge-m3 嵌入標題
                                                ├→ Vectorize: 查詢知識庫 (topK=5)
                                                ├→ R2: 存文章全文 (articles/{date}/{id}.json)
                                                └→ D1: 存文章索引 + 知識關聯

Client (PWA) ──GET /api/articles/latest──→ Workers
                                           └→ D1: 查詢文章列表

Client ──GET /api/articles/:id/knowledge──→ Workers
                                            └→ 回傳預查詢的知識條目

Client ──POST /api/analyses──→ Workers
                                ├→ Quality Gates 4層驗證
                                ├→ D1: 存分析結果
                                └→ D1: 更新獎勵點數
```

---

## R2 儲存路徑規範

```
r2-bucket/
├── articles/
│   ├── 2026-03-07/
│   │   ├── {article_id}.json     # 文章全文 + metadata
│   │   └── ...
│   └── 2026-03-08/
│       └── ...
└── knowledge/
    └── versions/
        └── v1.json               # 知識庫快照 (備份用)
```

---

## D1 表結構

```sql
-- 文章索引
CREATE TABLE articles (
  article_id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  author TEXT,
  source TEXT NOT NULL,
  primary_url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  crawled_at TEXT NOT NULL,
  filter_score REAL,
  matched_topic TEXT,
  char_count INTEGER,
  r2_path TEXT NOT NULL,
  embedding_status TEXT DEFAULT 'pending',
  knowledge_ids TEXT,  -- JSON array of matched knowledge IDs
  created_at TEXT DEFAULT (datetime('now'))
);

-- 分析結果
CREATE TABLE analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  bias_score INTEGER,
  bias_category TEXT,
  controversy_score INTEGER,
  controversy_level TEXT,
  reasoning TEXT,
  key_phrases TEXT,  -- JSON array
  quality_gate_result TEXT NOT NULL,
  quality_scores TEXT,  -- JSON
  prompt_version TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES articles(article_id),
  UNIQUE(article_id, user_hash)
);

-- 使用者
CREATE TABLE users (
  user_hash TEXT PRIMARY KEY,
  total_points REAL DEFAULT 0,
  contribution_count INTEGER DEFAULT 0,
  vote_rights INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 爬蟲運行紀錄
CREATE TABLE crawler_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL,
  total_crawled INTEGER,
  filtered_count INTEGER,
  pushed_count INTEGER,
  failed_count INTEGER,
  duration_seconds REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX idx_articles_published ON articles(published_at);
CREATE INDEX idx_articles_source ON articles(source);
CREATE INDEX idx_analyses_article ON analyses(article_id);
CREATE INDEX idx_analyses_user ON analyses(user_hash);
```

---

## Vectorize 設定

```
Index name: powerreader-knowledge
Dimensions: 1024 (bge-m3)
Metric: cosine
Namespace: default

查詢設定:
- topK: 5
- 最低 score 閾值: 0.4
- returnMetadata: true
- returnValues: false
```

---

## 安全設定

| 項目 | 設定 |
|------|------|
| Crawler API Key | Workers environment variable `CRAWLER_API_KEY` |
| Admin API Key | Workers environment variable `ADMIN_API_KEY` |
| CORS | 允許 PowerReader Pages domain |
| Rate Limit | Workers 自帶 100K/天 + 自訂 per-user 限制 |

---

## 免費額度監控閾值

| 服務 | 告警閾值 (80%) | 動作 |
|------|---------------|------|
| Workers AI neurons | 8,000/天 | 通知管理員 |
| Vectorize 查詢 | 24M/月 | 考慮降頻 |
| R2 儲存 | 8GB | 考慮歸檔策略 |
| D1 儲存 | 4GB | 清理舊資料 |
| Actions 分鐘 | 1,600/月 | 優化 run time |

---

## 變更紀錄

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2026-03-06 | 骨架版本 |
| v2.0 | 2026-03-07 | 完整 Cloudflare 全棧架構: Workers + AI + Vectorize + R2 + D1 + API 設計 |

**文件維護者**: T01 (System Architecture Team)
**最後更新**: 2026-03-07
