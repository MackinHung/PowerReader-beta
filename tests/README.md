# tests/ — Test Files & Knowledge Data

## Test Scripts

| File | Purpose |
|------|---------|
| `test_markdown_new.py` | Tests for markdown.news article processing |
| `qa_freshness_dedup.py` | QA script for freshness and deduplication checks |

## Knowledge Base Data (CSV)

These CSV files are used by `scripts/import_knowledge.py` to populate the RAG Layer 2 knowledge base.

| File | Category | Description |
|------|----------|-------------|
| `國民黨人物資料庫2020-2026_v0.3.csv` | politician | KMT politicians + party affiliation |
| `民進黨人物資料庫2020-2026_v0.3.csv` | politician | DPP politicians + party affiliation |
| `民眾黨人物資料庫2020-2026_v0.3.csv` | politician | TPP politicians + party affiliation |
| `台灣議題事件資料庫_整理版2020-2026_v0.3.csv` | topic/event | Major political issues & events |
| `政黨立場_專有名詞欄位v0.3.csv` | term | Party positions + specialized terms |

## Test Reports

| File | Purpose |
|------|---------|
| `markdown_new_report.json` | Results from markdown.news processing tests |
| `qa_freshness_dedup_report.json` | Results from freshness/dedup QA |

## Running Tests

```bash
# Jest (T05 points engine)
cd T05_REWARD_SYSTEM && npx jest

# Python tests
python tests/test_markdown_new.py
python tests/qa_freshness_dedup.py
```
