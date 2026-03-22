<script>
  import Card from '$lib/components/ui/Card.svelte';
</script>

<div class="privacy-page">
  <header class="page-header">
    <h1 class="page-title">隱私與條款</h1>
    <p class="last-updated">最後更新：2026 年 3 月 22 日</p>
  </header>

  <!-- ═══ Privacy Policy ═══ -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">shield</span>
      隱私政策
    </h2>
    <Card variant="filled">
      <div class="policy-content">
        <p class="policy-text legal-basis">
          本平台依據《個人資料保護法》第 8 條告知義務，向使用者說明個人資料之蒐集、處理及利用方式。
        </p>

        <h3 class="sub-title">平台收集資訊</h3>
        <p class="policy-text">
          依《個人資料保護法》第 19 條，平台基於「與當事人有契約或類似契約之關係」及「經當事人同意」之合法事由，蒐集以下資訊：
        </p>
        <ul class="policy-list">
          <li>Google 帳號基本資訊（名稱、頭像），用於識別貢獻者身分</li>
          <li>新聞偏見分析結果（偏見分數、立場判斷），用於建立公民新聞資料庫</li>
          <li>裝置 GPU 型號資訊（僅於使用者主動同意後取得），用於最佳化分析體驗</li>
        </ul>

        <h3 class="sub-title">平台不會收集</h3>
        <ul class="policy-list">
          <li>GPS 定位或地理位置</li>
          <li>瀏覽紀錄或搜尋紀錄</li>
          <li>個人檔案、照片或文件</li>
          <li>通訊錄或社群帳號資訊</li>
          <li>新聞原文內容（原文僅在使用者裝置上處理，不上傳至伺服器）</li>
        </ul>

        <h3 class="sub-title">技術架構與 WebGPU 隱私</h3>
        <p class="policy-text">
          本平台使用瀏覽器內建的 WebGPU 技術執行 AI 分析，整個運算過程發生在使用者的瀏覽器沙盒內：
        </p>
        <ul class="policy-list">
          <li><strong>完全隔離：</strong>瀏覽器安全沙盒會將 WebGPU 運算與作業系統完全隔離，平台無法存取檔案系統、其他應用程式，或瀏覽器以外的任何資源</li>
          <li><strong>不寫入硬碟：</strong>AI 模型僅下載至瀏覽器暫存記憶體中執行，不會在硬碟上安裝或寫入任何檔案</li>
          <li><strong>關閉即停止：</strong>關閉分頁或瀏覽器後，所有模型資料和 GPU 運算會立即釋放，不會在背景繼續執行</li>
          <li><strong>資源不共享：</strong>GPU 算力完全屬於使用者自己，不會被分配給其他使用者或用於其他用途。這不是分散式運算——每個人獨立在自己的裝置上運行</li>
          <li><strong>GPU 無法外洩隱私：</strong>GPU 處理過程受到瀏覽器同源政策保護，運算資料不會離開瀏覽器環境，也無法被其他網站或程式讀取</li>
        </ul>
        <p class="policy-text">
          分析完成後，僅有使用者主動提交的結果（偏見分數、立場判斷）會上傳至平台，原始新聞內容不會離開使用者的裝置。
        </p>

        <h3 class="sub-title">資料儲存與保護</h3>
        <p class="policy-text">
          分析結果儲存於 Cloudflare 基礎設施，以匿名雜湊值識別貢獻者。平台不會將 Google 帳號資訊與分析結果直接關聯後公開揭露。依《個人資料保護法》第 27 條，平台採取適當安全措施防止個人資料被竊取、竄改、毀損、滅失或洩漏。
        </p>

        <h3 class="sub-title">資料刪除</h3>
        <p class="policy-text">
          依《個人資料保護法》第 3 條，使用者就其個人資料享有查詢、請求閱覽、請求製給複製本、請求補充或更正、請求停止蒐集處理利用及請求刪除之權利。使用者可隨時於設定頁面選擇「刪除帳號」，系統將永久移除所有帳號資訊與分析紀錄，刪除後無法復原。
        </p>
      </div>
    </Card>
  </section>

  <!-- ═══ News Sources & Copyright ═══ -->
  <section class="section">
    <h2 class="section-title">
      <span class="material-symbols-outlined section-icon">newspaper</span>
      新聞來源與著作權聲明
    </h2>
    <Card variant="filled">
      <div class="policy-content">
        <h3 class="sub-title">新聞內容權利歸屬</h3>
        <p class="policy-text">
          本平台顯示之所有新聞標題、連結均來自公開發表之新聞報導，其著作權歸屬原始新聞媒體及其作者所有。本平台不儲存、不重製、不公開傳輸任何新聞原文內容。
        </p>

        <h3 class="sub-title">平台避免侵權的技術設計</h3>
        <p class="policy-text">
          本平台在技術架構上極力避免觸及著作權法之紅線，具體措施如下：
        </p>
        <ul class="policy-list">
          <li><strong>不重製原文：</strong>平台不複製、不儲存、不顯示新聞全文或摘要。使用者點擊標題將直接跳轉至原始新聞網頁，流量歸屬原始媒體</li>
          <li><strong>不公開傳輸：</strong>新聞原文僅在使用者自行瀏覽器內由 AI 模型處理，處理過程不經過平台伺服器，平台不涉及《著作權法》第 26 條之 1 所定之公開傳輸行為</li>
          <li><strong>僅產出分析結論：</strong>平台所儲存與展示的僅為 AI 生成之獨立分析結論（偏見分數、陣營比例、情緒強度等數值指標），不包含原著作之表達，屬於對新聞報導之評論與研究性質之衍生資訊</li>
          <li><strong>標題連結方式：</strong>平台僅以新聞標題作為超連結錨點導向原始報導，依司法實務見解，單純提供超連結行為不構成著作之重製或公開傳輸</li>
        </ul>

        <h3 class="sub-title">合理使用依據</h3>
        <p class="policy-text">
          本平台之分析功能係基於以下法律基礎運作：
        </p>
        <ul class="policy-list">
          <li>《著作權法》第 52 條：為報導、評論、教學、研究或其他正當目的之必要，在合理範圍內，得引用已公開發表之著作</li>
          <li>《著作權法》第 65 條第 2 項：著作之合理使用，應審酌「利用之目的及性質」、「著作之性質」、「所利用之質量及其在整個著作中所占之比例」、「利用結果對著作潛在市場與現在價值之影響」等四項判斷基準</li>
          <li>《著作權法》第 49 條：以網路或其他方法為時事報導者，在報導之必要範圍內，得利用其報導過程中所接觸之著作</li>
        </ul>
        <p class="policy-text">
          本平台不以營利為目的，分析結果為轉化性使用（transformative use），不替代原始著作之閱讀體驗，亦不影響原始媒體之潛在市場。若任何著作權人認為平台之使用方式有侵權疑慮，請透過平台提供之聯絡方式通知，平台將於合理期間內處理。
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
        <h3 class="sub-title">服務性質</h3>
        <ul class="policy-list">
          <li>本平台為非營利開源專案，原始碼以 AGPL-3.0 授權釋出</li>
          <li>AI 分析結果僅供參考，不構成任何形式的事實認定或新聞評價</li>
          <li>新聞內容著作權歸原始媒體所有，本平台僅提供分析工具，不提供新聞內容</li>
          <li>使用者貢獻的分析結果以 AGPL-3.0 授權釋出，供公眾使用</li>
        </ul>

        <h3 class="sub-title">禁止行為</h3>
        <ul class="policy-list">
          <li>惡意提交錯誤或虛假的分析結果</li>
          <li>攻擊、干擾或試圖破壞平台運作</li>
          <li>未經授權將分析資料用於商業用途</li>
          <li>冒充他人身分或偽造貢獻紀錄</li>
          <li>利用平台爬取、重製或散布新聞原文內容</li>
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
          <li>新聞來源之正確性、即時性及完整性，由原始媒體負責，與本平台無關</li>
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
  .last-updated {
    margin: 4px 0 0 0;
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    padding-left: 21px;
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
  .policy-text.legal-basis {
    padding: 12px 16px;
    background: var(--md-sys-color-surface-container-low);
    border-left: 3px solid var(--md-sys-color-outline);
    font-style: italic;
  }
</style>
