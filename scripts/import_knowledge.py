"""
Knowledge Base CSV → Batch API JSON Converter
Reads 6 CSV files from tests/, converts to /api/v1/knowledge/batch format.
Output: knowledge_batch_payloads/ directory with JSON files (50 entries each).

Usage:
  python scripts/import_knowledge.py              # Generate JSON files only
  python scripts/import_knowledge.py --post URL   # POST to API endpoint
"""
import csv, json, hashlib, sys, io, os, argparse

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TESTS_DIR = os.path.join(BASE_DIR, "tests")
OUTPUT_DIR = os.path.join(BASE_DIR, "knowledge_batch_payloads")

BATCH_SIZE = 50  # Max per /knowledge/batch call

# Party name mapping (CSV value → API value)
PARTY_MAP = {
    "民進黨": "DPP",
    "國民黨": "KMT",
    "民眾黨": "TPP",
    "台灣民眾黨": "TPP",
    "中國國民黨": "KMT",
    "民主進步黨": "DPP",
}


def make_id(prefix, *parts):
    """Generate deterministic ID from parts."""
    raw = "|".join(str(p) for p in parts)
    short_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{short_hash}"


def read_csv(filepath):
    """Read CSV with utf-8-sig encoding, return header + rows."""
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
    return header, rows


def parse_politician(filepath, party_code):
    """Parse politician CSV. Columns: 姓名, 人物簡介 (+ other metadata)."""
    header, rows = read_csv(filepath)

    # Find column indices by name
    name_idx = None
    bio_idx = None
    for i, col in enumerate(header):
        if "姓名" in col:
            name_idx = i
        if "人物簡介" in col or "簡介" in col:
            bio_idx = i

    if name_idx is None or bio_idx is None:
        print(f"  WARNING: Could not find 姓名/人物簡介 columns in {filepath}")
        print(f"  Header: {header}")
        return []

    entries = []
    for row in rows:
        if len(row) <= max(name_idx, bio_idx):
            continue
        name = row[name_idx].strip()
        bio = row[bio_idx].strip()
        if not name or not bio:
            continue

        entries.append({
            "id": make_id("pol", party_code, name),
            "type": "politician",
            "title": name,
            "content": bio,
            "party": party_code,
        })

    return entries


def parse_event(filepath):
    """Parse event CSV. Columns: 議題名稱, (發生時間), 事件描述."""
    header, rows = read_csv(filepath)

    title_idx = None
    desc_idx = None
    time_idx = None
    for i, col in enumerate(header):
        if "議題" in col or "名稱" in col:
            title_idx = i
        if "描述" in col:
            desc_idx = i
        if "時間" in col:
            time_idx = i

    if title_idx is None or desc_idx is None:
        print(f"  WARNING: Could not find columns in {filepath}")
        print(f"  Header: {header}")
        return []

    entries = []
    for row in rows:
        if len(row) <= max(title_idx, desc_idx):
            continue
        title = row[title_idx].strip()
        desc = row[desc_idx].strip()
        if not title or not desc:
            continue

        # Prepend time to description if available
        content = desc
        if time_idx is not None and len(row) > time_idx and row[time_idx].strip():
            content = f"({row[time_idx].strip()}) {desc}"

        entries.append({
            "id": make_id("evt", title),
            "type": "event",
            "title": title,
            "content": content,
        })

    return entries


def parse_term(filepath):
    """Parse term/stance CSV. Columns: 議題名稱/專有名詞, 政黨, 主張描述."""
    header, rows = read_csv(filepath)

    topic_idx = None
    party_idx = None
    desc_idx = None
    for i, col in enumerate(header):
        if "議題" in col or "專有名詞" in col or "名稱" in col:
            topic_idx = i
        if "政黨" in col:
            party_idx = i
        if "主張" in col or "描述" in col:
            desc_idx = i

    if topic_idx is None or desc_idx is None:
        print(f"  WARNING: Could not find columns in {filepath}")
        print(f"  Header: {header}")
        return []

    entries = []
    for row in rows:
        if len(row) <= max(topic_idx, desc_idx):
            continue
        topic = row[topic_idx].strip()
        desc = row[desc_idx].strip()
        if not topic or not desc:
            continue

        party_raw = row[party_idx].strip() if party_idx is not None and len(row) > party_idx else ""
        party_code = PARTY_MAP.get(party_raw, None)

        # Include party name in content for embedding disambiguation
        if party_raw:
            content = f"[{party_raw}] {topic}: {desc}"
        else:
            content = f"{topic}: {desc}"

        entries.append({
            "id": make_id("trm", topic, party_raw),
            "type": "term",
            "title": topic,
            "content": content,
            "party": party_code,
        })

    return entries


