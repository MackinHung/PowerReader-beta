# WebLLM 設定指南 (取代 Ollama)

> PowerReader 使用 WebLLM (@mlc-ai/web-llm) 進行瀏覽器內推理。
> 零安裝：不需要下載 Ollama 或任何 CLI 工具。
> 模型透過 WebGPU API 在瀏覽器中執行，首次載入後自動快取至瀏覽器 Cache / IndexedDB。

**適用對象**: PowerReader 使用者
**維護者**: T07 (部署監控團隊)
**最後更新**: 2026-03-08

---

## 1. 系統需求

| 項目 | 最低需求 | 建議配置 |
|------|---------|---------|
| 瀏覽器 | Chrome 113+ / Edge 113+ (WebGPU 支援) | Chrome 最新穩定版 |
| GPU VRAM | 4GB (使用 fallback 模型) | 6GB+ |
| 磁碟空間 | 3GB (快取模型用) | 5GB |
| 網路 | 首次載入需下載 ~2GB 模型檔案 | 穩定寬頻 |

### 推理速度參考

| 模式 | 每篇分析時間 (單 Pass) | 備註 |
|------|----------------------|------|
| WebGPU (獨立顯卡 / 內顯) | 約 6 秒 | 建議使用 |
| WASM CPU fallback | 約 60-120 秒 | 無 WebGPU 時自動降級 |

雙 Pass 架構下，每篇文章需執行兩次推理（各聚焦不同分析維度），總時間約為上表的 2 倍。

---

## 2. 模型資訊

| 角色 | 模型 ID | 大小 | 說明 |
|------|---------|------|------|
| 主要模型 | `Qwen3-4B-q4f16_1-MLC` | 3,432 MB | 預設使用 |
| Fallback 模型 | `Qwen2.5-3B-Instruct-q4f16_1-MLC` | 2,505 MB | VRAM 不足時自動切換 |

- 模型首次載入時從 HuggingFace CDN 下載，完成後快取至瀏覽器
- 後續啟動直接從快取載入，無需重複下載
- 量化格式為 q4f16_1（4-bit 量化 + float16 KV cache），平衡品質與效能

---

## 3. 使用方式

WebLLM 為零安裝架構，使用者無需執行任何安裝步驟：

1. 開啟 PowerReader 網頁
2. 首次使用時，瀏覽器自動下載模型（顯示下載進度）
3. 模型載入完成後，即可開始分析新聞文章
4. 後續造訪時，模型從快取載入（數秒內完成）

---

## 4. 架構說明

### ServiceWorkerMLCEngine

WebLLM 使用 Service Worker 作為推理引擎的執行環境：

- **背景常駐**：模型載入至 Service Worker 後，切換分頁不會中斷推理
- **Token-by-token dispatch**：每個 token 分派間隔約 5ms，避免觸發瀏覽器 10 秒 TDR (Timeout Detection and Recovery) watchdog
- **記憶體管理**：模型生命週期由 Service Worker 管理，頁面重新整理不需重新載入模型

### 雙 Pass 架構

每篇文章執行兩次獨立推理，各聚焦不同的分析維度：

- **Pass 1**：立場傾向分析（偏綠/偏藍特徵辨識、分數評定）
- **Pass 2**：報導手法分析（框架效應、用詞選擇、資訊取捨）

兩次 4B 模型推理的綜合效果優於單次 8B 模型推理，且記憶體需求更低。

---

## 5. 常見問題

**Q: 瀏覽器顯示「WebGPU not supported」怎麼辦？**
A: 請確認使用 Chrome 113+ 或 Edge 113+。若版本正確但仍不支援，可能是 GPU 驅動過舊。請更新顯示卡驅動程式。若裝置完全不支援 WebGPU，系統會自動降級為 WASM CPU 模式（速度較慢），或使用 Server fallback（未來功能）。

**Q: 模型下載失敗怎麼辦？**
A: 模型從 HuggingFace CDN 下載，請確認：
- 網路連線正常
- 未使用封鎖 HuggingFace 的 VPN 或防火牆
- 瀏覽器允許足夠的儲存空間

重新整理頁面即可從斷點續傳。

**Q: 出現 GPU out of memory 錯誤怎麼辦？**
A: 系統會自動切換到 fallback 模型（Qwen2.5-3B，佔用更少 VRAM）。若仍不足：
- 關閉其他佔用 GPU 的程式（遊戲、影片編輯等）
- 關閉其他瀏覽器分頁
- 重新啟動瀏覽器後再試

**Q: 模型快取可以清除嗎？**
A: 可以。至瀏覽器設定 > 隱私權 > 清除瀏覽資料 > 快取的圖片和檔案。清除後下次使用時會重新下載模型。

**Q: 使用筆記型電腦時電池消耗大嗎？**
A: GPU 推理會消耗較多電力。PowerReader 在電池電量低於 20% 且未連接電源時，不會啟動推理。

**Q: WASM CPU fallback 的超時時間是多久？**
A: CPU 模式下超時設定為 120 秒。若超過會提示重試。建議關閉其他佔用 CPU 的程式以提升推理速度。

---

## 6. 開發者注意事項

### 設定檔

相關設定定義於 `shared/config.js`：

| 設定 | 說明 |
|------|------|
| `WEBLLM_MODEL_ID` | 主要模型 ID (`Qwen3-4B-q4f16_1-MLC`) |
| `WEBLLM_FALLBACK_MODEL_ID` | Fallback 模型 ID (`Qwen2.5-3B-Instruct-q4f16_1-MLC`) |

### 自訂模型編譯

若需使用自訂模型，可透過 MLC LLM 工具鏈編譯：

```bash
# 1. 轉換權重
mlc_llm convert_weight --model-type qwen3 --quantization q4f16_1

# 2. 產生設定
mlc_llm gen_config --model-type qwen3 --quantization q4f16_1

# 3. 編譯為 WebGPU 格式
mlc_llm compile --device webgpu
```

### 參考資源

- WebLLM 官方倉庫：https://github.com/mlc-ai/web-llm
- MLC LLM 文件：https://llm.mlc.ai/docs/
- WebGPU 瀏覽器支援狀態：https://caniuse.com/webgpu

---

> ⚠️ 本文件取代舊版 OLLAMA_SETUP.md (2026-03-08)。Ollama 已不再使用。
