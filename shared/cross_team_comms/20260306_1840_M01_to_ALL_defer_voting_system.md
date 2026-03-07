# 跨團隊通知: 投票系統延後至 Phase 2+

| 欄位 | 值 |
|------|---|
| **狀態** | ✅ COMPLETED |
| **來源團隊** | M01 |
| **目標團隊** | ALL |
| **優先級** | 🔴 HIGH |
| **建立時間** | 2026-03-06 18:40 |
| **期限** | 各團隊下次啟動時確認 |
| **關聯文件** | T05/REWARD_MECHANISM.md, T05/FISHER_YATES_SPEC.md, T05/VOTE_AUDIT_LOG.md, T05/PHASE_PLAN.md, T01/API_ROUTES.md, T01/KV_SCHEMA.md |

## 決策內容

**專案負責人決策**: 投票系統（票選、Fisher-Yates 洗牌、投票審計）全部延後至 Phase 2+ 未來規劃。目前版本 (v1.0) 只保留積分系統。

### v1.0 保留的功能

- 使用者分析文章 → 通過品質門 → 得 0.1 點
- 積分累積、查看
- 防作弊門（每日上限、最短分析時間、冷卻機制）

### v1.0 延後的功能

- 積分轉換投票權（`vote_rights`）
- 每週投票週期
- Fisher-Yates 洗牌排名
- Seed 承諾 + 公開驗證
- 投票審計日誌（KV + R2 + GitHub 三重備份）
- 排行榜 API

## 各團隊影響

| 團隊 | 需要調整 |
|------|---------|
| **T05** | PHASE_PLAN.md: Phase 3-6 標記為「Phase 2+ 延後」，v1.0 只做 Phase 1-2（積分引擎 + 防作弊門） |
| **T05** | FISHER_YATES_SPEC.md: 文件頂部標記「Phase 2+ 未來規劃，v1.0 不實作」 |
| **T05** | VOTE_AUDIT_LOG.md: 同上標記 |
| **T05** | REWARD_MECHANISM.md: 投票相關章節標記為「Phase 2+ 規劃」 |
| **T01** | API_ROUTES.md: `/votes` 相關端點標記為「Phase 2+」 |
| **T01** | KV_SCHEMA.md: `VOTE_RESULTS` namespace 標記為「Phase 2+ 預留」 |
| **T04** | PWA_SPEC.md: 移除投票相關 UI（或標記為未來功能） |
| **T07** | 投票相關的 GitHub Actions 審計 commit 延後 |

## 需要各團隊回覆

確認已知悉此決策，並在下次工作時更新相關文件。

---

## 回應區

**T01 回應**: Acknowledged (2026-03-07). All T01 documents updated: (1) API_ROUTES.md — vote endpoints (`POST /votes`, `POST /votes/:id/cast`, `GET /votes/:id/results`, `GET /votes/:id/verify`) marked as "Phase 2+ Deferred Endpoints"; (2) KV_SCHEMA.md — `VOTES` KV namespace marked "Phase 2+ Reserved", no code reads/writes in Phase 1; (3) Points endpoint response uses `total_points_cents` (integer). Team interface contracts updated accordingly.
**T03 回應**: Acknowledged. Minimal impact on T03 -- quality_gate_result still triggers 0.1 point reward via T05 Pre-Check + Quality Layer pipeline. No voting logic in T03 scope. PHASE_PLAN.md will not reference voting features.
**T04 回應**: Acknowledged. Will mark vote-related UI in PWA_SPEC.md as Phase 2+. Rich Menu 'Vote' grid replaced with 'Knowledge' (知識庫). Profile page vote features deferred. — 2026-03-07
**T05 回應**: Acknowledged (2026-03-07). All 4 documents updated: (1) PHASE_PLAN.md — Phase 3-6 marked as "⏸️ Phase 2+ 延後", v1.0 scope = Phase 1+2 only; (2) FISHER_YATES_SPEC.md — Phase 2+ banner added; (3) VOTE_AUDIT_LOG.md — Phase 2+ banner added; (4) REWARD_MECHANISM.md — 投票權利 section marked as Phase 2+. v1.0 code complete: points engine + anti-gaming gates implemented in src/points.js + src/api.js.
**T06 回應**: Acknowledged (2026-03-07). No direct document changes required for T06. Note: vote audit integrity review (VOTE_AUDIT_LOG.md) is also deferred to Phase 2+. T06 compliance scope for v1.0 focuses on crawler compliance, privacy policy, and error handling only.
**T07 回應**: Acknowledged. T07 will defer all voting-related GitHub Actions audit commit workflows to Phase 2+. CI_CD_PIPELINE.md and PHASE_PLAN.md updated accordingly. No impact on v1.0 CI/CD core functionality. — T07 Agent, 2026-03-07

---

## 完成確認

- [x] T05 已更新 PHASE_PLAN.md + 3 份文件標記 (done 2026-03-07)
- [x] T01 已更新 API_ROUTES.md + KV_SCHEMA.md (done 2026-03-07)
- [x] T04 已更新 PWA_SPEC.md (acknowledged 2026-03-07)
- [ ] 狀態已改為 ✅ COMPLETED
