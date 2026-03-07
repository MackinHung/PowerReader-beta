/**
 * PowerReader Extension - Popup Script
 *
 * Displays bias analysis results for the current tab's article.
 * All UI strings via chrome.i18n.getMessage() — no hardcoded Chinese.
 */

/** @param {string} key */
const msg = (key, ...subs) => chrome.i18n.getMessage(key, subs);

const PWA_BASE = 'https://powerreader.pages.dev';

document.addEventListener('DOMContentLoaded', async () => {
  // Set i18n text for static elements
  document.getElementById('popup-header').textContent = msg('popup_header');
  document.getElementById('loading-state').textContent = msg('popup_loading');

  const content = document.getElementById('popup-content');

  // Get current tab URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    renderUnsupported(content);
    return;
  }

  // Request analysis from background
  chrome.runtime.sendMessage(
    { type: 'get-analysis', url: tab.url },
    (result) => {
      if (result && result.bias_score != null) {
        renderResult(content, result, tab.url);
      } else {
        renderUnsupported(content);
      }
    }
  );
});

/**
 * Get i18n bias label for a category key.
 * @param {string} category
 * @returns {string}
 */
function getBiasLabel(category) {
  const key = `bias_${category}`;
  return msg(key) || category;
}

/**
 * Get i18n controversy label for a level key.
 * @param {string} level
 * @returns {string}
 */
function getControversyLabel(level) {
  const key = `controversy_${level}`;
  return msg(key) || level;
}

/**
 * Render analysis result.
 */
function renderResult(container, data, articleUrl) {
  container.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'result-card';

  // Title
  if (data.title) {
    const title = document.createElement('p');
    title.className = 'result-title';
    title.textContent = data.title;
    card.appendChild(title);
  }

  // Bias bar row
  const biasRow = document.createElement('div');
  biasRow.className = 'bias-row';
  biasRow.setAttribute('role', 'img');
  const biasCategory = data.bias_category || 'center';
  const biasLabelText = getBiasLabel(biasCategory);
  biasRow.setAttribute('aria-label',
    msg('a11y_bias', biasLabelText, String(Math.round(data.bias_score)))
  );

  const biasLabel = document.createElement('span');
  biasLabel.className = 'bias-label';
  biasLabel.textContent = biasLabelText;
  biasRow.appendChild(biasLabel);

  const biasBar = document.createElement('div');
  biasBar.className = 'bias-bar';

  const indicator = document.createElement('div');
  indicator.className = 'bias-indicator';
  indicator.style.left = `${Math.max(0, Math.min(100, data.bias_score))}%`;
  biasBar.appendChild(indicator);
  biasRow.appendChild(biasBar);

  const biasScore = document.createElement('span');
  biasScore.className = 'bias-score';
  biasScore.textContent = String(Math.round(data.bias_score));
  biasRow.appendChild(biasScore);

  card.appendChild(biasRow);

  // Controversy badge
  if (data.controversy_level) {
    const controversyRow = document.createElement('div');
    controversyRow.className = 'controversy-row';

    const contLabel = document.createElement('span');
    contLabel.textContent = msg('controversy_label');
    controversyRow.appendChild(contLabel);

    const badge = document.createElement('span');
    badge.className = `controversy-badge controversy-badge--${data.controversy_level}`;
    badge.textContent = getControversyLabel(data.controversy_level);
    controversyRow.appendChild(badge);

    card.appendChild(controversyRow);
  }

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'popup-actions';

  const compareBtn = document.createElement('a');
  compareBtn.className = 'popup-btn popup-btn--secondary';
  compareBtn.textContent = msg('popup_compare');
  compareBtn.href = `${PWA_BASE}/#/article/${data.article_id || ''}`;
  compareBtn.target = '_blank';
  compareBtn.rel = 'noopener';
  actions.appendChild(compareBtn);

  const analyzeBtn = document.createElement('a');
  analyzeBtn.className = 'popup-btn';
  analyzeBtn.textContent = msg('popup_analyze');
  analyzeBtn.href = `${PWA_BASE}/#/analyze/${data.article_id || ''}`;
  analyzeBtn.target = '_blank';
  analyzeBtn.rel = 'noopener';
  actions.appendChild(analyzeBtn);

  card.appendChild(actions);
  container.appendChild(card);
}

/**
 * Render unsupported state.
 */
function renderUnsupported(container) {
  container.innerHTML = '';

  const el = document.createElement('div');
  el.className = 'popup-unsupported';
  el.textContent = msg('popup_unsupported');
  container.appendChild(el);

  // Link to PWA home
  const link = document.createElement('a');
  link.className = 'popup-btn';
  link.style.display = 'block';
  link.style.marginTop = '12px';
  link.textContent = msg('popup_open_pwa');
  link.href = `${PWA_BASE}/#/`;
  link.target = '_blank';
  link.rel = 'noopener';
  container.appendChild(link);
}
