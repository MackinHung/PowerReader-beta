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

// Static source-to-camp mapping based on known editorial tendency.
// Used as fallback when articles lack bias_score (no user analysis yet).
// As user analyses accumulate, bias_score takes priority over this static map.
const SOURCE_CAMP = {
  // Pan-Green (民進黨/泛綠)
  '自由時報': 'green',
  '三立新聞': 'green',
  '新頭殼': 'green',
  '匯流新聞': 'green',
  // Neutral / Center (民眾黨/中立)
  '中央社': 'white',
  '公視新聞': 'white',
  '關鍵評論網': 'white',
  '台視新聞': 'white',
  '鏡週刊': 'white',
  'iThome': 'white',
  '科技新報': 'white',
  // Pan-Blue (國民黨/泛藍)
  '聯合報': 'blue',
  'ETtoday新聞雲': 'blue',
  '東森新聞': 'blue',
  '中視新聞': 'blue',
  '風傳媒': 'white'
};

// English tokens from source names (for entity filtering in sub-clustering)
const SOURCE_NAME_TOKENS = new Set();
for (const source of Object.keys(SOURCE_CAMP)) {
  for (const m of source.matchAll(/[A-Z][a-zA-Z]+/g)) SOURCE_NAME_TOKENS.add(m[0]);
}

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
 * Get camp from source name using static mapping (fallback for unanalyzed articles).
 */
