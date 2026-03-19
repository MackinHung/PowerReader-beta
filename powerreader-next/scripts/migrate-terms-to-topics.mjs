/**
 * Migration Script: term → topic
 *
 * Merges 468 type:"term" entries (156 topics × 3 parties) into 156 type:"topic"
 * entries with multi-party stances. Politician and event entries are preserved.
 *
 * Usage:
 *   node scripts/migrate-terms-to-topics.mjs
 *   import { migrateTermsToTopics } from './migrate-terms-to-topics.mjs';
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const BATCH_DIR = resolve(PROJECT_ROOT, 'data', 'knowledge');
const BACKUP_DIR = resolve(BATCH_DIR, '.backup');

/**
 * Generate a deterministic topic ID from a title.
 * @param {string} title
 * @returns {string} e.g. "top_a1b2c3d4e5f6"
 */
export function generateTopicId(title) {
  const hash = createHash('sha256').update(title).digest('hex');
  return `top_${hash.slice(0, 12)}`;
}

/**
 * Strip the party+title prefix from term content.
 * Pattern: "[黨名] 議題名: " or "[黨名] 議題名： "
 * @param {string} content
 * @returns {string}
 */
export function stripPrefix(content) {
  return content.replace(/^\[.+?\]\s*.+?[:：]\s*/, '');
}

/** @type {Record<string, string>} */
const PARTY_NAMES = { DPP: '民進黨', KMT: '國民黨', TPP: '民眾黨' };

/**
 * Migrate term entries to topic entries across all batch files.
 * @param {object} [options]
 * @param {string} [options.batchDir] - Override batch directory path
 * @param {string} [options.backupDir] - Override backup directory path
 * @param {boolean} [options.skipBackup] - Skip creating backup files
 * @returns {{ termsRemoved: number, topicsCreated: number, warnings: string[] }}
 */
export function migrateTermsToTopics(options = {}) {
  const batchDir = options.batchDir || BATCH_DIR;
  const backupDir = options.backupDir || BACKUP_DIR;
  const skipBackup = options.skipBackup || false;

  if (!existsSync(batchDir)) {
    console.warn('[migrate] Batch directory not found:', batchDir);
    return { termsRemoved: 0, topicsCreated: 0, warnings: [] };
  }

  const files = readdirSync(batchDir)
    .filter(f => f.startsWith('batch_') && f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.warn('[migrate] No batch_*.json files found.');
    return { termsRemoved: 0, topicsCreated: 0, warnings: [] };
  }

  // Step 1: Backup
  if (!skipBackup) {
    mkdirSync(backupDir, { recursive: true });
    for (const file of files) {
      copyFileSync(resolve(batchDir, file), resolve(backupDir, file));
    }
    console.log(`[migrate] Backed up ${files.length} files to ${backupDir}`);
  }

  // Step 2: Collect all terms across all files, grouped by title
  // Also track which file each term came from
  /** @type {Map<string, Map<string, { content: string, id: string }>>} title → party → data */
  const termsByTitle = new Map();
  let totalTerms = 0;

  /** @type {Map<string, { nonTermEntries: Array, termTitles: Set<string> }>} */
  const fileData = new Map();

  for (const file of files) {
    const filePath = resolve(batchDir, file);
    let data;
    try {
      const raw = readFileSync(filePath, 'utf-8');
      data = JSON.parse(raw);
    } catch (err) {
      console.warn(`[migrate] Error reading ${file}:`, err.message);
      fileData.set(file, { nonTermEntries: [], termTitles: new Set() });
      continue;
    }

    const entries = data.entries || [];
    const nonTermEntries = [];
    const termTitles = new Set();

    for (const entry of entries) {
      if (entry.type === 'term') {
        totalTerms++;
        const title = entry.title || '';
        const party = entry.party || 'unknown';
        termTitles.add(title);

        if (!termsByTitle.has(title)) {
          termsByTitle.set(title, new Map());
        }
        termsByTitle.get(title).set(party, {
          content: entry.content || '',
          id: entry.id || ''
        });
      } else {
        nonTermEntries.push(entry);
      }
    }

    fileData.set(file, { nonTermEntries, termTitles });
  }

  // Step 3: Build topic entries
  const warnings = [];
  /** @type {Map<string, object>} title → topic entry */
  const topicEntries = new Map();

  for (const [title, partyMap] of termsByTitle) {
    const stances = {};
    for (const [party, data] of partyMap) {
      stances[party] = stripPrefix(data.content);
    }

    const expectedParties = ['DPP', 'KMT', 'TPP'];
    const missingParties = expectedParties.filter(p => !stances[p]);
    if (missingParties.length > 0) {
      warnings.push(`Topic "${title}" missing stances for: ${missingParties.join(', ')}`);
    }

    topicEntries.set(title, {
      id: generateTopicId(title),
      type: 'topic',
      title,
      stances
    });
  }

  // Step 4: Distribute topics back into batch files
  // Strategy: place each topic in the first file that had terms with that title
  const assignedTitles = new Set();

  for (const file of files) {
    const fd = fileData.get(file);
    if (!fd) continue;

    const newEntries = [...fd.nonTermEntries];

    for (const title of fd.termTitles) {
      if (!assignedTitles.has(title)) {
        assignedTitles.add(title);
        newEntries.push(topicEntries.get(title));
      }
    }

    // Write updated file
    const filePath = resolve(batchDir, file);
    writeFileSync(filePath, JSON.stringify({ entries: newEntries }, null, 2), 'utf-8');
  }

  // Step 5: Report
  console.log(`[migrate] Terms removed: ${totalTerms}`);
  console.log(`[migrate] Topics created: ${topicEntries.size}`);
  if (warnings.length > 0) {
    console.warn(`[migrate] Warnings (${warnings.length}):`);
    for (const w of warnings) {
      console.warn(`  - ${w}`);
    }
  }

  return {
    termsRemoved: totalTerms,
    topicsCreated: topicEntries.size,
    warnings
  };
}

// CLI entry point
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('migrate-terms-to-topics.mjs')) {
  migrateTermsToTopics();
}
