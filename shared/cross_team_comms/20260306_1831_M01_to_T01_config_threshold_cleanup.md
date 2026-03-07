# 跨團隊請求: config.js 閾值常數清理

| 欄位 | 值 |
|------|---|
| **狀態** | ✅ COMPLETED |
| **來源團隊** | M01 |
| **目標團隊** | T01 |
| **優先級** | 🔴 HIGH |
| **建立時間** | 2026-03-06 18:31 |
| **期限** | T01 Phase 2 開始前 |
| **關聯文件** | shared/config.js L99-106, shared/enums.js L110-150, T04/UI_LOCALIZATION.md L142-151 |

## 請求內容

資料結構審查 + UX 審查都發現 config.js 的 bias/controversy 閾值有嚴重問題。

### 問題 1: `BIAS_SCORE_RIGHT_THRESHOLD: 15` 註解錯誤

config.js L100:
```javascript
BIAS_SCORE_RIGHT_THRESHOLD: 15,  // > 15 = extreme right
```

但 enums.js `getBiasCategory()` 定義 extreme_right 為 `score > 95`。`> 15 = extreme right` 是明顯錯誤。

### 問題 2: 閾值常數未被使用

`BIAS_SCORE_LEFT_THRESHOLD` 和 `BIAS_SCORE_RIGHT_THRESHOLD` 沒有被任何程式碼引用。`getBiasCategory()` 直接硬編碼邊界值 (5, 40, 48, 52, 60, 95)，違反 SSOT 原則。

`CONTROVERSY_LOW_THRESHOLD` 和 `CONTROVERSY_HIGH_THRESHOLD` 同樣未被使用，且缺少 MODERATE (15) 和 VERY_HIGH (50) 的閾值。

### 建議修正

**方案: 將完整邊界值集中到 config.js，enums.js 引用之**

```javascript
// config.js
export const ANALYSIS = {
  // Bias score boundaries (0-100 scale, 0=deep green, 100=deep blue)
  BIAS_BOUNDARIES: [5, 40, 48, 52, 60, 95],
  // → extreme_left | left | center_left | center | center_right | right | extreme_right

  // Controversy score boundaries
  CONTROVERSY_BOUNDARIES: [5, 15, 50],
  // → low | moderate | high | very_high
};
```

```javascript
// enums.js — getBiasCategory() 改為引用 config.js
import { ANALYSIS } from './config.js';
const [B1, B2, B3, B4, B5, B6] = ANALYSIS.BIAS_BOUNDARIES;
export function getBiasCategory(score) {
  if (score < B1) return BIAS_CATEGORIES.EXTREME_LEFT;
  // ...
}
```

刪除 `BIAS_SCORE_LEFT_THRESHOLD`, `BIAS_SCORE_RIGHT_THRESHOLD`, `CONTROVERSY_LOW_THRESHOLD`, `CONTROVERSY_HIGH_THRESHOLD` 這 4 個已廢棄的常數。

---

## 回應區 (由 T01 填寫)

**回應團隊**: T01
**回應時間**: 2026-03-07
**處理結果**: Implemented exactly as proposed. config.js now has `ANALYSIS.BIAS_BOUNDARIES: [5, 40, 48, 52, 60, 95]` and `ANALYSIS.CONTROVERSY_BOUNDARIES: [5, 15, 50]`. Removed the 4 deprecated threshold constants. enums.js `getBiasCategory()` and `getControversyLevel()` now destructure from `ANALYSIS.BIAS_BOUNDARIES` and `ANALYSIS.CONTROVERSY_BOUNDARIES` respectively, maintaining SSOT.

---

## 完成確認

- [x] config.js 閾值常數已更新 (BIAS_BOUNDARIES + CONTROVERSY_BOUNDARIES arrays)
- [x] enums.js getBiasCategory/getControversyLevel 改為引用 config.js (destructuring)
- [ ] UI_LOCALIZATION.md 確認邊界值與 config.js 一致 (T04 to verify)
- [x] 狀態已改為 ✅ COMPLETED