function getSourceCamp(source) {
  return SOURCE_CAMP[source] || null;
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
// Text bigram Jaccard (CJK, title + summary)
// ========================================
const CLUSTER_JACCARD_THRESHOLD = 0.09;
const MAX_CLUSTER_SIZE = 30;

function textBigrams(text) {
  if (!text) return new Set();
  const clean = text.replace(/[\s\p{P}\p{S}]/gu, '');
  const bigrams = new Set();
  for (let i = 0; i < clean.length - 1; i++) {
    bigrams.add(clean.slice(i, i + 2));
  }
  return bigrams;
}

function articleBigrams(article) {
  const combined = article.title + ' ' + (article.summary || '');
  return textBigrams(combined);
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
 * Time decay multiplier for clustering.
 * >15 days (360h): 0 (hard cutoff, never cluster).
 * Same day (≤24h): no decay. Linearly decays to 0.6 floor at 96h (4 days).
 */
function timeDecay(hoursApart) {
  if (hoursApart >= 360) return 0;
  if (hoursApart <= 24) return 1.0;
  if (hoursApart >= 96) return 0.6;
  return 1.0 - 0.4 * (hoursApart - 24) / 72;
}

/**
 * Scan recent articles and detect blindspot events.
 * Strategy: cluster articles by title+summary bigram Jaccard with time decay
 * (Union-Find, ±4 days), then check camp distribution per cluster.
 *
 * Camp determination priority:
 *   1. bias_score from user analysis (if available)
 *   2. SOURCE_CAMP static mapping (fallback for unanalyzed articles)
 */
export async function scanBlindspots(env) {
  // Fetch articles from last 4 days (extended window for time-decay clustering)
  const rows = await env.DB.prepare(`
    SELECT article_id, title, summary, source, bias_score, published_at
    FROM articles
    WHERE datetime(published_at) >= datetime('now', '-4 days')
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
      // Priority: bias_score from analysis > source static mapping
      const camp = art.bias_score != null
        ? getCamp(art.bias_score)
        : getSourceCamp(art.source);
      if (!camp) continue; // Unknown source, skip
      campCounts[camp]++;
      sources.add(art.source);
    }

    const blindspotType = detectBlindspot(campCounts);
    if (!blindspotType) continue;

    // Upsert into blindspot_events (with article_ids for drill-down)
    const clusterId = `bs_${hashCluster(cluster.articles[0].title)}`;
    const articleIds = cluster.articles.map(a => a.article_id);
    await env.DB.prepare(`
      INSERT INTO blindspot_events
        (cluster_id, representative_title, blindspot_type, camp_distribution,
         missing_camp, article_count, source_count, article_ids, detected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(cluster_id) DO UPDATE SET
        blindspot_type = excluded.blindspot_type,
        camp_distribution = excluded.camp_distribution,
        missing_camp = excluded.missing_camp,
        article_count = excluded.article_count,
        source_count = excluded.source_count,
        article_ids = excluded.article_ids,
        detected_at = excluded.detected_at
    `).bind(
      clusterId,
      cluster.articles[0].title,
      blindspotType,
      JSON.stringify(campCounts),
      getMissingCamp(blindspotType),
      cluster.articles.length,
      sources.size,
      JSON.stringify(articleIds)
    ).run();
  }

  // Clean up old events (>7 days)
  await env.DB.prepare(
    "DELETE FROM blindspot_events WHERE datetime(detected_at) < datetime('now', '-7 days')"
  ).run().catch(() => {});
}

/**
 * Build clusters from articles using Union-Find with time-weighted bigram Jaccard.
 * Union-Find captures transitive similarity (A≈B, B≈C → A,B,C in same cluster).
 * Time decay: same-day articles merge easily, older articles need stronger content overlap.
 */
function buildClusters(articles) {
  const n = articles.length;
  // 1. Pre-compute bigram sets and timestamps
  const bigrams = articles.map(a => articleBigrams(a));
  const timestamps = articles.map(a => {
    const t = new Date(a.published_at).getTime();
    return Number.isFinite(t) ? t : 0;
  });

  // 1b. Dynamic stop-bigram filtering: remove bigrams appearing in >25% of articles
  const bigramDocFreq = {};
  for (const bigs of bigrams) {
    for (const b of bigs) {
      bigramDocFreq[b] = (bigramDocFreq[b] || 0) + 1;
    }
  }
  const globalStopThreshold = Math.max(Math.ceil(n * 0.25), 5);
  const globalStopBigrams = new Set();
  for (const [b, count] of Object.entries(bigramDocFreq)) {
    if (count >= globalStopThreshold) globalStopBigrams.add(b);
  }
  const filteredBigrams = bigrams.map(bigs => {
    const filtered = new Set();
    for (const b of bigs) {
      if (!globalStopBigrams.has(b)) filtered.add(b);
    }
    return filtered;
  });

  // 2. Union-Find with path compression and union by rank
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array(n).fill(0);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(x, y) { let rx = find(x), ry = find(y); if (rx === ry) return; if (rank[rx] < rank[ry]) [rx, ry] = [ry, rx]; parent[ry] = rx; if (rank[rx] === rank[ry]) rank[rx]++; }

  // 3. O(n²) pairwise comparison → union if time-weighted Jaccard ≥ threshold
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const rawJaccard = jaccardSimilarity(filteredBigrams[i], filteredBigrams[j]);
      const hoursApart = Math.abs(timestamps[i] - timestamps[j]) / 3600000;
      if (rawJaccard * timeDecay(hoursApart) >= CLUSTER_JACCARD_THRESHOLD) {
        union(i, j);
      }
    }
  }

  // 4. Group by root
  const groups = {};
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups[root]) groups[root] = [];
    groups[root].push(articles[i]);
  }
  const result = Object.values(groups).map(arts => ({ articles: arts }));

  // Cap: re-cluster oversized groups
  return result.flatMap(cluster => {
    if (cluster.articles.length <= MAX_CLUSTER_SIZE) return [cluster];
    return reclusterStrict(cluster.articles);
  });
}

/**
 * Re-cluster oversized groups with stricter criteria.
 * Uses title-only bigrams (no summary), higher Jaccard threshold (0.15),
 * in-cluster stop-bigram filtering (30%), and no time decay.
 * Residual oversized groups are split by publication time.
 */
function reclusterStrict(articles) {
  const n = articles.length;
  // Title-only bigrams (more precise than title+summary)
  const titleBigs = articles.map(a => textBigrams(a.title || ''));

  // In-cluster stop-bigram filtering (>30%)
  const bigramCount = {};
  for (const bigs of titleBigs) {
    for (const b of bigs) {
      bigramCount[b] = (bigramCount[b] || 0) + 1;
    }
  }
  const stopThreshold = Math.ceil(n * 0.3);
  const stopBigs = new Set();
  for (const [b, count] of Object.entries(bigramCount)) {
    if (count >= stopThreshold) stopBigs.add(b);
  }
  const filtered = titleBigs.map(bigs => {
    const f = new Set();
    for (const b of bigs) {
      if (!stopBigs.has(b)) f.add(b);
    }
    return f;
  });

  // Union-Find with stricter threshold (0.15, no time decay)
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array(n).fill(0);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(x, y) { let rx = find(x), ry = find(y); if (rx === ry) return; if (rank[rx] < rank[ry]) [rx, ry] = [ry, rx]; parent[ry] = rx; if (rank[rx] === rank[ry]) rank[rx]++; }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (jaccardSimilarity(filtered[i], filtered[j]) >= 0.15) {
        union(i, j);
      }
    }
  }

  // Group by root
  const groups = {};
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups[root]) groups[root] = [];
    groups[root].push(articles[i]);
  }

  // If any group still exceeds MAX_CLUSTER_SIZE, split by time
  return Object.values(groups).flatMap(arts => {
    if (arts.length <= MAX_CLUSTER_SIZE) return [{ articles: arts }];
    arts.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
    const chunks = [];
    for (let i = 0; i < arts.length; i += MAX_CLUSTER_SIZE) {
      chunks.push({ articles: arts.slice(i, i + MAX_CLUSTER_SIZE) });
    }
    return chunks;
  });
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

// ========================================
// Sub-Clustering (Layer 2): Entity Anchor
// ========================================

const SUB_CLUSTER_MIN_ARTICLES = 3;
const SUB_CLUSTER_STOP_BIGRAM_PCT = 0.5;
const SUB_CLUSTER_FILTERED_JACCARD = 0.18;

/**
 * Extract entity-like tokens from title + summary for sub-clustering.
 * - Numbers with units (金額/人數/日期): e.g. "70億", "5人"
 * - Quoted terms (「...」/『...』): e.g. 「詐騙」
 * - English proper nouns: e.g. "TSMC", "COVID"
 */
function extractEntities(title, summary) {
  const text = (title || '') + ' ' + (summary || '');
  const entities = new Set();

  // Numbers + units
  const numUnit = text.matchAll(/\d+[\.\d]*\s*[億萬千百十]?\s*[元人年月日件案筆起份張棟戶]/g);
  for (const m of numUnit) entities.add(m[0].replace(/\s/g, ''));

  // Quoted terms (2-10 chars)
  const quoted = text.matchAll(/[「『]([^」』]{2,10})[」』]/g);
  for (const m of quoted) entities.add(m[1]);

  // English proper nouns (capitalized words), excluding source names
  const english = text.matchAll(/[A-Z][a-zA-Z]+/g);
  for (const m of english) {
    if (!SOURCE_NAME_TOKENS.has(m[0])) entities.add(m[0]);
  }

  return entities;
}

/**
 * Build title-only bigrams (used for filtered Jaccard in sub-clustering).
 */
function titleBigrams(title) {
  return textBigrams(title || '');
}

/**
 * Build sub-clusters within a broad cluster using Entity Anchor + filtered title Jaccard.
 * Returns array of { representative_title, article_ids, article_count }.
 *
 * Algorithm:
 *   1. Extract entities from each article's title+summary
 *   2. Build title bigrams, then compute dynamic stop-bigrams (>50% frequency in cluster)
 *   3. Union-Find: merge if entity overlap ≥ 1 OR filtered title Jaccard ≥ 0.18
 *   4. Group by root, output sub-clusters
 */
function buildSubClusters(articles) {
  const n = articles.length;
  if (n < SUB_CLUSTER_MIN_ARTICLES) {
    return [{ representative_title: articles[0]?.title || '', article_ids: articles.map(a => a.article_id), article_count: n }];
  }

  // 1. Extract entities and title bigrams for each article
  const entitiesArr = articles.map(a => extractEntities(a.title, a.summary));
  const titleBigramsArr = articles.map(a => titleBigrams(a.title));

  // 2. Dynamic stop-bigram filtering: remove bigrams appearing in >50% of articles
  const bigramCount = {};
  for (const bigs of titleBigramsArr) {
    for (const b of bigs) {
      bigramCount[b] = (bigramCount[b] || 0) + 1;
    }
  }
  const stopThreshold = Math.ceil(n * SUB_CLUSTER_STOP_BIGRAM_PCT);
  const stopBigrams = new Set();
  for (const [b, count] of Object.entries(bigramCount)) {
    if (count >= stopThreshold) stopBigrams.add(b);
  }

  // Build filtered bigram sets (title bigrams minus stop-bigrams)
  const filteredBigrams = titleBigramsArr.map(bigs => {
    const filtered = new Set();
    for (const b of bigs) {
      if (!stopBigrams.has(b)) filtered.add(b);
    }
    return filtered;
  });

  // 3. Union-Find
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array(n).fill(0);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(x, y) { let rx = find(x), ry = find(y); if (rx === ry) return; if (rank[rx] < rank[ry]) [rx, ry] = [ry, rx]; parent[ry] = rx; if (rank[rx] === rank[ry]) rank[rx]++; }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Entity overlap ≥ 2 (stricter to avoid false merges from shared generic entities)
      let entityOverlap = 0;
      for (const e of entitiesArr[i]) {
        if (entitiesArr[j].has(e)) entityOverlap++;
      }

      if (entityOverlap >= 2) {
        union(i, j);
        continue;
      }

      // Filtered title Jaccard ≥ 0.18
      if (jaccardSimilarity(filteredBigrams[i], filteredBigrams[j]) >= SUB_CLUSTER_FILTERED_JACCARD) {
        union(i, j);
      }
    }
  }

  // 4. Group by root
  const groups = {};
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups[root]) groups[root] = [];
    groups[root].push(articles[i]);
  }

  return Object.values(groups).map(arts => ({
    representative_title: arts[0].title,
    article_ids: arts.map(a => a.article_id),
    article_count: arts.length,
  }));
}

// ========================================
// Event Cluster Pre-computation
// ========================================

const CLUSTER_MIN_ARTICLES = 2;

/**
 * Controversy level ordering for max_controversy_level.
 */
const CONTROVERSY_ORDER = { low: 1, moderate: 2, high: 3, very_high: 4 };

/**
 * Build all event clusters from recent articles and upsert into event_clusters.
 * Called hourly from index.js scheduled handler.
 *
 * Strategy: cluster articles by title similarity (same as blindspot scan),
 * but with lower threshold (≥2 articles). Computes camp distribution,
 * source breakdown, controversy scores, and category for frontend cards.
 */
export async function buildAllClusters(env) {
  const rows = await env.DB.prepare(`
    SELECT article_id, title, summary, source, bias_score, published_at,
           controversy_score, controversy_level, matched_topic
    FROM articles
    WHERE datetime(published_at) >= datetime('now', '-4 days')
    ORDER BY published_at DESC
    LIMIT 500
  `).all();

  const articles = rows.results || [];
  if (articles.length < CLUSTER_MIN_ARTICLES) return;

  const clusters = buildClusters(articles);

  for (const cluster of clusters) {
    if (cluster.articles.length < CLUSTER_MIN_ARTICLES) continue;

    const campCounts = { green: 0, white: 0, blue: 0 };
    const sourceMap = {};
    const controversyScores = [];
    let maxControversyLevel = null;
    let maxControversyOrder = 0;
    const topicCounts = {};
    let earliestPub = null;
    let latestPub = null;

    for (const art of cluster.articles) {
      // Camp determination (same priority as blindspot)
      const camp = art.bias_score != null
        ? getCamp(art.bias_score)
        : getSourceCamp(art.source);
      if (camp) {
        campCounts[camp]++;
      }

      // Source breakdown
      const srcCamp = camp || 'white';
      if (!sourceMap[art.source]) {
        sourceMap[art.source] = { source: art.source, camp: srcCamp, count: 0 };
      }
      sourceMap[art.source].count++;

      // Controversy
      if (art.controversy_score != null) {
        controversyScores.push(art.controversy_score);
      }
      if (art.controversy_level) {
        const order = CONTROVERSY_ORDER[art.controversy_level] || 0;
        if (order > maxControversyOrder) {
          maxControversyOrder = order;
          maxControversyLevel = art.controversy_level;
        }
      }

      // Category (majority matched_topic)
      if (art.matched_topic) {
        topicCounts[art.matched_topic] = (topicCounts[art.matched_topic] || 0) + 1;
      }

      // Timestamps
      if (!earliestPub || art.published_at < earliestPub) earliestPub = art.published_at;
      if (!latestPub || art.published_at > latestPub) latestPub = art.published_at;
    }

    const sourcesJson = Object.values(sourceMap);
    const avgControversy = controversyScores.length > 0
      ? controversyScores.reduce((a, b) => a + b, 0) / controversyScores.length
      : null;

    // Category: mode of matched_topic
    let category = null;
    let maxTopicCount = 0;
    for (const [topic, count] of Object.entries(topicCounts)) {
      if (count > maxTopicCount) {
        maxTopicCount = count;
        category = topic;
      }
    }

    // Blindspot detection
    const blindspotType = detectBlindspot(campCounts);
    const isBlindspot = blindspotType ? 1 : 0;
    const missingCamp = blindspotType ? getMissingCamp(blindspotType) : null;

    const clusterId = `ec_${hashCluster(cluster.articles[0].title)}`;
    const articleIds = cluster.articles.map(a => a.article_id);

    // Layer 2: Sub-clustering within broad cluster
    const subClusters = buildSubClusters(cluster.articles);
    const subClustersJson = JSON.stringify(subClusters);

    await env.DB.prepare(`
      INSERT INTO event_clusters
        (cluster_id, representative_title, article_count, source_count,
         camp_distribution, sources_json, article_ids,
         avg_controversy_score, max_controversy_level, category,
         is_blindspot, blindspot_type, missing_camp,
         earliest_published_at, latest_published_at, sub_clusters, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(cluster_id) DO UPDATE SET
        representative_title = excluded.representative_title,
        article_count = excluded.article_count,
        source_count = excluded.source_count,
        camp_distribution = excluded.camp_distribution,
        sources_json = excluded.sources_json,
        article_ids = excluded.article_ids,
        avg_controversy_score = excluded.avg_controversy_score,
        max_controversy_level = excluded.max_controversy_level,
        category = excluded.category,
        is_blindspot = excluded.is_blindspot,
        blindspot_type = excluded.blindspot_type,
        missing_camp = excluded.missing_camp,
        earliest_published_at = excluded.earliest_published_at,
        latest_published_at = excluded.latest_published_at,
        sub_clusters = excluded.sub_clusters,
        updated_at = excluded.updated_at
    `).bind(
      clusterId,
      cluster.articles[0].title,
      cluster.articles.length,
      sourcesJson.length,
      JSON.stringify(campCounts),
      JSON.stringify(sourcesJson),
      JSON.stringify(articleIds),
      avgControversy,
      maxControversyLevel,
      category,
      isBlindspot,
      blindspotType,
      missingCamp,
      earliestPub,
      latestPub,
      subClustersJson
    ).run();
  }

  // Clean up old clusters (>7 days)
  await env.DB.prepare(
    "DELETE FROM event_clusters WHERE datetime(latest_published_at) < datetime('now', '-7 days')"
  ).run().catch(() => {});
}

/**
 * Update source tendency table with 30-day rolling average.
 * Called daily at midnight UTC.
 *
 * Priority: actual analysis data > static SOURCE_CAMP baseline.
 * When no analysis data exists, seeds from static map with confidence='baseline'.
 */
export async function updateSourceTendency(env) {
  const { TENDENCY_WINDOW_DAYS, MIN_SAMPLES, GREEN_MAX, BLUE_MIN } = THREE_CAMP;

  // Compute 30-day AVG(bias_score) and COUNT per source (from analyzed articles)
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

  const sourcesWithData = new Set();

  for (const row of (rows.results || [])) {
    const avgBias = row.avg_bias;
    const sampleCount = row.sample_count;
    sourcesWithData.add(row.source);

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

  // Seed sources that have no analysis data from static SOURCE_CAMP map
  const STATIC_BIAS = { green: 30, white: 50, blue: 70 };
  for (const [source, camp] of Object.entries(SOURCE_CAMP)) {
    if (sourcesWithData.has(source)) continue;

    // Count articles from this source (even without bias_score)
    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM articles WHERE source = ?'
    ).bind(source).first();
    const articleCount = countRow?.cnt || 0;
    if (articleCount === 0) continue;

    const panCamp = camp === 'green' ? 'pan_green' : camp === 'blue' ? 'pan_blue' : 'pan_white';

    await env.DB.prepare(`
      INSERT INTO source_tendency (source, avg_bias_score, camp, sample_count, confidence, window_days, last_updated)
      VALUES (?, ?, ?, ?, 'baseline', ?, datetime('now'))
      ON CONFLICT(source) DO UPDATE SET
        avg_bias_score = CASE WHEN source_tendency.confidence = 'baseline' THEN excluded.avg_bias_score ELSE source_tendency.avg_bias_score END,
        camp = CASE WHEN source_tendency.confidence = 'baseline' THEN excluded.camp ELSE source_tendency.camp END,
        sample_count = CASE WHEN source_tendency.confidence = 'baseline' THEN excluded.sample_count ELSE source_tendency.sample_count END,
        confidence = CASE WHEN source_tendency.confidence = 'baseline' THEN excluded.confidence ELSE source_tendency.confidence END,
        last_updated = excluded.last_updated
    `).bind(
      source, STATIC_BIAS[camp], panCamp, articleCount, TENDENCY_WINDOW_DAYS
    ).run();
  }
}
