# 跨團隊請求: 品質門 vs 防作弊門編號命名統一

| 欄位 | 值 |
|------|---|
| **狀態** | 🔵 ACKNOWLEDGED |
| **來源團隊** | M01 |
| **目標團隊** | T03, T05 |
| **優先級** | 🟡 MEDIUM |
| **建立時間** | 2026-03-06 18:02 |
| **期限** | T03 Phase 3 / T05 Phase 2 開始前 |
| **關聯文件** | T03/QUALITY_GATES.md, T05/REWARD_MECHANISM.md, T05/PHASE_PLAN.md Phase 2 |

## 請求內容

### 問題

目前有兩套「4 層驗證」使用相似的編號系統，容易混淆：

**T03 品質驗證 (Quality Layers)**:
- Layer 1: Format Validation（格式）
- Layer 2: Range Validation（範圍）
- Layer 3: Consistency Validation（一致性）
- Layer 4: Duplicate Validation（重複）

**T05 防作弊閘門 (Anti-Gaming Gates)**:
- Gate 1: Daily Limit（每日上限 50 次）
- Gate 2: Min Analysis Time（最短 5 秒）
- Gate 3: Consistency（= T03 Layer 3，非 T05 職責）
- Gate 4: Sybil/OAuth（= T06 職責，非 T05 職責）

REWARD_MECHANISM.md 的點數生命週期流程圖將兩者混合稱為「四層品質驗證」，但實際上 T05 只負責 Gate 1-2，Gate 3-4 不是 T05 的。

### 思考

1. 兩套系統功能不重疊 — T03 驗證分析品質，T05 防作弊行為
2. 問題在於命名和編號相撞，Agent 獨立工作時可能搞混
3. 執行順序也需要明確：先過 T05 防作弊 → 再過 T03 品質驗證（先擋作弊節省 T03 的 KV 讀取）

### 建議決策

**1. 統一命名**

| 舊名 | 新名 | 負責團隊 |
|------|------|---------|
| T05 Gate 1-2 | **Pre-Check Gate A: Daily Limit** / **Pre-Check Gate B: Min Time** | T05 |
| T03 Layer 1-4 | **Quality Layer 1-4**（維持不變） | T03 |

**2. 統一執行順序**

```
提交分析
  → T05 Pre-Check A (daily limit)
  → T05 Pre-Check B (min time)
  → T03 Quality Layer 1 (format)
  → T03 Quality Layer 2 (range)
  → T03 Quality Layer 3 (consistency)
  → T03 Quality Layer 4 (duplicate)
  → PASS → T05 發放 0.1 點
```

**3. 移除 T05 的 Gate 3/4**

T05 PHASE_PLAN Phase 2 已正確標註 "Gate 3/4 owned by T03/T06, not T05"，但 REWARD_MECHANISM.md 的流程圖需要同步更新，將 Gate 3/4 拆出。

### 需要 T03 + T05 回覆

1. 是否同意改名為 Pre-Check + Quality Layer？
2. 是否同意執行順序：T05 pre-check 先於 T03 quality layers？
3. 請各自更新文件：T03 → QUALITY_GATES.md，T05 → REWARD_MECHANISM.md

## 參考資料

- T03/QUALITY_GATES.md L24-39: 4 層驗證架構
- T05/REWARD_MECHANISM.md L47-97: 點數生命週期流程圖
- T05/PHASE_PLAN.md Phase 2: "Gate 3/4 owned by T03/T06, not T05"

---

## 回應區 (由 T03 / T05 填寫)

**T03 回應**:
Acknowledged. T03 agrees with all three proposals:
1. Agree to rename: T05 gates -> "Pre-Check Gate A/B", T03 layers remain "Quality Layer 1-4"
2. Agree to execution order: T05 Pre-Check A/B -> T03 Quality Layer 1-4 (short-circuits save D1 reads)
3. T03 will update QUALITY_GATES.md to reference the unified naming and execution order

Note: QUALITY_GATES.md already uses "Layer 1-4" naming, so minimal changes needed on T03 side. Will add a section clarifying the Pre-Check -> Quality Layer pipeline.

**回應時間**: 2026-03-07

**T05 回應**:
Acknowledged. T05 agrees with all three proposals:
1. Agree to rename: T05 gates → "Pre-Check A/B/C/D" (A=Daily Limit, B=Min Time, C=Article Dedup, D=Content-Hash Dedup). Note: T05 has added Pre-Check C (article_id dedup) and Pre-Check D (content_hash dedup per T06 security fix) beyond the original A/B.
2. Agree to execution order: T05 Pre-Check A→B→C→D → T03 Quality Layer 1→2→3→4 (short-circuits save downstream KV reads)
3. T05 has updated REWARD_MECHANISM.md flow diagram and anti-gaming table to use Pre-Check naming. Code comments in `src/points.js` already use Pre-Check A/B/C/D naming.

**回應時間**: 2026-03-07

---

## 完成確認

- [ ] T03 已更新 QUALITY_GATES.md 命名
- [x] T05 已更新 REWARD_MECHANISM.md 流程圖
- [ ] 執行順序已寫入兩份文件
- [ ] 狀態已改為 ✅ COMPLETED
