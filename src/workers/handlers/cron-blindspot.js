/**
 * Cron: Blindspot Detection + Source Tendency
 *
 * Called from index.js scheduled handler.
 * - scanBlindspots: hourly, scans recent clusters for camp imbalance
 * - updateSourceTendency: daily (hour=0), recalculates 30-day rolling avg per source
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

// Inlined from shared/config.js THREE_CAMP (Workers can import shared/, but kept inline for clarity)
const BLINDSPOT_DOMINANT_PCT = 0.8;
const BLINDSPOT_IMBALANCE_PCT = 0.7;
const BLINDSPOT_MIN_ARTICLES = 3;

const THREE_CAMP = {
  GREEN_MAX: 40,
  BLUE_MIN: 60,
  MIN_SAMPLES: 10,
  TENDENCY_WINDOW_DAYS: 30
};

// Inlined blindspot type constants
const BLINDSPOT_TYPES = {
  GREEN_ONLY: 'green_only',
  BLUE_ONLY: 'blue_only',
  WHITE_MISSING: 'white_missing',
  IMBALANCED: 'imbalanced'
};

/**
 * Detect blindspot type from camp counts.
 * Mirror of shared/enums.js detectBlindspot().
 */
function detectBlindspot(campCounts) {
  const total = campCounts.green + campCounts.white + campCounts.blue;
  if (total === 0) return null;

  const greenPct = campCounts.green / total;
  const bluePct = campCounts.blue / total;
  const whitePct = campCounts.white / total;

  if (greenPct >= BLINDSPOT_DOMINANT_PCT && campCounts.blue === 0) return BLINDSPOT_TYPES.GREEN_ONLY;
  if (bluePct >= BLINDSPOT_DOMINANT_PCT && campCounts.green === 0) return BLINDSPOT_TYPES.BLUE_ONLY;
  if (whitePct === 0 && total >= 3) return BLINDSPOT_TYPES.WHITE_MISSING;
  if (greenPct >= BLINDSPOT_IMBALANCE_PCT || bluePct >= BLINDSPOT_IMBALANCE_PCT) return BLINDSPOT_TYPES.IMBALANCED;

  return null;
}

/**
 * Get camp from bias_score. Mirror of shared/enums.js getCampFromScore() (simplified).
 */
function getCamp(biasScore) {
  if (biasScore <= THREE_CAMP.GREEN_MAX) return 'green';
  if (biasScore >= THREE_CAMP.BLUE_MIN) return 'blue';
  return 'white';
}

/**
 * Derive missing camp label from blindspot type.
 */
function getMissingCamp(type) {
  if (type === BLINDSPOT_TYPES.GREEN_ONLY) return 'pan_blue';
  if (type === BLINDSPOT_TYPES.BLUE_ONLY) return 'pan_green';
  if (type === BLINDSPOT_TYPES.WHITE_MISSING) return 'pan_white';
  return null;
}

// ========================================
// Title bigram Jaccard (CJK, same as articles.js)
// ========================================
const CLUSTER_JACCARD_THRESHOLD = 0.45;

