# 跨團隊請求: 品質門失敗的使用者回饋訊息定義

| 欄位 | 值 |
|------|---|
| **狀態** | ✅ COMPLETED |
| **來源團隊** | M01 |
| **目標團隊** | T03, T04, T06 |
| **優先級** | 🔴 HIGH |
| **建立時間** | 2026-03-06 18:33 |
| **期限** | T03 Phase 3 / T04 Phase 3 開始前 |
| **關聯文件** | T03/QUALITY_GATES.md, T06/ERROR_HANDLING.md, T04/UI_LOCALIZATION.md |

## 請求內容

### 問題

品質驗證有 4 種失敗類型，但使用者全部看到同一句「輸入資料格式錯誤，請檢查後重試」。

T03 定義了 4 種失敗碼:
- `failed_format` — JSON 格式或欄位錯誤
- `failed_range` — 分數超出範圍
- `failed_consistency` — 與過往分析差異過大
- `failed_duplicate` — 重複提交

T06 ERROR_HANDLING.md 只有通用的 `validation_error` → 同一句錯誤訊息。
T04 UI_LOCALIZATION.md 沒有品質門專屬的 i18n key。

### 建議

**T06**: 在 ERROR_HANDLING.md 新增品質門專屬錯誤類型（不洩漏內部邏輯，但給予使用者可操作的提示）：

| 失敗碼 | 使用者訊息 |
|--------|-----------|
| `failed_format` | 分析結果格式異常，請重新分析 |
| `failed_range` | 分析結果包含無效數值，請重新分析 |
| `failed_consistency` | 您的分析與過往紀錄差異較大，請重新審視後再提交 |
| `failed_duplicate` | 此文章已完成分析，或已達分析次數上限 |

**T04**: 在 UI_LOCALIZATION.md 新增對應的 i18n key:
- `quality.failed_format`, `quality.failed_range`, `quality.failed_consistency`, `quality.failed_duplicate`

**T03**: 確認 API 回應的 `error.type` 欄位會使用這 4 個失敗碼

### 需要三方回覆

1. T06: 確認上述訊息是否符合「不洩漏內部資訊」原則？
2. T04: 確認將新增對應 i18n key？
3. T03: 確認 API 回傳格式？

---

## 回應區

**T03 回應**:
Confirmed. T03's quality gate pipeline already returns structured error responses with the `quality_gate_result` field containing one of:
- `failed_format` (Layer 1 failure)
- `failed_range` (Layer 2 failure)
- `failed_consistency` (Layer 3 failure)
- `failed_duplicate` (Layer 4 failure)
- `passed` (all layers passed)

The API response will include:
```json
{
  "success": false,
  "error": {
    "type": "failed_format",
    "message": "Quality gate validation failed"
  }
}
```

T03 will NOT include detailed internal reasons (e.g., exact z-scores) in the API response -- those are logged server-side only. The `error.type` code maps to T06's user-facing messages.

**回應時間**: 2026-03-07

**T04 回應**: Confirmed. Will add quality.failed_format, quality.failed_range, quality.failed_consistency, quality.failed_duplicate i18n keys to UI_LOCALIZATION.md. — 2026-03-07
**T06 回應**: 🔵 ACKNOWLEDGED (2026-03-07). All 4 proposed user-facing messages reviewed and **APPROVED**. They comply with the "no internal info leakage" principle: (1) `failed_format` — does not expose JSON schema details; (2) `failed_range` — does not expose valid score range boundaries; (3) `failed_consistency` — does not expose comparison threshold or algorithm; (4) `failed_duplicate` — does not expose exact submission count limit. T06 will update ERROR_HANDLING.md (SSOT) to include these 4 quality gate error types.

---

## 完成確認

- [x] T06 已更新 ERROR_HANDLING.md (v1.1, 2026-03-07)
- [x] T04 已更新 — i18n keys added to locale/zh-TW.js (quality.failed_format/range/consistency/duplicate)
- [x] T03 已確認 API 回傳格式
- [x] 狀態已改為 ✅ COMPLETED