def main():
    parser = argparse.ArgumentParser(description="Import knowledge base CSVs")
    parser.add_argument("--post", help="API base URL to POST batches (e.g. https://api.powerreader.dev)")
    parser.add_argument("--token", help="Admin API token for POST requests")
    args = parser.parse_args()

    print("=" * 60)
    print("  Knowledge Base CSV → Batch API Converter")
    print("=" * 60)

    all_entries = []

    # 1. Politician files
    politician_files = [
        ("國民黨人物資料庫2020-2026_v0.3.csv", "KMT"),
        ("民進黨人物資料庫2020-2026_v0.3.csv", "DPP"),
        ("民眾黨人物資料庫2020-2026_v0.3.csv", "TPP"),
    ]

    for filename, party in politician_files:
        filepath = os.path.join(TESTS_DIR, filename)
        if not os.path.exists(filepath):
            print(f"  SKIP: {filename} not found")
            continue
        entries = parse_politician(filepath, party)
        print(f"  {filename}: {len(entries)} entries ({party})")
        all_entries.extend(entries)

    # 2. Event file
    event_files = ["台灣議題事件資料庫_整理版2020-2026_v0.3.csv"]
    for filename in event_files:
        filepath = os.path.join(TESTS_DIR, filename)
        if not os.path.exists(filepath):
            print(f"  SKIP: {filename} not found")
            continue
        entries = parse_event(filepath)
        print(f"  {filename}: {len(entries)} entries")
        all_entries.extend(entries)

    # 3. Term/stance files
    term_files = [
        "政黨立場_專有名詞_v0.3.csv",
        "政黨立場_專有名詞欄位v0.3.csv",
    ]
    for filename in term_files:
        filepath = os.path.join(TESTS_DIR, filename)
        if not os.path.exists(filepath):
            print(f"  SKIP: {filename} not found")
            continue
        entries = parse_term(filepath)
        print(f"  {filename}: {len(entries)} entries")
        all_entries.extend(entries)

    # Dedup by ID
    seen = {}
    deduped = []
    for entry in all_entries:
        if entry["id"] not in seen:
            seen[entry["id"]] = True
            deduped.append(entry)

    print(f"\n  Total: {len(all_entries)} raw → {len(deduped)} after dedup")

    # Summary by type and party
    summary = {}
    for e in deduped:
        key = f"{e['type']}:{e.get('party', '-')}"
        summary[key] = summary.get(key, 0) + 1
    print(f"\n  Breakdown:")
    for key, count in sorted(summary.items()):
        print(f"    {key}: {count}")

    # Split into batches of 50
    batches = []
    for i in range(0, len(deduped), BATCH_SIZE):
        batches.append(deduped[i:i + BATCH_SIZE])

    print(f"\n  Batches: {len(batches)} (x{BATCH_SIZE} max)")

    # Save batch JSON files
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for i, batch in enumerate(batches):
        payload = {"entries": batch}
        outpath = os.path.join(OUTPUT_DIR, f"batch_{i+1:03d}.json")
        with open(outpath, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"  Saved to: {OUTPUT_DIR}/")

    # POST to API if requested
    if args.post:
        import requests
        import time

        base_url = args.post.rstrip("/")
        headers = {"Content-Type": "application/json"}
        if args.token:
            headers["Authorization"] = f"Bearer {args.token}"

        print(f"\n  POSTing to {base_url}/api/v1/knowledge/batch ...")
        for i, batch in enumerate(batches):
            payload = {"entries": batch}
            try:
                resp = requests.post(
                    f"{base_url}/api/v1/knowledge/batch",
                    json=payload,
                    headers=headers,
                    timeout=60,
                )
                data = resp.json()
                if resp.status_code == 200 and data.get("success"):
                    print(f"  Batch {i+1}/{len(batches)}: OK ({data['data']['imported']} imported)")
                else:
                    print(f"  Batch {i+1}/{len(batches)}: FAILED ({resp.status_code}) {data.get('error', {}).get('message', '')}")
            except Exception as e:
                print(f"  Batch {i+1}/{len(batches)}: ERROR {e}")
            time.sleep(1)  # Rate limit

        print(f"\n  Done!")


if __name__ == "__main__":
    main()
