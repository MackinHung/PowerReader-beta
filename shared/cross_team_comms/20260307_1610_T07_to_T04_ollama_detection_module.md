# T07 Ollama Detection Module Ready for T04 Integration

| Field | Value |
|-------|-------|
| **Status** | ✅ COMPLETED |
| **Source Team** | T07 (Deployment & Monitoring) |
| **Target Team** | T04 (Frontend) |
| **Priority** | 🟢 LOW |
| **Created** | 2026-03-07 16:10 |
| **Deadline** | Phase 3 |
| **Related Files** | src/client/ollama-detect.js, docs/OLLAMA_SETUP.md |

## Summary

T07 has created two Phase 3 deliverables for T04 integration:

### 1. Ollama Detection Module: `src/client/ollama-detect.js` (131 lines)

Browser-side ES module that checks if Ollama + Qwen3.5-4B is available on the user's device.

**Usage:**
```javascript
import { checkOllamaStatus } from './ollama-detect.js';

const status = await checkOllamaStatus();
// status.available: boolean (Ollama is running)
// status.model_ready: boolean (qwen3.5:4b is downloaded)
// status.error: string|null (user-facing error message)

if (!status.available) {
  // Show "Please install/start Ollama" prompt
} else if (!status.model_ready) {
  // Show "Please run: ollama pull qwen3.5:4b" prompt
} else {
  // Ready for local inference
}
```

**Constants exported:**
- `OLLAMA_CONFIG.DEFAULT_ENDPOINT` = `http://localhost:11434`
- `OLLAMA_CONFIG.MODEL_NAME` = `qwen3.5:4b`
- `OLLAMA_CONFIG.MODEL_SIZE_MB` = 3400
- `OLLAMA_CONFIG.INFERENCE_TIMEOUT_MS` = 30000
- `OLLAMA_CONFIG.MIN_BATTERY_PCT` = 20

### 2. Ollama Setup Guide: `docs/OLLAMA_SETUP.md` (181 lines)

End-user installation guide in Traditional Chinese. Can be linked from the PWA "help" section.

## Action Required from T04

1. Import `ollama-detect.js` into PWA startup flow
2. Call `checkOllamaStatus()` on app load
3. Show appropriate UI based on status (install prompt, download prompt, or ready indicator)
4. Respect `OLLAMA_CONFIG.MIN_BATTERY_PCT` — don't start inference if battery < 20% and not charging

---

## Response

**T04 Response**: Integration complete. Ollama detection module copied to `T04_FRONTEND/src/js/model/ollama-detect.js` and integrated into inference fallback chain as highest priority mode (Ollama → WebGPU → WASM → Server). Changes:
1. `ollama-detect.js` — copied with error codes instead of English strings
2. `inference.js` — OLLAMA mode added, `runOllamaInference()` implemented with 3-layer prompt assembly and JSON output parsing
3. `manager.js` — `isModelDownloaded()` checks Ollama first before OPFS/IndexedDB
4. `zh-TW.js` — added `model.inference.ollama` i18n key
5. `sw.js` — added ollama-detect.js to static cache

---

## Completion

- [x] T04 has reviewed the detection module
- [x] T04 has integrated into inference fallback chain (Ollama as highest priority)
- [x] T04 manager.js checks Ollama before triggering R2 download
- [x] Status changed to COMPLETED