function titleBigrams(title) {
  if (!title) return new Set();
  const clean = title.replace(/[\s\p{P}\p{S}]/gu, '');
  const bigrams = new Set();
  for (let i = 0; i < clean.length - 1; i++) {
    bigrams.add(clean.slice(i, i + 2));
  }
  return bigrams;
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Scan recent articles and detect blindspot events.
 * Strategy: cluster articles by title similarity (Jaccard >=0.45, ±48h),
 * then check camp distribution per cluster.
 */
export async function scanBlindspots(env) {
  // Fetch articles from last 48h that have bias_score
  const rows = await env.DB.prepare(`
    SELECT article_id, title, source, bias_score, published_at
    FROM articles
    WHERE bias_score IS NOT NULL
      AND datetime(published_at) >= datetime('now', '-2 days')
    ORDER BY published_at DESC
    LIMIT 500
  `).all();

  const articles = rows.results || [];
  if (articles.length < BLINDSPOT_MIN_ARTICLES) return;

  // Build clusters using greedy title similarity
  const clusters = buildClusters(articles);

  // Evaluate each cluster for blindspot
  for (const cluster of clusters) {
    if (cluster.articles.length < BLINDSPOT_MIN_ARTICLES) continue;

    const campCounts = { green: 0, white: 0, blue: 0 };
    const sources = new Set();

    for (const art of cluster.articles) {
      const camp = getCamp(art.bias_score);
      campCounts[camp]++;
      sources.add(art.source);
    }

    const blindspotType = detectBlindspot(campCounts);
    if (!blindspotType) continue;

    // Upsert into blindspot_events
    const clusterId = `bs_${hashCluster(cluster.articles[0].title)}`;
    await env.DB.prepare(`
      INSERT INTO blindspot_events
        (cluster_id, representative_title, blindspot_type, camp_distribution,
         missing_camp, article_count, source_count, detected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(cluster_id) DO UPDATE SET
        blindspot_type = excluded.blindspot_type,
        camp_distribution = excluded.camp_distribution,
        missing_camp = excluded.missing_camp,
        article_count = excluded.article_count,
        source_count = excluded.source_count,
        detected_at = excluded.detected_at
    `).bind(
      clusterId,
      cluster.articles[0].title,
      blindspotType,
      JSON.stringify(campCounts),
      getMissingCamp(blindspotType),
      cluster.articles.length,
      sources.size
    ).run();
  }

  // Clean up old events (>7 days)
  await env.DB.prepare(
    "DELETE FROM blindspot_events WHERE datetime(detected_at) < datetime('now', '-7 days')"
  ).run().catch(() => {});
}

/**
 * Build clusters from articles using greedy title bigram Jaccard.
 */
function buildClusters(articles) {
  const assigned = new Set();
  const clusters = [];

  for (let i = 0; i < articles.length; i++) {
    if (assigned.has(i)) continue;

    const cluster = { articles: [articles[i]] };
    assigned.add(i);
    const seedBigrams = titleBigrams(articles[i].title);

    for (let j = i + 1; j < articles.length; j++) {
      if (assigned.has(j)) continue;

      const sim = jaccardSimilarity(seedBigrams, titleBigrams(articles[j].title));
      if (sim >= CLUSTER_JACCARD_THRESHOLD) {
        cluster.articles.push(articles[j]);
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Simple hash for cluster ID generation (deterministic from title).
 */
function hashCluster(title) {
  let hash = 0;
  for (let i = 0; i < (title || '').length; i++) {
    const chr = title.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Update source tendency table with 30-day rolling average.
 * Called daily at midnight UTC.
 */
export async function updateSourceTendency(env) {
  const { TENDENCY_WINDOW_DAYS, MIN_SAMPLES, GREEN_MAX, BLUE_MIN } = THREE_CAMP;

  // Compute 30-day AVG(bias_score) and COUNT per source
  // TENDENCY_WINDOW_DAYS is a hardcoded constant (30), safe for template literal
  const windowModifier = `-${TENDENCY_WINDOW_DAYS} days`;
  const rows = await env.DB.prepare(`
    SELECT
      source,
      AVG(bias_score) AS avg_bias,
      COUNT(*) AS sample_count
    FROM articles
    WHERE bias_score IS NOT NULL
      AND datetime(published_at) >= datetime('now', ?)
    GROUP BY source
    HAVING sample_count >= 1
  `).bind(windowModifier).all();

  for (const row of (rows.results || [])) {
    const avgBias = row.avg_bias;
    const sampleCount = row.sample_count;

    // Determine camp from average
    let camp;
    if (avgBias <= GREEN_MAX) camp = 'pan_green';
    else if (avgBias >= BLUE_MIN) camp = 'pan_blue';
    else camp = 'pan_white';

    // Confidence level
    let confidence;
    if (sampleCount >= 30) confidence = 'high';
    else if (sampleCount >= MIN_SAMPLES) confidence = 'mid';
    else confidence = 'low';

    // Upsert
    await env.DB.prepare(`
      INSERT INTO source_tendency (source, avg_bias_score, camp, sample_count, confidence, window_days, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(source) DO UPDATE SET
        avg_bias_score = excluded.avg_bias_score,
        camp = excluded.camp,
        sample_count = excluded.sample_count,
        confidence = excluded.confidence,
        last_updated = excluded.last_updated
    `).bind(
      row.source, avgBias, camp, sampleCount, confidence, TENDENCY_WINDOW_DAYS
    ).run();
  }
}
