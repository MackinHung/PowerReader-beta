# scripts/ — Utility & Validation Scripts

## Validation Scripts

Run these after any changes to shared config or enums to verify consistency.

| Script | Purpose |
|--------|---------|
| `validate-config.js` | Verify `shared/config.js` values are within expected bounds |
| `validate-enums.js` | Verify `shared/enums.js` enum values are consistent |
| `validate-state-machine.js` | Verify article status transitions have no orphan states |

## Data Import

| Script | Purpose |
|--------|---------|
| `import_knowledge.py` | Batch import knowledge entries (politician/topic/term/event) to D1 via API |

## Usage

```bash
# Validate config (Node.js)
node scripts/validate-config.js

# Validate enums
node scripts/validate-enums.js

# Import knowledge (Python)
python scripts/import_knowledge.py --api-url <URL> --api-key <KEY> --file <CSV>
```
