/**
 * zh-TW Locale - Traditional Chinese (Taiwan)
 *
 * SSOT for all UI strings in the application.
 * Import this file instead of hardcoding Chinese strings.
 *
 * Usage:
 *   import { t } from '../locale/zh-TW.js';
 *   element.textContent = t('bias.label.center'); // "中立"
 *   element.textContent = t('common.label.source_count', { count: 3 }); // "來源: 3 家媒體"
 */

const messages = {
  // ==============================================
  // Bias Labels (shared/enums.js BIAS_CATEGORIES)
  // ==============================================
  'bias.label.extreme_left': '極左',
  'bias.label.left': '偏左',
  'bias.label.center_left': '中間偏左',
  'bias.label.center': '中立',
  'bias.label.center_right': '中間偏右',
  'bias.label.right': '偏右',
  'bias.label.extreme_right': '極右',

  // ==============================================
  // Controversy Labels (shared/enums.js CONTROVERSY_LEVELS)
  // ==============================================
  'controversy.label.low': '低',
  'controversy.label.moderate': '中等',
  'controversy.label.high': '高',
  'controversy.label.very_high': '極高',

  // Controversy Badges
  'controversy.badge.low': '低度爭議',
  'controversy.badge.moderate': '中等爭議',
  'controversy.badge.high': '高度爭議',
  'controversy.badge.very_high': '極高爭議',

  // ==============================================
  // Camp Labels (三營陣 — shared/enums.js CAMP_TYPES)
  // ==============================================
  'camp.bar.title': '陣營比例',
  'camp.label.green': '泛綠',
  'camp.label.white': '中立',
  'camp.label.blue': '泛藍',
  'camp.label.gray': '非政治',

  // ==============================================
  // News Categories (shared/enums.js NEWS_CATEGORIES)
  // ==============================================
  'category.label.politics': '政治',
  'category.label.economy': '經濟',
  'category.label.society': '社會',
  'category.label.technology': '科技',
  'category.label.international': '國際',
  'category.label.entertainment': '娛樂',
  'category.label.sports': '體育',
  'category.label.health': '健康',
  'category.label.education': '教育',
  'category.label.environment': '環境',

  // ==============================================
  // News Source Names (shared/enums.js NEWS_SOURCES)
  // ==============================================
  'source.name.liberty_times': '自由時報',
  'source.name.taiwan_apple_daily': '蘋果日報',
  'source.name.china_times': '中國時報',
  'source.name.united_daily_news': '聯合報',
  'source.name.common_wealth': '天下雜誌',
  'source.name.business_weekly': '商業週刊',
  'source.name.the_news_lens': '關鍵評論網',
  'source.name.the_reporter': '報導者',
  'source.name.cna': '中央社',
  'source.name.pts': '公視新聞',
  'source.name.economic_daily_news': '經濟日報',
  'source.name.commercial_times': '工商時報',
  'source.name.inside': 'Inside',
  'source.name.technews': '科技新報',
  'source.name.ithome': 'iThome',
  'source.name.rew_causas': '新新聞',
  'source.name.storm_media': '風傳媒',

  // Chinese source keys (used by D1 data from crawler)
  'source.name.自由時報': '自由時報',
  'source.name.聯合報': '聯合報',
  'source.name.中央社': '中央社',
  'source.name.三立新聞': '三立新聞',
  'source.name.ETtoday新聞雲': 'ETtoday新聞雲',
  'source.name.東森新聞': '東森新聞',
  'source.name.新頭殼': '新頭殼',
  'source.name.公視新聞': '公視新聞',
  'source.name.關鍵評論網': '關鍵評論網',
  'source.name.科技新報': '科技新報',
  'source.name.風傳媒': '風傳媒',

  // ==============================================
  // Navigation
  // ==============================================
  'nav.button.home': '首頁',
  'nav.button.compare': '比較',
  'nav.button.analyze': '分析',
  'nav.button.profile': '我的',
  'nav.button.settings': '設定',
  'nav.button.search': '搜尋',
  'nav.button.back': '返回',
  'nav.button.share': '分享',
  'nav.title.home': '今日熱門新聞',
  'nav.title.compare': '跨媒體比較',
  'nav.title.analyze': '立場分析',
  'nav.title.profile': '個人資料',
  'nav.title.settings': '設定',

  // ==============================================
  // Common Buttons & Labels
  // ==============================================
  'common.button.confirm': '確認',
  'common.button.cancel': '取消',
  'common.button.submit': '提交',
  'common.button.retry': '重試',
  'common.button.close': '關閉',
  'common.button.load_more': '載入更多',
  'common.button.view_detail': '查看詳細',
  'common.button.go_original': '前往原文',
  'common.button.start_analysis': '我要分析',
  'common.label.loading': '載入中...',
  'common.label.no_data': '暫無資料',
  'common.label.offline': '離線模式',
  'common.label.version': '版本',
  'common.label.last_update': '最後更新',
  'common.label.source_count': '來源: {count} 家媒體',
  'common.label.analyst_count': '分析: {count} 人',
  'common.label.pass_rate': '通過率: {rate}%',
  'common.label.consensus': '共識分數: {score}/100',

  // ==============================================
  // Model Management
  // ==============================================
  'model.title': '模型管理',
  'model.name': 'Qwen3-8B (q4f16)',
  'model.version_label': '版本: v{version}',
  'model.size_label': '大小: ~4.5 GB (建議 6GB+ VRAM)',
  'model.download.button': '下載模型',
  'model.download.pause': '暫停下載',
  'model.download.resume': '繼續下載',
  'model.download.progress': '已下載: {downloaded} / {total}',
  'model.download.estimate': '預估剩餘: 約 {minutes} 分鐘',
  'model.download.complete': '下載完成',
  'model.download.heading': '下載 AI 模型',
  'model.download.first_time_hint': '首次使用需下載模型 (約 4.5GB)，下載完成後將自動開始分析',
  'model.download.chunks': '區塊',
  'model.download.wifi_required': '請連接 WiFi 後再下載模型 (約 4.5 GB)',
  'model.download.low_battery': '電量不足 20%，請充電後再下載',
  'model.download.charging_required': '請接上充電器後再下載模型',
  'model.download.confirm_heading': '首次使用需下載 AI 模型',
  'model.download.confirm_desc': '分析功能需要下載約 4.5GB 的 AI 模型至瀏覽器，下載後可離線使用。建議使用 WiFi 下載。',
  'model.download.check_wifi': '網路連線',
  'model.download.check_battery': '電量充足',
  'model.download.check_storage': '儲存空間',
  'model.download.cellular_warning': '偵測到行動網路連線，下載 4.5GB 模型可能產生大量數據費用。',
  'model.download.confirm_start': '確認下載並分析',
  'model.download.confirm_anyway': '仍然下載',
  'model.delete.button': '刪除模型',
  'model.delete.confirm': '確定要刪除已下載的模型嗎？刪除後需要重新下載。',
  'model.cache.clear_all': '清除所有 AI 模型快取',
  'model.cache.clear_confirm': '將清除所有已下載的 AI 模型（包含舊版本），下次分析時會重新下載。確定嗎？',
  'model.cache.cleared': '已清除，釋放約 {mb} MB',
  'model.status.not_downloaded': '尚未下載',
  'model.status.downloaded': '已下載',
  'model.status.downloading': '下載中...',
  'model.inference.webgpu': '推理引擎: WebGPU (本地)',
  'model.inference.server': '推理引擎: 伺服器',
  'model.inference.thinking': '思考中...',
  'model.inference.analyzing': '分析結果產生中...',
  'model.storage.label': '儲存空間使用量',
  'model.inference.preparing': '正在組裝提示詞...',
  'model.inference.running': 'AI 分析中...',
  'model.inference.generating': '產生結果...',
  'model.inference.loading_model': '載入 AI 模型中... (首次約需下載 4.5GB)',
  'model.inference.loading_model_pct': '載入模型: {text}',
  'model.inference.pass1_running': 'Pass 1/2: 分數分析中...',
  'model.inference.pass1_done': 'Pass 1 完成，開始論述分析...',
  'model.inference.pass2_running': 'Pass 2/2: 論述重點分析中...',
  'model.inference.pass2_done': '分析完成',
  'model.inference.slow_hint': '分析較複雜的文章需要較長時間',
  'model.inference.timeout_offer': '分析時間較長，是否切換至伺服器模式？',
  'model.inference.switch_server': '切換至伺服器模式',

  // ==============================================
  // Reward System
  // ==============================================
  'reward.title': '我的點數',
  'reward.points_awarded': '+{points} 點',
  'reward.total_points': '總點數: {points}',
  'reward.vote_power': '投票權: {votes} 票',
  'reward.conversion_hint': '每 10 點 = 1 票',
  'reward.history.title': '貢獻歷史',
  'reward.history.date': '日期',
  'reward.history.article': '分析文章',
  'reward.history.result': '驗證結果',
  'reward.status.pending': '待驗證',
  'reward.status.earned': '已獲得',
  'reward.status.rejected': '未通過',
  'reward.status.claimed': '已使用',
  'reward.cooldown.active': '分析功能暫時停用',
  'reward.cooldown.remaining': '剩餘等待時間: {minutes} 分鐘',
  'reward.cooldown.reason': '連續 3 次未通過品質驗證，已暫停分析功能 1 小時',

  // ==============================================
  // PWA Strings
  // ==============================================
  'pwa.install.prompt': '將台灣新聞立場分析加入主畫面，獲得更好的使用體驗',
  'pwa.install.button': '加入主畫面',
  'pwa.install.dismiss': '稍後再說',
  'pwa.offline.banner': '目前處於離線模式 - 已快取的內容仍可瀏覽，分析結果將於上線後自動提交',
  'pwa.update.available': '有新版本可用',
  'pwa.update.button': '立即更新',
  'pwa.sync.pending': '有 {count} 筆資料待同步',
  'pwa.sync.complete': '同步完成',
  'pwa.sync.failed': '同步失敗，將於稍後重試',
  'pwa.sync.saved_offline': '已保存，連線後自動提交',
  'pwa.sync.failed_permanent': '同步失敗次數過多，此筆資料需手動重新提交',
  'pwa.sync.retry_button': '重新提交',
  'pwa.sync.discard_button': '捨棄',

  // ==============================================
  // Error Messages (client-facing)
  // ==============================================
  'error.message.validation': '輸入資料格式錯誤，請檢查後重試',
  'error.message.not_found': '找不到請求的資源',
  'error.message.rate_limit': '請求過於頻繁，請稍後再試',
  'error.message.unauthorized': '未授權，請先登入',
  'error.message.generic': '系統錯誤，請稍後再試',

  // Frontend-specific errors
  'error.network.offline': '網路連線中斷，請檢查網路設定',
  'error.network.timeout': '連線逾時，請稍後再試',
  'error.network.slow': '網路速度較慢，載入可能需要較長時間',
  'error.storage.full': '儲存空間已滿，請清理快取後重試',
  'error.storage.denied': '無法存取本地儲存，請檢查瀏覽器設定',
  'error.model.not_downloaded': '尚未下載分析模型，請先至設定頁面下載',
  'error.model.load_failed': '模型載入失敗，請重新下載',
  'error.model.inference_failed': '分析失敗，正在切換至伺服器模式...',
  'error.webgpu.not_supported': '您的裝置不支援 WebGPU，將使用 WASM 模式',
  'error.wasm.not_supported': '您的瀏覽器不支援 WASM，將使用伺服器模式',
  'error.browser.outdated': '您的瀏覽器版本過舊，建議更新至最新版本',
  'error.sync.max_retries': '同步失敗次數過多，此筆資料已放棄提交',
  'error.article.not_cached': '此文章尚未快取，請在連線時重新載入',
  'error.webllm.model_not_found': '分析模型載入失敗，請確認瀏覽器支援 WebGPU 並重新整理頁面',

  // ==============================================
  // Quality Gate Feedback
  // ==============================================
  'quality.failed_format': '分析結果格式異常，請重新分析',
  'quality.failed_range': '分析結果包含無效數值，請重新分析',
  'quality.failed_consistency': '您的分析與過往紀錄差異較大，請重新審視後再提交',
  'quality.failed_duplicate': '此文章已完成分析，或已達分析次數上限',

  // ==============================================
  // Article Deadline
  // ==============================================
  'analyze.already_in_queue': '此文章正在分析中',
  'analyze.queue_busy_warning': '目前有其他文章正在分析，請稍後再試',
  'analyze.select_prompt': '請從首頁選擇一篇文章進行分析',
  'analyze.result_preview': '分析結果預覽',
  'analyze.reasoning': '分析推理',
  'analyze.narrative_points': '論述重點',
  'analyze.key_phrases': '關鍵詞',
  'analyze.submit_success': '分析已成功提交',
  'analyze.transparency.toggle': '查看分析依據',
  'analyze.transparency.l1_title': '系統分析框架',
  'analyze.transparency.l1_desc': 'AI 依照預設的台灣政治光譜定義 (0=泛綠 ~ 100=泛藍) 與爭議度量表進行量化評分，再以論述分析框架產生重點摘要。',
  'analyze.transparency.l2_title': '背景知識注入',
  'analyze.transparency.l2_desc': '以下知識條目在分析時被注入給 AI 作為參考依據，AI 自行判斷哪些與本文相關。',
  'analyze.transparency.l2_empty': '本次分析未使用額外背景知識。',
  'analyze.transparency.l3_title': '原始文章',
  'analyze.transparency.l3_desc': '新聞原文 (標題 + 摘要 + 內文) 作為分析輸入，截取前 {chars} 字。',
  'analyze.transparency.knowledge_ref': '參考知識',
  'article.knowledge.title': 'AI 參考知識',
  'article.knowledge.summary': 'AI 參考知識 ({count} 項)',
  'article.deadline.remaining': '可分析剩餘時間: {hours} 小時',
  'article.deadline.expired': '已截止分析',
  'article.deadline.warning': '即將截止 (剩餘 {hours} 小時)',

  // Article Auto-Analysis
  'article.analyze.waiting': '準備分析中...',
  'article.analyze.queued': '排隊等待中 (第 {position} 順位)...',

  // Auto-Analysis Prerequisites
  'auto_analysis.error.no_webgpu': '您的瀏覽器不支援 WebGPU，無法執行本地分析',
  'auto_analysis.error.vram_insufficient': 'GPU 記憶體不足，建議使用 6GB 以上顯存的電腦',
  'auto_analysis.error.benchmark_needed': '請先至設定頁執行效能測試，確認 GPU 能力',
  'auto_analysis.consent.title': '自動分析說明',
  'auto_analysis.consent.desc': 'PowerReader 會使用您的 GPU 自動分析文章立場。過程約 15 秒，完全在您的裝置上執行，不會上傳原文。',
  'auto_analysis.consent.confirm': '了解，開始分析',
  'auto_analysis.download.size_hint': '模型大小: 約 4.5GB',

  // ==============================================
  // Article Status Labels
  // ==============================================
  'article.status.crawled': '已抓取',
  'article.status.tokenized': '已分詞',
  'article.status.deduplicated': '已去重',
  'article.status.analyzed': '已分析',
  'article.status.validated': '已驗證',
  'article.status.published': '已發布',
  'article.status.rejected': '未通過',
  'article.status.duplicate': '重複文章',

  // ==============================================
  // Compare Page
  // ==============================================
  'compare.desc': '同一事件，不同媒體的報導角度比較',
  'compare.table_label': '各媒體立場比較表',
  'compare.spread': '立場分歧: {spread} 分',

  // ==============================================
  // Blindspot Page (v2.0)
  // ==============================================
  'nav.button.blindspot': '盲區',
  'nav.title.blindspot': '報導盲區',
  'blindspot.desc': '偵測只有單一陣營媒體報導的事件，揭示資訊盲區',
  'blindspot.filter.all': '全部',
  'blindspot.filter.green_only': '僅泛綠報導',
  'blindspot.filter.blue_only': '僅泛藍報導',
  'blindspot.filter.white_missing': '缺乏中立報導',
  'blindspot.filter.imbalanced': '報導失衡',
  'blindspot.type.green_only': '僅泛綠報導',
  'blindspot.type.blue_only': '僅泛藍報導',
  'blindspot.type.white_missing': '缺乏中立報導',
  'blindspot.type.imbalanced': '報導失衡',
  'blindspot.missing_camp': '缺少{camp}觀點',
  'blindspot.camp.pan_green': '泛綠',
  'blindspot.camp.pan_blue': '泛藍',
  'blindspot.camp.pan_white': '中立',
  'blindspot.article_count': '{count} 篇報導',
  'blindspot.source_count': '{count} 家媒體',
  'blindspot.detected_at': '偵測時間',
  'blindspot.empty': '目前沒有偵測到報導盲區',

  // ==============================================
  // Source Tendency (v2.0)
  // ==============================================
  'source.tendency.title': '媒體傾向',
  'source.tendency.desc': '根據近 30 天報導的立場分數滾動平均，動態推導各媒體傾向',
  'source.tendency.avg_score': '平均分數',
  'source.tendency.sample_count': '樣本數',
  'source.tendency.confidence.high': '高信心度',
  'source.tendency.confidence.mid': '中信心度',
  'source.tendency.confidence.low': '低信心度',
  'source.tendency.camp.pan_green': '偏泛綠',
  'source.tendency.camp.pan_white': '中立',
  'source.tendency.camp.pan_blue': '偏泛藍',
  'source.tendency.window': '近 {days} 天',
  'source.tendency.trend_title': '月度趨勢',
  'source.tendency.recent_title': '近期文章',
  'source.tendency.distribution': '陣營分布',

  // ==============================================
  // Auto Runner
  // ==============================================
  'auto_runner.title': '自動分析',
  'auto_runner.mode.auto': '自動模式',
  'auto_runner.mode.manual': '手動模式',
  'auto_runner.start': '開始自動分析',
  'auto_runner.stop': '停止',
  'auto_runner.pause': '暫停',
  'auto_runner.resume': '繼續',
  'auto_runner.paused': '已暫停',
  'auto_runner.stopping': '停止中...',
  'auto_runner.force_stop': '強制停止',
  'auto_runner.status.running': '自動分析進行中',
  'auto_runner.status.pausing': '暫停中 ({seconds}s)',
  'auto_runner.status.stopped': '已停止',
  'auto_runner.status.idle': '閒置',
  'auto_runner.progress.analyzed': '已分析',
  'auto_runner.progress.skipped': '跳過',
  'auto_runner.progress.failed': '失敗',
  'auto_runner.error.not_logged_in': '請先登入才能使用自動分析',
  'auto_runner.error.model_not_ready': '請先下載 AI 模型',
  'auto_runner.error.consecutive_failures': '連續失敗 {count} 次，已自動停止',
  'auto_runner.error.rate_limited': '伺服器限流，已自動停止',
  'auto_runner.error.mobile_blocked': '行動裝置不支援自動分析，請使用手動分析',
  'auto_runner.error.no_articles': '沒有可分析的文章',
  'auto_runner.last_run': '上次結果: {analyzed} 篇分析, {skipped} 篇跳過, {failed} 篇失敗',
  'auto_runner.override_button': '手動分析此文章',
  'auto_runner.auto_in_progress': '自動分析進行中',
  'settings.analysis_mode.title': '分析模式',

  // ==============================================
  // Settings Page — Hardware Detection
  // ==============================================
  'settings.hw.title': '硬體偵測',
  'settings.hw.gpu_info': 'GPU 資訊',
  'settings.hw.webgpu_supported': 'WebGPU 支援',
  'settings.hw.webgpu_yes': '支援',
  'settings.hw.webgpu_no': '不支援',
  'settings.hw.gpu_vendor': 'GPU 廠商',
  'settings.hw.gpu_arch': 'GPU 架構',
  'settings.hw.gpu_device': 'GPU 裝置',
  'settings.hw.vram': '顯存',
  'settings.hw.vram_unknown': '未知',
  'settings.hw.vram_shared': '共用系統記憶體',
  'settings.hw.vram_ref': '(參考規格)',
  'settings.hw.vram_by_model': '(依型號)',
  'settings.hw.vram_confirmed': '(使用者確認)',
  'settings.hw.gpu_picker_btn': '確認我的 GPU 型號',
  'settings.hw.gpu_picker_change': '變更 GPU 型號',
  'settings.hw.gpu_picker_hint': '查詢方法：按 Ctrl+Shift+Esc 開啟工作管理員 → 效能 → GPU，即可看到 GPU 型號',
  'settings.hw.gpu_picker_placeholder': '-- 請選擇你的 GPU --',
  'settings.hw.gpu_picker_save': '確認',
  'settings.hw.gpu_picker_no_options': '無法提供選項',
  'settings.hw.bench_title': '效能測試結果',
  'settings.hw.bench_tier': '效能等級',
  'settings.hw.bench_latency': '推理延遲',
  'settings.hw.bench_time': '測試時間',
  'settings.hw.bench_none': '尚未執行效能測試',
  'settings.hw.mode_gpu': 'GPU 模式 (高速)',
  'settings.hw.mode_cpu': 'CPU 模式 (標準)',
  'settings.hw.mode_none': '無法本地推理',
  'settings.hw.btn_redetect': '重新偵測硬體',
  'settings.hw.btn_benchmark': '執行效能測試',
  'settings.hw.btn_benchmarking': '測試中...',
  'settings.hw.stage_init': '正在初始化...',
  'settings.hw.stage_scanning': '正在掃描 GPU...',
  'settings.hw.stage_loading': '正在載入模型...',
  'settings.hw.stage_running': '正在執行推理測試...',
  'settings.hw.stage_done': '測試完成',
  'settings.hw.stage_error': '測試失敗',
  'settings.hw.error_prefix': '測試失敗: {message}',
  'settings.hw.device_type': '裝置類型',
  'settings.hw.browser': '瀏覽器',
  'settings.hw.browser_unknown': '無法偵測',
  'settings.hw.browser_privacy_hint': '可能受瀏覽器隱私設定影響，偵測結果僅供參考',

  // Device detection
  'device.type.mobile': '行動裝置',
  'device.type.desktop': '桌面電腦',
  'device.mobile_warning': '行動裝置記憶體不足，本地推理已停用，將使用伺服器模式分析',
  'device.browser_hint': '建議使用 Chrome 113 以上版本以獲得最佳體驗',
  'device.browser_firefox_hint': 'Firefox 需手動啟用 WebGPU (dom.webgpu.enabled)',
  'device.browser_safari_hint': 'Safari 暫不支援 WebGPU',

  // ==============================================
  // Settings Page — Cache / Display / About
  // ==============================================
  'settings.cache.title': '快取管理',
  'settings.cache.usage': '儲存空間: {used} MB / {total} MB',
  'settings.cache.articles': '已快取 {count} 篇文章',
  'settings.cache.clear': '清除快取',
  'settings.cache.clear_confirm': '確定要清除所有快取的文章嗎？',
  'settings.notifications.title': '通知設定',
  'settings.notifications.push': '推播通知',
  'settings.notifications.daily_digest': '每日摘要推播',
  'settings.notifications.denied_hint': '通知權限已被瀏覽器封鎖，請至瀏覽器設定中開啟',
  'settings.display.title': '顯示設定',
  'settings.display.roc_calendar': '民國紀年',
  'settings.display.roc_calendar_hint': '在政府相關新聞中顯示民國年 (例: 民國115年)',
  'settings.about.title': '關於',
  'settings.about.app_name': '應用程式',
  'settings.about.license': '授權條款',
  'settings.about.locale': '語言',

  // ==============================================
  // Profile Page
  // ==============================================
  'profile.anonymous': '匿名使用者',
  'profile.role.anonymous': '訪客',
  'profile.role.contributor': '貢獻者',
  'profile.role.verified': '已驗證',
  'profile.role.admin': '管理員',
  'profile.kpi.total_points': '總點數',
  'profile.kpi.vote_rights': '投票權',
  'profile.kpi.contributions': '貢獻次數',
  'profile.kpi.daily_analyses': '今日分析',
  'profile.last_contribution': '最後貢獻: {date}',
  'profile.trend.title': '近 30 天貢獻趨勢',
  'profile.actions.title': '帳號管理',
  'profile.actions.export': '匯出我的資料',
  'profile.actions.delete': '刪除帳號',
  'profile.actions.delete_confirm': '確定要刪除您的帳號嗎？此操作無法復原。',
  'profile.actions.delete_confirm_final': '最後確認：刪除帳號後，所有點數和貢獻紀錄將永久移除。確定要繼續嗎？',

  // ==============================================
  // Login & Auth
  // ==============================================
  'login.prompt': '請先登入以參與分析',
  'login.google_oauth': '使用 Google 帳號登入',
  'login.anonymous_browse': '先瀏覽看看',
  'login.success': '登入成功',
  'login.failed': '登入失敗，請稍後再試',
  'login.logout': '登出',
  'login.logout_confirm': '確定要登出嗎？',

  // ==============================================
  // Onboarding (4 steps)
  // ==============================================
  'onboarding.step1.title': '歡迎使用新聞立場分析',
  'onboarding.step1.desc': '透過公民算力，分析台灣新聞媒體的報導立場',
  'onboarding.step2.title': '認識立場光譜',
  'onboarding.step2.desc': '光譜左側代表泛綠立場，右側代表泛藍立場，中間為中立',
  'onboarding.step3.title': 'AI 本地分析',
  'onboarding.step3.desc': '下載 AI 模型後，分析完全在您的裝置上進行，資料不會外洩',
  'onboarding.step4.title': '開始使用',
  'onboarding.step4.desc': '瀏覽今日新聞，或立即開始您的第一次分析',
  'onboarding.button.next': '下一步',
  'onboarding.button.skip': '略過',
  'onboarding.button.start': '開始使用',

  // ==============================================
  // Privacy Consent
  // ==============================================
  'privacy.consent.title': '隱私政策同意',
  'privacy.consent.checkbox': '我已閱讀並同意隱私政策',
  'privacy.consent.link': '查看完整隱私政策',
  'privacy.consent.required': '需要同意隱私政策才能繼續',
  'privacy.consent.button': '同意並繼續',

  // ==============================================
  // LINE Bot Strings
  // ==============================================
  'line.header.daily': '今日熱門新聞',
  'line.header.alert': '高度爭議新聞提醒',
  'line.button.detail': '查看詳細分析',
  'line.button.compare': '跨媒體比較',
  'line.footer.source_count': '共 {count} 家媒體報導',
  'line.footer.powered_by': '由公民算力驅動',

  // ==============================================
  // Browser Extension Strings
  // ==============================================
  'ext.badge.analyzing': '分析中',
  'ext.badge.score': '{score}',
  'ext.popup.title': '立場分析結果',
  'ext.popup.bias_label': '立場: {category}',
  'ext.popup.controversy': '爭議: {level}',
  'ext.popup.compare': '查看其他媒體報導',
  'ext.popup.not_supported': '不支援此網站',
  'ext.popup.loading': '正在分析...',
  'ext.context_menu.analyze': '使用公民算力分析此文章',

  // ==============================================
  // Feedback & Reports (v2.1)
  // ==============================================
  'feedback.like': '有幫助',
  'feedback.dislike': '沒幫助',
  'feedback.liked': '已按讚',
  'feedback.disliked': '已按倒讚',
  'feedback.login_required': '請先登入才能回饋',
  'feedback.submit_success': '感謝您的回饋',
  'feedback.submit_error': '回饋提交失敗，請稍後再試',
  'feedback.already_submitted': '您已提交過回饋',

  'report.button': '檢舉',
  'report.title': '檢舉內容',
  'report.reason.inaccurate': '內容不正確',
  'report.reason.biased': '明顯偏頗',
  'report.reason.spam': '垃圾訊息',
  'report.reason.offensive': '冒犯性內容',
  'report.reason.other': '其他',
  'report.description_placeholder': '補充說明（選填）',
  'report.submit': '提交檢舉',
  'report.cancel': '取消',
  'report.success': '檢舉已提交，感謝您的回報',
  'report.error': '檢舉提交失敗，請稍後再試',
  'report.duplicate': '您已檢舉過此內容',
  'report.login_required': '請先登入才能檢舉',

  // ==============================================
  // Search (v2.1)
  // ==============================================
  'search.placeholder': '搜尋新聞...',
  'search.button': '搜尋',
  'search.clear': '清除',
  'search.no_results': '找不到相關新聞',
  'search.results_count': '找到 {count} 篇相關新聞',
  'search.error': '搜尋失敗，請稍後再試',
  'search.min_length': '請輸入至少 2 個字',

  // ==============================================
  // Accessibility (a11y)
  // ==============================================
  // Navigation
  'a11y.nav.main': '主要導航',
  'a11y.nav.bottom': '底部導航列',
  'a11y.nav.skip_to_content': '跳至主要內容',
  'a11y.nav.breadcrumb': '麵包屑導航',

  // Bias visualization
  'a11y.bias_bar': '立場分析光譜條，分數 {score}，分類 {category}',
  'a11y.bias_bar.left_end': '光譜左端，代表泛綠立場',
  'a11y.bias_bar.right_end': '光譜右端，代表泛藍立場',
  'a11y.bias_bar.indicator': '目前立場指標位於分數 {score}，屬於{category}',

  // Camp ratio
  'a11y.camp_bar': '陣營比例：泛綠 {green}%、中立 {white}%、泛藍 {blue}%、非政治 {gray}%',

  // Controversy
  'a11y.controversy_bar': '爭議程度指標，分數 {score}，等級 {level}',
  'a11y.controversy_badge': '爭議程度標籤: {level}',

  // Article cards
  'a11y.article_card': '新聞文章: {title}，來源: {source}，發布於 {date}',
  'a11y.article_card.bias': '立場分析: {category} (分數 {score})',
  'a11y.article_card.controversy': '爭議程度: {level}',

  // Buttons
  'a11y.button.analyze': '開始分析此文章的立場',
  'a11y.button.share': '分享此分析結果',
  'a11y.button.go_original': '在新視窗開啟原文連結',
  'a11y.button.install_pwa': '將此應用程式加入主畫面',
  'a11y.button.download_model': '下載 AI 分析模型，檔案大小約 4.5 GB',
  'a11y.button.delete_model': '刪除已下載的 AI 分析模型',

  // Forms
  'a11y.search.input': '搜尋新聞文章',
  'a11y.search.clear': '清除搜尋條件',
  'a11y.filter.category': '依新聞分類篩選',
  'a11y.filter.source': '依新聞來源篩選',
  'a11y.filter.controversy': '依爭議程度篩選',

  // Status
  'a11y.status.loading': '內容載入中，請稍候',
  'a11y.status.offline': '目前處於離線模式',
  'a11y.status.sync_pending': '有待同步的資料',
  'a11y.status.model_downloading': '模型下載中，進度 {percent}%',

  // Charts
  'a11y.chart.bias_spectrum': '跨媒體立場光譜比較圖',
  'a11y.chart.controversy_trend': '爭議程度趨勢圖',
  'a11y.chart.points_trend': '點數趨勢折線圖，近 30 天',
  'a11y.chart.radar': '各面向差異雷達圖',

  // Notifications
  'a11y.notification.success': '成功: {message}',
  'a11y.notification.error': '錯誤: {message}',
  'a11y.notification.warning': '警告: {message}',
  'a11y.notification.info': '資訊: {message}'
};

/**
 * Translation function with interpolation support.
 *
 * @param {string} key - i18n key (e.g. 'bias.label.center')
 * @param {Object} [params] - interpolation params (e.g. { count: 3 })
 * @returns {string} translated string, or the key itself if not found
 */
export function t(key, params = {}) {
  let msg = messages[key];

  if (!msg) {
    console.warn(`[i18n] Missing key: ${key}`);
    return key;
  }

  // Interpolation: replace {param} patterns with provided values
  for (const [k, v] of Object.entries(params)) {
    msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }

  return msg;
}

export default messages;
