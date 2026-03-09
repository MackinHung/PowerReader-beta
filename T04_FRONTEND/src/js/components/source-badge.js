/**
 * PowerReader - Source Tendency Badge Component
 *
 * Renders a small badge showing a media source's dynamic tendency.
 * Used in article cards and source lists.
 * Links to source detail page (#/source/:key).
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

import { t } from '../../locale/zh-TW.js';

// Camp color map (inlined from shared/enums.js)
const CAMP_BG_COLORS = {
  pan_green: '#E8F5E9',
  pan_white: '#F5F5F5',
  pan_blue: '#E3F2FD'
};

const CAMP_TEXT_COLORS = {
  pan_green: '#2E7D32',
  pan_white: '#616161',
  pan_blue: '#1565C0'
};

/**
 * Create a source tendency badge element.
 *
 * @param {Object} sourceData - { source, camp, confidence, avg_bias_score }
 * @returns {HTMLElement} Badge element
 */
export function createSourceBadge(sourceData) {
  if (!sourceData || !sourceData.camp) return document.createElement('span');

  const badge = document.createElement('a');
  badge.className = `source-badge source-badge--${sourceData.camp}`;
  badge.href = `#/source/${encodeURIComponent(sourceData.source)}`;
  badge.style.backgroundColor = CAMP_BG_COLORS[sourceData.camp] || '#F5F5F5';
  badge.style.color = CAMP_TEXT_COLORS[sourceData.camp] || '#616161';

  const campLabel = t(`source.tendency.camp.${sourceData.camp}`);
  badge.textContent = campLabel;

  if (sourceData.confidence === 'low') {
    badge.classList.add('source-badge--low-confidence');
  }

  badge.setAttribute('title',
    `${t('source.tendency.avg_score')}: ${sourceData.avg_bias_score} | ${t(`source.tendency.confidence.${sourceData.confidence}`)}`
  );

  return badge;
}
