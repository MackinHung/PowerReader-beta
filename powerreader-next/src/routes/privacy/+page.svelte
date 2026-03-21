<script>
  import Card from '$lib/components/ui/Card.svelte';
</script>

<div class="privacy-page">
  <header class="page-header">
    <h1 class="page-title">隱私與條款</h1>
  </header>

  <!-- ═══ Privacy Policy ═══ -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">shield</span>
      隱私政策
    </h2>
    <Card variant="filled">
      <div class="policy-content">
        <h3 class="sub-title">我們收集什麼</h3>
        <ul class="policy-list">
          <li>Google 帳號基本資訊（名稱、頭像），用於識別你的貢獻</li>
          <li>新聞偏見分析結果（偏見分數、立場判斷），用於建立公民新聞資料庫</li>
        </ul>

        <h3 class="sub-title">我們不收集什麼</h3>
        <ul class="policy-list">
          <li>GPS 定位或地理位置</li>
          <li>瀏覽紀錄或搜尋紀錄</li>
          <li>個人檔案、照片或文件</li>
          <li>通訊錄或社群帳號資訊</li>
        </ul>

        <h3 class="sub-title">技術架構</h3>
        <p class="policy-text">
          AI 模型完全在你的電腦上執行，平台技術上無法存取你的 GPU、記憶體或任何本機資源。你的電腦跑完分析後，只會上傳分析結果（偏見分數、立場判斷），不會上傳原始新聞內容。
        </p>

        <h3 class="sub-title">資料儲存</h3>
        <p class="policy-text">
          分析結果儲存在 Cloudflare 基礎設施上，以匿名 hash 識別貢獻者。我們不會將你的 Google 帳號資訊與分析結果直接關聯公開。
        </p>

        <h3 class="sub-title">資料刪除</h3>
        <p class="policy-text">
          你可以隨時在設定頁面選擇「刪除帳號」，系統將永久移除你的所有帳號資訊和分析紀錄。刪除後無法復原。
        </p>
      </div>
    </Card>
  </section>

  <!-- ═══ Terms of Service ═══ -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">gavel</span>
      使用條款
    </h2>
    <Card variant="filled">
      <div class="policy-content">
        <ul class="policy-list">
          <li>本平台為開源專案，原始碼以 AGPL-3.0 授權釋出</li>
          <li>AI 分析結果僅供參考，不構成任何形式的事實認定或新聞評價</li>
          <li>新聞內容著作權歸原始媒體所有，本平台僅提供分析工具</li>
          <li>使用者貢獻的分析結果以 AGPL-3.0 授權釋出，供公眾使用</li>
        </ul>

        <h3 class="sub-title">禁止行為</h3>
        <ul class="policy-list">
          <li>惡意提交錯誤或虛假的分析結果</li>
          <li>攻擊、干擾或試圖破壞平台運作</li>
          <li>未經授權將分析資料用於商業用途</li>
          <li>冒充他人身分或偽造貢獻紀錄</li>
        </ul>
      </div>
    </Card>
  </section>

  <!-- ═══ Disclaimer ═══ -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">info</span>
      免責聲明
    </h2>
    <Card variant="filled">
      <div class="policy-content">
        <ul class="policy-list">
          <li>AI 模型可能產生不準確的分析結果，分析結論不代表客觀事實</li>
          <li>本平台不對分析結果的正確性、完整性或即時性做任何擔保</li>
          <li>使用者自行承擔使用 GPU 運算的電力消耗和硬體損耗風險</li>
          <li>本平台不對任何因使用本服務造成的直接或間接損失負責</li>
          <li>本平台保留隨時修改條款和隱私政策的權利，修改後繼續使用即視為同意</li>
        </ul>
      </div>
    </Card>
  </section>
</div>

<style>
  .privacy-page {
    display: flex;
    flex-direction: column;
    gap: var(--pr-page-gap);
    padding: var(--pr-page-padding);
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .page-header {
    padding: 4px 0 12px;
  }
  .page-title {
    margin: 0;
    font: var(--md-sys-typescale-headline-medium-font);
    color: var(--md-sys-color-on-surface);
    padding-left: 16px;
    border-left: 5px solid #FF5722;
    letter-spacing: 0.01em;
  }
  .section-title {
    margin: 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 12px;
    border-left: 4px solid #FF5722;
  }
  .section-icon {
    font-size: 24px;
    color: #FF5722;
    flex-shrink: 0;
  }
  .policy-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
  }
  .sub-title {
    margin: 12px 0 4px;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
    font-weight: 600;
  }
  .sub-title:first-child {
    margin-top: 0;
  }
  .policy-list {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .policy-list li {
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.6;
  }
  .policy-text {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.6;
  }
</style>
