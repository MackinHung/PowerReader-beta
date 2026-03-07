/**
 * PowerReader Extension - Background Service Worker
 *
 * Handles:
 *   1. Context menu "Analyze this article"
 *   2. Badge text update with bias score
 *   3. Message relay between content script and popup
 */

const API_BASE = 'https://powerreader.workers.dev/api/v1';

// --------------------------------------------------
// Context menu setup
// --------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'powerreader-analyze',
    title: chrome.i18n.getMessage('context_menu_analyze'),
    contexts: ['page', 'link']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'powerreader-analyze') {
    const articleUrl = info.linkUrl || info.pageUrl;
    // Open PWA analyze page with the article URL
    const pwaUrl = `https://powerreader.pages.dev/#/analyze?url=${encodeURIComponent(articleUrl)}`;
    chrome.tabs.create({ url: pwaUrl });
  }
});

// --------------------------------------------------
// Message handling from content script
// --------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'article-detected') {
    handleArticleDetected(message.url, sender.tab);
    sendResponse({ received: true });
  }

  if (message.type === 'get-analysis') {
    fetchAnalysis(message.url).then(sendResponse);
    return true; // Keep channel open for async response
  }
});

// --------------------------------------------------
// Badge update when article is detected
// --------------------------------------------------
async function handleArticleDetected(articleUrl, tab) {
  if (!tab?.id) return;

  // Show "analyzing" badge
  chrome.action.setBadgeText({ text: '...', tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: '#1A73E8', tabId: tab.id });

  const result = await fetchAnalysis(articleUrl);

  if (result && result.bias_score != null) {
    const score = Math.round(result.bias_score);
    chrome.action.setBadgeText({ text: String(score), tabId: tab.id });

    // Color based on bias direction
    const color = getBadgeColor(result.bias_category);
    chrome.action.setBadgeBackgroundColor({ color, tabId: tab.id });
  } else {
    // No analysis available
    chrome.action.setBadgeText({ text: '', tabId: tab.id });
  }
}

// --------------------------------------------------
// API: Fetch analysis for a URL
// --------------------------------------------------
async function fetchAnalysis(articleUrl) {
  try {
    const urlHash = await sha256(articleUrl);
    const response = await fetch(`${API_BASE}/articles/${urlHash}`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return null;

    const json = await response.json();
    if (!json.success) return null;

    // Cache locally
    await chrome.storage.local.set({
      [`analysis:${urlHash}`]: {
        data: json.data,
        cached_at: Date.now()
      }
    });

    return json.data;
  } catch (err) {
    console.warn('[PowerReader] API fetch failed, trying cache:', err.message);
    const urlHash = await sha256(articleUrl);
    const cached = await chrome.storage.local.get(`analysis:${urlHash}`);
    const entry = cached[`analysis:${urlHash}`];
    if (entry && (Date.now() - entry.cached_at) < 86400000) {
      return entry.data;
    }
    return null;
  }
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------
function getBadgeColor(category) {
  const colors = {
    'extreme_left': '#1565C0',
    'left': '#1E88E5',
    'center_left': '#42A5F5',
    'center': '#9E9E9E',
    'center_right': '#EF5350',
    'right': '#E53935',
    'extreme_right': '#B71C1C'
  };
  return colors[category] || '#9E9E9E';
}

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
