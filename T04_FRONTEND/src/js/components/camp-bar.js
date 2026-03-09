/**
 * PowerReader - Camp Ratio Bar Component
 *
 * Horizontal stacked bar showing green/white/blue/gray proportions.
 * Colors: green=#2E7D32 (pan-green), white=#757575 (neutral),
 *         blue=#1565C0 (pan-blue), gray=#BDBDBD (non-political).
 *
 * Inlined from shared/enums.js CAMP_COLORS (cross-directory import forbidden).
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

// Inlined from shared/enums.js CAMP_COLORS (cannot import from shared/)
const CAMP_COLORS = {
  green: '#2E7D32',
  white: '#757575',
  blue: '#1565C0',
  gray: '#BDBDBD'
};

const CAMP_ORDER = ['green', 'white', 'blue', 'gray'];

const CAMP_LABELS = {
  green: '泛綠',
  white: '中立',
  blue: '泛藍',
  gray: '非政治'
};

/**
 * Create a camp ratio stacked bar element.
 *
 * @param {{ green: number, white: number, blue: number, gray: number }} ratio
 *   Values 0-100, sum should be 100.
 * @returns {HTMLElement} Camp bar wrapper element
 */
export function createCampBar(ratio) {
  if (!ratio) return document.createElement('div');

  const wrapper = document.createElement('div');
  wrapper.className = 'camp-bar-wrapper';

  // Heading
  const heading = document.createElement('h4');
  heading.className = 'camp-bar__heading';
  heading.textContent = '陣營比例';
  wrapper.appendChild(heading);

  // Stacked bar
  const bar = document.createElement('div');
  bar.className = 'camp-bar';
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `陣營比例：泛綠 ${ratio.green}%、中立 ${ratio.white}%、泛藍 ${ratio.blue}%、非政治 ${ratio.gray}%`);

  for (const camp of CAMP_ORDER) {
    const pct = ratio[camp];
    if (pct <= 0) continue;

    const segment = document.createElement('div');
    segment.className = `camp-bar__segment camp-bar__segment--${camp}`;
    segment.style.width = `${pct}%`;
    segment.style.backgroundColor = CAMP_COLORS[camp];

    // Show percentage label if segment is wide enough
    if (pct >= 12) {
      segment.textContent = `${pct}%`;
    }

    segment.setAttribute('title', `${CAMP_LABELS[camp] || camp}: ${pct}%`);
    bar.appendChild(segment);
  }

  wrapper.appendChild(bar);

  // Legend row
  const legend = document.createElement('div');
  legend.className = 'camp-bar__legend';

  for (const camp of CAMP_ORDER) {
    const pct = ratio[camp];
    if (pct <= 0) continue;

    const item = document.createElement('span');
    item.className = 'camp-bar__legend-item';

    const dot = document.createElement('span');
    dot.className = `camp-bar__legend-dot camp-bar__legend-dot--${camp}`;
    dot.style.backgroundColor = CAMP_COLORS[camp];

    const label = document.createElement('span');
    label.textContent = `${CAMP_LABELS[camp] || camp} ${pct}%`;

    item.appendChild(dot);
    item.appendChild(label);
    legend.appendChild(item);
  }

  wrapper.appendChild(legend);

  return wrapper;
}

/**
 * Create a compact camp indicator (for article cards).
 *
 * @param {{ green: number, white: number, blue: number, gray: number }} ratio
 * @returns {HTMLElement} Compact camp element
 */
export function createCampIndicator(ratio) {
  if (!ratio) return document.createElement('span');

  // Find dominant camp
  let dominant = 'gray';
  let maxVal = 0;
  for (const camp of CAMP_ORDER) {
    if (ratio[camp] > maxVal) {
      maxVal = ratio[camp];
      dominant = camp;
    }
  }

  const el = document.createElement('span');
  el.className = `camp-indicator camp-indicator--${dominant}`;
  el.textContent = CAMP_LABELS[dominant] || dominant;
  el.setAttribute('aria-label', `陣營比例：泛綠 ${ratio.green}%、中立 ${ratio.white}%、泛藍 ${ratio.blue}%、非政治 ${ratio.gray}%`);

  return el;
}
