/**
 * Build-time Knowledge JSON Generator
 *
 * Reads batch_*.json files from knowledge_batch_payloads/,
 * merges & deduplicates entries, and writes static/data/knowledge.json.
 *
 * Usage:
 *   node scripts/generate-knowledge.mjs
 *   import { generateKnowledgeJson } from './generate-knowledge.mjs';
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const BATCH_DIR = resolve(PROJECT_ROOT, 'data', 'knowledge');
const OUTPUT_DIR = resolve(PROJECT_ROOT, 'static', 'data');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'knowledge.json');

/**
 * Generate knowledge.json from batch payload files.
 * @returns {{ total: number, types: Record<string, number>, parties: Record<string, number> }}
 */
export function generateKnowledgeJson() {
  if (!existsSync(BATCH_DIR)) {
    console.warn('[generate-knowledge] Batch directory not found:', BATCH_DIR);
    console.warn('[generate-knowledge] Skipping knowledge generation.');
    return { total: 0, types: {}, parties: {} };
  }

  const files = readdirSync(BATCH_DIR)
    .filter(f => f.startsWith('batch_') && f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.warn('[generate-knowledge] No batch_*.json files found.');
    return { total: 0, types: {}, parties: {} };
  }

  console.log(`[generate-knowledge] Found ${files.length} batch files`);

  // Merge entries, deduplicate by id
  const entriesMap = new Map();

  for (const file of files) {
    const batchName = file.replace(/\.json$/, '');
    try {
      const raw = readFileSync(resolve(BATCH_DIR, file), 'utf-8');
      const data = JSON.parse(raw);
      const entries = data.entries || [];

      for (const entry of entries) {
        if (entry.id) {
          const mapped = {
            id: entry.id,
            type: entry.type || 'unknown',
            title: entry.title || '',
            _batch: batchName
          };

          if (entry.type === 'topic' && entry.stances) {
            // Topic entries carry stances instead of content/party
            mapped.stances = entry.stances;
          } else {
            mapped.content = entry.content || '';
            mapped.party = entry.party || null;
          }

          entriesMap.set(entry.id, mapped);
        }
      }
    } catch (err) {
      console.warn(`[generate-knowledge] Error reading ${file}:`, err.message);
    }
  }

  const allEntries = [...entriesMap.values()];

  // Compute type and party counts
  // Topic entries do not count toward party stats (party info is in stances)
  const types = {};
  const parties = {};

  for (const entry of allEntries) {
    types[entry.type] = (types[entry.type] || 0) + 1;
    if (entry.type !== 'topic' && entry.party) {
      parties[entry.party] = (parties[entry.party] || 0) + 1;
    }
  }

  // Write output
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const output = {
    generated_at: new Date().toISOString(),
    total: allEntries.length,
    types,
    parties,
    entries: allEntries
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output), 'utf-8');
  console.log(`[generate-knowledge] Written ${allEntries.length} entries to ${OUTPUT_FILE}`);
  console.log(`[generate-knowledge] Types:`, types);
  console.log(`[generate-knowledge] Parties:`, parties);

  return { total: allEntries.length, types, parties };
}

// CLI entry point
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('generate-knowledge.mjs')) {
  generateKnowledgeJson();
}
