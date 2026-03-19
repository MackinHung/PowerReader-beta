/**
 * Knowledge Schema v2 Migration Script
 *
 * Migrates batch_*.json files:
 * - "type": "politician" → "type": "figure"
 * - "type": "topic" → "type": "issue"
 * - "type": "event" → "type": "incident"
 * - Adds "source_type": "ai" and "report_count": 0 to all entries
 * - Does NOT change IDs, content, or stances
 *
 * Usage: node scripts/migrate-knowledge-v2.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BATCH_DIR = resolve(__dirname, '..', 'data', 'knowledge');

const TYPE_MAP = {
  politician: 'figure',
  topic: 'issue',
  event: 'incident',
};

const files = readdirSync(BATCH_DIR)
  .filter(f => f.startsWith('batch_') && f.endsWith('.json'))
  .sort();

console.log(`Found ${files.length} batch files to migrate`);

let totalEntries = 0;
let migratedTypes = { politician: 0, topic: 0, event: 0 };

for (const file of files) {
  const filePath = resolve(BATCH_DIR, file);
  const raw = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  let fileChanged = false;

  for (const entry of data.entries) {
    totalEntries++;

    // Migrate type
    if (TYPE_MAP[entry.type]) {
      migratedTypes[entry.type]++;
      entry.type = TYPE_MAP[entry.type];
      fileChanged = true;
    }

    // Add source_type and report_count if missing
    if (entry.source_type === undefined) {
      entry.source_type = 'ai';
      fileChanged = true;
    }
    if (entry.report_count === undefined) {
      entry.report_count = 0;
      fileChanged = true;
    }
  }

  if (fileChanged) {
    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    console.log(`  ✓ ${file} (${data.entries.length} entries)`);
  } else {
    console.log(`  - ${file} (no changes)`);
  }
}

console.log(`\nMigration complete:`);
console.log(`  Total entries: ${totalEntries}`);
console.log(`  politician → figure: ${migratedTypes.politician}`);
console.log(`  topic → issue: ${migratedTypes.topic}`);
console.log(`  event → incident: ${migratedTypes.event}`);
