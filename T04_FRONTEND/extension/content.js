/**
 * PowerReader Extension - Content Script
 *
 * Injected into supported Taiwan news sites.
 * Detects article pages and notifies the background worker.
 */

(function () {
  'use strict';

  // Avoid running in iframes
  if (window.self !== window.top) return;

  // Detect if current page is a news article
  const url = window.location.href;

  // Notify background service worker
  chrome.runtime.sendMessage({
    type: 'article-detected',
    url: url,
    title: document.title
  });
})();
