# 跨團隊請求: 推理引擎遷移 Ollama → WebLLM

| 欄位 | 值 |
|------|---|
| **狀態** | ✅ COMPLETED |
| **來源團隊** | M01 (使用者決策) |
| **目標團隊** | ALL (T01, T03, T04, T07) |
| **優先級** | 🔴 HIGH |
| **建立時間** | 2026-03-08 17:00 |
| **期限** | 下次 Session |
| **關聯文件** | `memory/webllm-migration.md` (完整技術分析) |

## 決策摘要

使用者決定將推理引擎從 **Ollama (localhost CLI)** 改為 **WebLLM (@mlc-ai/web-llm, WebGPU 瀏覽器內推理)**。

核心理由：**使用者不應安裝任何東西，只需下載模型**。

同時新增 **雙 Pass 4B 架構**：同一篇文章跑 2 次 4B 模型，每次聚焦不同分析維度。

## 新決策

| # | 決策 | 值 |
|---|------|-----|
| #022 | 推理引擎 | Ollama → WebLLM (零安裝，WebGPU 瀏覽器內推理) |
| #023 | 雙 Pass 架構 | 同篇跑 2 次 4B (維度拆分) > 單次 8B |

## 各團隊影響範圍

### T01 (系統架構) — 2 檔
| 檔案 | 改動 |
|------|------|
| `CLAUDE.md` | 技術棧: Ollama → WebLLM; 中央空廚流程更新; 移除 Ollama 相關注意事項 |
| `shared/config.js` | BENCHMARK section: 移除 OLLAMA_* 參數 → 新增 WEBLLM_MODEL_ID, WEBLLM_MODEL_VRAM_MB, DUAL_PASS_ENABLED; CSP 移除 localhost:11434 |

### T03 (AI 推理) — 待定
| 檔案 | 改動 |
|------|------|
| Prompt 架構 | 設計雙 Pass 的 prompt 拆分方式 (Pass 1 提取 vs Pass 2 判斷，或按維度拆) |
| 推理設定 | 模型從 Qwen3.5-4B → Qwen3-4B-q4f16_1-MLC; think=false, t=0.5 保持 |

### T04 (前端) — 4 檔 (主要受影響)
| 檔案 | 改動 |
|------|------|
| `PWA_SPEC.md` 第 5 節 | 全面改寫: Ollama → WebLLM Service Worker; 移除安裝引導 UI; 硬體偵測改為 WebGPU 能力偵測; CSP 更新 |
| `PHASE_PLAN.md` | Phase 2: Ollama detect → WebGPU detect; Ollama API → WebLLM SW; 移除 Onboarding Ollama 步驟 |
| `docs/FEATURE_FEASIBILITY.md` | B2/B3 描述更新 |
| 前端代碼 (未來) | ollama-detect.js → webllm-engine.js; Service Worker 架構; 模型自動下載 UI |

### T07 (監控) — 1 檔
| 檔案 | 改動 |
|------|------|
| 監控基準 | Ollama 推理基準 → WebLLM 推理基準 |

### MASTER_ROADMAP.md — 1 檔
| 改動 |
|------|
| 新增決策 #022, #023; 更新 #018 (硬體偵測), #019 (CPU 支援) |

## 技術要點 (給執行者)

### WebLLM 架構
```
主分頁 (可切走)              Service Worker (背景常駐)
ServiceWorkerMLCEngine  ←→   MLCEngine (WebGPU 推理)
```
- 模型自動下載到 Cache/IndexedDB (~2GB 壓縮)
- 分頁切走不中斷推理
- OpenAI 相容 API

### 模型選擇
- **v1.0**: `Qwen3-4B-q4f16_1-MLC` (3,432 MB, WebLLM 已收錄)
- **未來**: Qwen3.5-4B (待 MLC 編譯) 或自行編譯

### 雙 Pass 架構
- 每 Pass ~7s, 總計 ~14s
- VRAM: 3.4 GB (同模型循序跑)
- Pass 拆分方式待 T03 設計 (三種方案待使用者選擇)

### 已確認不是問題
- 切分頁: Service Worker 背景常駐 ✅
- 10s watchdog: Token-by-token ~5ms/dispatch ✅
- 安全: 全公開資料，GPU side-channel 風險極低 ✅

## 參考資料

- 完整技術分析: Agent memory `memory/webllm-migration.md`
- WebLLM GitHub: https://github.com/mlc-ai/web-llm
- WebLLM 論文: https://arxiv.org/abs/2412.15803
- MLC 模型編譯: https://llm.mlc.ai/docs/compilation/compile_models.html
- WebLLM config.ts (模型清單+VRAM): https://github.com/mlc-ai/web-llm/blob/main/src/config.ts

---

## 回應區 (由目標團隊填寫)

**回應團隊**: ALL (T01, T03, T04, T07)
**回應時間**: 2026-03-08
**處理結果**: 文件全面更新完成 (13 檔)。T03 雙 Pass prompt 架構待設計。追加清理: PROMPT_VERSIONS.md, INFERENCE_PIPELINE.md, OLLAMA_SETUP.md(全面改寫), D1_MIGRATION_V2.md。

---

## 完成確認

- [x] T01: CLAUDE.md + config.js 已更新
- [ ] T03: 雙 Pass prompt 架構已設計 (待 T03 設計 prompt 拆分方式)
- [x] T04: PWA_SPEC.md + PHASE_PLAN.md + FEATURE_FEASIBILITY.md 已更新
- [x] T07: 監控基準已更新
- [x] MASTER_ROADMAP.md: 決策 #022-#023 已記錄
- [x] 狀態已改為 ✅ COMPLETED
