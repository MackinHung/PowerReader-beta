# PowerReader — Ollama 本地推理引擎安裝指南

> 本指南說明如何在您的電腦上安裝 Ollama 並下載 Qwen3.5-4B 模型，
> 以便使用 PowerReader 進行新聞立場分析。

**適用對象**: PowerReader 使用者
**維護者**: T07 (部署監控團隊)
**最後更新**: 2026-03-07

---

## 1. 系統需求

| 項目 | 最低需求 | 建議配置 |
|------|---------|---------|
| 記憶體 (RAM) | 8GB | 16GB |
| 磁碟空間 | 5GB 可用空間 | 10GB |
| 作業系統 | Windows 10+、macOS 12+、Linux (x86_64) | - |
| GPU (非必要) | 4GB VRAM (NVIDIA CUDA 或 Apple Metal) | 6GB+ VRAM |

### GPU 與 CPU 推理速度比較

| 模式 | 每篇分析時間 |
|------|-------------|
| GPU (NVIDIA CUDA / Apple Metal) | 約 6 秒 |
| CPU only (無獨立顯卡) | 約 15-30 秒 |

沒有獨立顯卡也能正常使用，只是推理速度較慢。

---

## 2. 安裝 Ollama

### Windows

1. 前往 https://ollama.com/download/windows 下載安裝檔
2. 執行安裝程式，依照畫面指示完成安裝
3. 安裝完成後 Ollama 會自動在背景執行

### macOS

使用 Homebrew 安裝：

```bash
brew install ollama
```

或從 https://ollama.com/download/mac 下載安裝檔。

macOS 會自動偵測 Apple Metal GPU 加速，無需額外設定。

### Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

安裝完成後啟動服務：

```bash
ollama serve
```

---

## 3. 下載 Qwen3.5-4B 模型

開啟終端機（Windows: PowerShell / macOS: Terminal），執行：

```bash
ollama pull qwen3.5:4b
```

- 下載大小約 3.4GB，視網路速度需數分鐘至十數分鐘
- 首次執行時自動下載，後續使用已快取的模型
- 模型儲存位置由 Ollama 自動管理，無需手動指定路徑

---

## 4. 驗證安裝

### 確認 Ollama 服務正在執行

```bash
curl http://localhost:11434/api/tags
```

預期回應為 JSON 格式，包含已下載的模型清單。若出現連線錯誤，請確認 Ollama 已啟動。

### 測試模型推理

```bash
ollama run qwen3.5:4b "你好，請簡短回答"
```

若模型正常回應中文文字，代表安裝成功。輸入 `/bye` 離開對話模式。

---

## 5. PowerReader 整合設定

PowerReader PWA 會自動偵測本機的 Ollama 服務（`http://localhost:11434`），無需額外設定。

運作流程：

1. 開啟 PowerReader 網頁
2. PWA 自動檢查 Ollama 是否在 `localhost:11434` 上執行
3. 若偵測成功，即可開始分析新聞文章
4. 若 Ollama 未執行，畫面會顯示「請啟動 Ollama」提示

相關設定值（定義於 `shared/config.js`）：

| 設定 | 值 | 說明 |
|------|---|------|
| `MODELS.QWEN` | `qwen3.5:4b` | 使用的模型名稱 |
| `MODELS.QWEN_SIZE_MB` | `3400` | 模型大小 (MB) |
| `MODELS.QWEN_TIMEOUT_MS` | `30000` | 推理超時時間 (30 秒) |

---

## 6. 常見問題

**Q: Ollama 運行中會佔用多少記憶體？**
A: 模型載入後約佔用 4-5GB RAM。閒置時 Ollama 會自動卸載模型釋放記憶體。

**Q: 沒有 GPU 可以使用嗎？**
A: 可以。CPU 模式下推理速度較慢（約 15-30 秒），但功能完全正常。

**Q: 如何更新模型到最新版本？**
A: 重新執行下載指令即可，Ollama 會自動檢查並更新：
```bash
ollama pull qwen3.5:4b
```

**Q: 使用筆記型電腦時電池消耗大嗎？**
A: PowerReader 在電池電量低於 20% 且未連接電源時，不會啟動推理，避免電量耗盡。

**Q: 可以同時分析多篇文章嗎？**
A: 建議一次分析一篇。同時處理多篇可能導致記憶體不足 (OOM)。

**Q: 推理超時怎麼辦？**
A: PowerReader 設定 30 秒超時限制。若超過會提示重試。常見原因為 CPU 模式下系統資源不足，建議關閉其他佔用資源的程式後重試。

---

## 7. 進階設定

### 自訂連接埠

預設連接埠為 `11434`。若需更改：

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

將 `11434` 替換為您需要的連接埠號碼。

### 指定 GPU 裝置 (NVIDIA)

多張顯卡時可指定使用特定 GPU：

```bash
CUDA_VISIBLE_DEVICES=0 ollama serve
```

`0` 代表第一張顯卡，`1` 代表第二張，依此類推。

### Apple Metal (macOS)

macOS 上的 Apple Metal GPU 加速為自動偵測，無需任何設定。支援 M1/M2/M3/M4 系列晶片。

### Windows 環境變數設定

Windows 使用者若需設定環境變數，可在 PowerShell 中執行：

```powershell
$env:OLLAMA_HOST = "0.0.0.0:11434"
ollama serve
```

或透過「系統內容 > 進階 > 環境變數」進行永久設定。
