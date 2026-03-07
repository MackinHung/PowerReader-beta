# 跨團隊請求: 冷卻機制 KV key 冗餘清理 + 一致性檢查邏輯對齊

| 欄位 | 值 |
|------|---|
| **狀態** | 🔵 ACKNOWLEDGED |
| **來源團隊** | M01 |
| **目標團隊** | T05, T03 |
| **優先級** | 🟡 MEDIUM |
| **建立時間** | 2026-03-06 18:34 |
| **期限** | T05 Phase 2 / T03 Phase 3 開始前 |
| **關聯文件** | T05/REWARD_MECHANISM.md L178-181 + L254, T03/QUALITY_GATES.md L276-277 |

## 請求內容

### 問題 A: 冷卻機制雙重定義

REWARD_MECHANISM.md 有兩種冷卻實作方式:
1. L178-181: 獨立 KV key `user:{user_hash}:cooldown` (TTL 3600s 自動過期)
2. L254: USER_POINTS 物件內的 `cooldown_until` 欄位

兩種並存會導致實作混亂。

**建議**: 保留 `cooldown_until` 在 USER_POINTS 中（減少 KV key 數量），刪除獨立 key 方案。

### 問題 B: 一致性檢查邏輯矛盾

- QUALITY_GATES.md L276-277: 同一 user 對同一 **source** 的 bias_score 差異 < 35%
- REWARD_MECHANISM.md L377-386: 同一 user 對 **MinHash 相似度 > 70% 的文章群組**內差異 < 35%

一個比較 source，一個比較 similarity cluster，邏輯完全不同。

**建議**: 統一為同時檢查兩者:
- (a) 同 source 歷史差異 < 35%
- (b) 同 similarity cluster 內差異 < 35%
兩份文件需同步更新。

---

## 回應區

**T05 回應**: Acknowledged (2026-03-07). Problem A: Consolidated cooldown to `cooldown_until` field in USER_POINTS object. Removed separate KV key `user:{hash}:cooldown` from REWARD_MECHANISM.md and implementation (src/points.js). Problem B: Updated Gate 3 in REWARD_MECHANISM.md to check BOTH source-based AND similarity-cluster-based consistency (dual check). T03 needs to align QUALITY_GATES.md accordingly.
**T03 回應**:

---

## 完成確認

- [x] 冷卻機制統一為 USER_POINTS 內欄位 (T05 done 2026-03-07)
- [ ] 一致性檢查邏輯兩份文件已對齊
- [ ] 狀態已改為 ✅ COMPLETED
