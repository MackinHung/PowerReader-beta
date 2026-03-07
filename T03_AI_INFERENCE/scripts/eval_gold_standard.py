"""
Gold Standard Evaluation Script v2
Evaluates Qwen3.5-4B + RAG against gold standard articles.
Embedding: paraphrase-multilingual-MiniLM-L12-v2 (CPU, local testing)
LLM: Qwen3.5-4B via Ollama (think=false, t=0.5)
"""
import requests
import json
import time
import sys
import io
import re
import os
from dataclasses import dataclass, field
from typing import Optional

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# ============================================================
# 1. Gold Standard Article Definition
# ============================================================

@dataclass
class GoldStandardArticle:
    id: str
    title: str
    content_markdown: str
    source: str
    expected_bias: int
    expected_controversy: int
    expected_bias_category: str
    expected_controversy_level: str
    author: Optional[str] = None
    summary: Optional[str] = None
    published_at: Optional[str] = None


# ============================================================
# 2. Bias Category / Controversy Level Helpers
# ============================================================

BIAS_CATEGORIES = {
    "extreme_green": (0, 15),
    "lean_green": (15, 30),
    "slight_green": (30, 45),
    "center": (45, 55),
    "slight_blue": (55, 70),
    "lean_blue": (70, 85),
    "extreme_blue": (85, 100),
}

CONTROVERSY_LEVELS = {
    "low": (0, 25),
    "moderate": (25, 50),
    "high": (50, 75),
    "critical": (75, 100),
}


def score_to_bias_category(score: int) -> str:
    for cat, (lo, hi) in BIAS_CATEGORIES.items():
        if lo <= score <= hi:
            return cat
    return "center"


def score_to_controversy_level(score: int) -> str:
    for level, (lo, hi) in CONTROVERSY_LEVELS.items():
        if lo <= score <= hi:
            return level
    return "moderate"


# ============================================================
# 3. Knowledge Base (same 31 entries from test_rag_mvp.py)
# ============================================================

KNOWLEDGE_BASE = [
    # --- Politicians ---
    {"text": "賴清德，民進黨，現任中華民國總統，主張台灣主體性與國防自主，支持對美軍購強化防衛能力", "type": "politician"},
    {"text": "蕭美琴，民進黨，現任副總統，前駐美代表，推動台美關係深化", "type": "politician"},
    {"text": "柯建銘，民進黨，立法院黨團總召，長期推動國防預算與黨團協商", "type": "politician"},
    {"text": "傅崐萁，國民黨，立法院黨團總召，主張監督國防預算、反對特別條例繞過常規審查", "type": "politician"},
    {"text": "鄭麗文，國民黨，立法委員，與傅崐萁共同主導國防特別預算審查立場", "type": "politician"},
    {"text": "韓國瑜，國民黨，立法院長，曾任高雄市長，主張兩岸和平交流", "type": "politician"},
    {"text": "柯文哲，台灣民眾黨，前台北市長，民眾黨主席，主張超越藍綠", "type": "politician"},
    {"text": "吳宗憲，國民黨，宜蘭縣長參選人，前立法委員，推動育嬰與婦女權益政策", "type": "politician"},
    {"text": "林國漳，民進黨，宜蘭縣長參選人，與吳宗憲競爭宜蘭縣長席位", "type": "politician"},
    {"text": "林姿妙，國民黨，前宜蘭縣長，任內推動一鄉鎮一親子館政策", "type": "politician"},
    {"text": "許美華，科技專家與政治評論者，立場偏綠，常批評國民黨國防政策", "type": "politician"},
    {"text": "蔡英文，民進黨，前總統，任內大力推動國防自主與對美軍購", "type": "politician"},
    {"text": "朱立倫，國民黨主席，主張九二共識與兩岸對話", "type": "politician"},
    {"text": "侯友宜，國民黨，前新北市長，2024總統候選人", "type": "politician"},
    {"text": "盧秀燕，國民黨，台中市長，地方施政派，較少涉入中央政治攻防", "type": "politician"},

    # --- Media ---
    {"text": "自由時報，立場偏綠，經常批評國民黨與中國政策，支持台灣本土意識", "type": "media"},
    {"text": "中時新聞網（中國時報），立場偏藍，對民進黨執政持批評態度，主張兩岸交流", "type": "media"},
    {"text": "聯合新聞網（聯合報），立場偏藍，關注兩岸關係與經濟發展", "type": "media"},
    {"text": "三立新聞，立場偏綠，支持民進黨政策方向，批評在野黨", "type": "media"},
    {"text": "TVBS，立場中間偏藍，較注重民調與中立報導但有藍營傾向", "type": "media"},
    {"text": "公視（公共電視），立場中立，公共媒體，較客觀平衡報導", "type": "media"},
    {"text": "ETtoday（東森新聞雲），立場中間，社會新聞為主，政治立場較不鮮明", "type": "media"},
    {"text": "鏡週刊，立場中間偏綠，以調查報導為主", "type": "media"},

    # --- Topics ---
    {"text": "對美軍購與國防預算：民進黨主張國防自主、加速對美軍購強化台海防禦；國民黨主張監督預算、要求美方正式報價才編列、反對特別條例跳過常規審查。爭議程度極高，涉及國家安全核心", "type": "topic"},
    {"text": "兩岸關係：民進黨主張維護主權、抗中保台；國民黨主張九二共識、和平對話交流。台灣最核心的政治分歧議題", "type": "topic"},
    {"text": "育嬰與托育政策：跨黨派共識較高的社會福利議題，藍綠都有提出相關政見，爭議性較低，主要比拼政策細節與執行力", "type": "topic"},
    {"text": "縣市長選舉與地方政治：藍綠在各縣市提名候選人競爭，政見攻防集中在地方建設、社福、經濟發展", "type": "topic"},
    {"text": "毒品與公共安全：非政治議題，社會事件類，無明顯藍綠立場差異，著重司法與社會安全討論", "type": "topic"},
    {"text": "發價書(LOA)是美國對外軍售的正式報價文件，台美軍購需經LOR申請→美方跨部會審查→國會通過→發出LOA的完整流程", "type": "topic"},
    {"text": "國防特別預算條例：行政院版1.25兆八年期，國民黨版3800億+N限定有LOA項目，爭議焦點在預算規模與審查程序", "type": "topic"},
    {"text": "女性權益與職場平等：包含月經貧窮、公務體系性別比例、育嬰留停等議題，社會共識度較高", "type": "topic"},
]


# ============================================================
# 4. Embedding + Vector Search
# ============================================================

print("Loading embedding model (CPU)...")
t0 = time.time()
from sentence_transformers import SentenceTransformer
import numpy as np

EMBED_MODEL = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
print(f"  Model loaded: {time.time() - t0:.1f}s")

print("Building knowledge base vector index...")
t0 = time.time()
kb_texts = [entry["text"] for entry in KNOWLEDGE_BASE]
kb_vectors = EMBED_MODEL.encode(kb_texts, normalize_embeddings=True)
print(f"  {len(KNOWLEDGE_BASE)} entries, {time.time() - t0:.1f}s")


def search_knowledge(query_text: str, top_k: int = 5) -> list:
    """Cosine similarity search over knowledge base."""
    q_vec = EMBED_MODEL.encode([query_text], normalize_embeddings=True)
    scores = np.dot(kb_vectors, q_vec.T).flatten()
    top_indices = np.argsort(scores)[::-1][:top_k]
    results = []
    for idx in top_indices:
        results.append({
            "text": KNOWLEDGE_BASE[idx]["text"],
            "type": KNOWLEDGE_BASE[idx]["type"],
            "score": float(scores[idx]),
        })
    return results


# ============================================================
# 5. Prompt Templates (RAG three-layer)
# ============================================================

L1_PROMPT = """你是台灣新聞政治立場分析器。

## 台灣政治立場判斷指南

政治傾向有兩種表現模式:

### 偏綠(民進黨)
批評型: 批評國民黨阻擋預算、親中賣台、拖延軍購、配合對岸
宣傳型: 正面報導民進黨/綠營候選人政績、政策主張

### 偏藍(國民黨)
批評型: 批評執政黨浪費預算、綠營製造對立、操弄意識形態
宣傳型: 正面報導國民黨/藍營候選人政績、政策主張

### 中立
客觀陳述雙方立場；或完全無涉政治

## bias_score (0=極綠, 50=中立, 100=極藍)
- 0~15: 全面批評藍營 或 全面宣傳綠營
- 15~30: 明顯偏綠
- 30~45: 略偏綠
- 45~55: 中立 或 非政治新聞
- 55~70: 略偏藍
- 70~85: 明顯偏藍
- 85~100: 全面批評綠營 或 全面宣傳藍營

## controversy_score
- 10~25: 日常社會事件
- 25~40: 一般政策討論
- 40~60: 有藍綠交鋒
- 60~80: 核心對立議題
- 80~100: 國防外交重大爭議"""


def build_rag_prompt(article: str, top_k: int = 5) -> tuple:
    """Build L1 + L2(RAG) + L3(article) prompt. Returns (system_prompt, hits)."""
    hits = search_knowledge(article, top_k=top_k)

    l2_section = "\n## 相關背景資訊（自動檢索）\n"
    for h in hits:
        tag = {"politician": "人物", "media": "媒體", "topic": "議題"}.get(h["type"], "其他")
        l2_section += f"- [{tag}] {h['text']} (相關度:{h['score']:.2f})\n"

    system = L1_PROMPT + l2_section + """
回覆格式: {"bias_score": 數字, "controversy_score": 數字}
只輸出JSON，不要加任何說明。"""

    return system, hits


# ============================================================
# 6. Ollama API Call
# ============================================================

OLLAMA_URL = "http://localhost:11434/api/chat"


def call_model(system: str, user: str, model: str = "qwen3.5:4b", temp: float = 0.5) -> tuple:
    """Call Ollama and return (content, elapsed_seconds)."""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "think": False,
        "options": {"num_predict": 4096, "temperature": temp},
    }
    t0 = time.time()
    resp = requests.post(OLLAMA_URL, json=payload, timeout=600)
    elapsed = time.time() - t0
    msg = resp.json().get("message", {})
    return msg.get("content", ""), elapsed


def extract_score(text: str) -> Optional[dict]:
    """Extract bias_score and controversy_score from model output."""
    if not text:
        return None
    s, e = text.rfind("{"), text.rfind("}")
    if s != -1 and e > s:
        try:
            r = json.loads(text[s:e + 1])
            if "bias_score" in r and "controversy_score" in r:
                return r
        except (json.JSONDecodeError, ValueError):
            pass
    bm = re.search(r'bias[_\s]*(?:score)?[:\s]*(\d+)', text, re.IGNORECASE)
    cm = re.search(r'controvers[y_\s]*(?:score)?[:\s]*(\d+)', text, re.IGNORECASE)
    if bm and cm:
        return {"bias_score": int(bm.group(1)), "controversy_score": int(cm.group(1))}
    return None


# ============================================================
# 7. Load Seed Articles
# ============================================================

NEWS_DIR = r"C:\Users\water\Desktop\model_test"

SEED_ARTICLES = [
    GoldStandardArticle(
        id="news1",
        title="軍購特別條例",
        content_markdown="",  # loaded below
        source="liberty_times",
        expected_bias=18,
        expected_controversy=78,
        expected_bias_category="lean_green",
        expected_controversy_level="critical",
        author="黃韻璇",
        summary="國民黨3800億+N版軍購特別條例遭批評",
    ),
    GoldStandardArticle(
        id="news2",
        title="宜蘭車禍吸毒撞死人",
        content_markdown="",
        source="ettoday",
        expected_bias=50,
        expected_controversy=15,
        expected_bias_category="center",
        expected_controversy_level="low",
        author=None,
        summary="宜蘭賓士男吸毒駕車撞死人",
    ),
    GoldStandardArticle(
        id="news3",
        title="吳宗憲推好養三部曲育嬰政策",
        content_markdown="",
        source="ctwant",
        expected_bias=72,
        expected_controversy=35,
        expected_bias_category="lean_blue",
        expected_controversy_level="moderate",
        author=None,
        summary="國民黨吳宗憲推動育嬰留停全薪等婦幼政策",
    ),
]

# Load article content from files
NEWS_FILE_MAP = {
    "news1": os.path.join(NEWS_DIR, "news.txt"),
    "news2": os.path.join(NEWS_DIR, "news2.txt"),
    "news3": os.path.join(NEWS_DIR, "news3.txt"),
}

for article in SEED_ARTICLES:
    filepath = NEWS_FILE_MAP.get(article.id)
    if filepath and os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            article.content_markdown = f.read().strip()
    else:
        print(f"  WARNING: Could not load content for {article.id} from {filepath}")


# ============================================================
# 8. Evaluation Engine
# ============================================================

@dataclass
class RunResult:
    bias_score: int
    controversy_score: int
    bias_category: str
    controversy_level: str
    elapsed: float
    raw_output: str


@dataclass
class ArticleEvaluation:
    article: GoldStandardArticle
    runs: list = field(default_factory=list)
    failed_runs: int = 0

    @property
    def bias_scores(self) -> list:
        return [r.bias_score for r in self.runs]

    @property
    def controversy_scores(self) -> list:
        return [r.controversy_score for r in self.runs]

    @property
    def bias_mae(self) -> float:
        if not self.runs:
            return float("inf")
        errors = [abs(r.bias_score - self.article.expected_bias) for r in self.runs]
        return sum(errors) / len(errors)

    @property
    def controversy_mae(self) -> float:
        if not self.runs:
            return float("inf")
        errors = [abs(r.controversy_score - self.article.expected_controversy) for r in self.runs]
        return sum(errors) / len(errors)

    @property
    def bias_category_accuracy(self) -> float:
        if not self.runs:
            return 0.0
        correct = sum(1 for r in self.runs if r.bias_category == self.article.expected_bias_category)
        return correct / len(self.runs)

    @property
    def bias_spread(self) -> int:
        if not self.bias_scores:
            return 0
        return max(self.bias_scores) - min(self.bias_scores)

    @property
    def controversy_spread(self) -> int:
        if not self.controversy_scores:
            return 0
        return max(self.controversy_scores) - min(self.controversy_scores)


def evaluate_article(article: GoldStandardArticle, n_runs: int = 3) -> ArticleEvaluation:
    """Run model N times on an article and collect results."""
    evaluation = ArticleEvaluation(article=article)

    rag_system, hits = build_rag_prompt(article.content_markdown, top_k=5)

    print(f"\n  RAG Top-5 hits:")
    for i, h in enumerate(hits, 1):
        tag = {"politician": "P", "media": "M", "topic": "T"}.get(h["type"], "?")
        print(f"    {i}. [{tag}] [{h['score']:.3f}] {h['text'][:60]}...")

    print(f"\n  Running {n_runs} evaluations...")
    for i in range(1, n_runs + 1):
        content, elapsed = call_model(
            rag_system,
            f"分析這篇新聞的政治立場:\n\n{article.content_markdown}",
        )
        result = extract_score(content)
        if result:
            b = result["bias_score"]
            c = result["controversy_score"]
            run = RunResult(
                bias_score=b,
                controversy_score=c,
                bias_category=score_to_bias_category(b),
                controversy_level=score_to_controversy_level(c),
                elapsed=elapsed,
                raw_output=content,
            )
            evaluation.runs.append(run)
            b_err = abs(b - article.expected_bias)
            c_err = abs(c - article.expected_controversy)
            print(f"    [{i}] b={b:<3} c={c:<3} b_err={b_err:<3} c_err={c_err:<3} ({elapsed:.1f}s)")
        else:
            evaluation.failed_runs += 1
            print(f"    [{i}] FAIL ({elapsed:.1f}s) -> {content[:80]}")

    return evaluation


# ============================================================
# 9. Report Generator
# ============================================================

def generate_report(evaluations: list, n_runs: int) -> str:
    """Generate a markdown-formatted evaluation report."""
    lines = []
    lines.append("# Gold Standard Evaluation Report v2")
    lines.append("")
    lines.append(f"**Date**: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"**Model**: Qwen3.5-4B (think=false, t=0.5)")
    lines.append(f"**Embedding**: paraphrase-multilingual-MiniLM-L12-v2 (CPU)")
    lines.append(f"**Knowledge Base**: {len(KNOWLEDGE_BASE)} entries")
    lines.append(f"**Runs per article**: {n_runs}")
    lines.append(f"**Articles evaluated**: {len(evaluations)}")
    lines.append("")

    # --- Per-article results ---
    lines.append("## Per-Article Results")
    lines.append("")
    lines.append("| Article | Expected B | Avg B | B MAE | B Spread | B Cat Acc | Expected C | Avg C | C MAE | C Spread | Fails |")
    lines.append("|---------|-----------|-------|-------|----------|-----------|-----------|-------|-------|----------|-------|")

    total_bias_errors = []
    total_controversy_errors = []
    total_cat_correct = 0
    total_runs = 0
    total_fails = 0
    all_pass = 0

    for ev in evaluations:
        a = ev.article
        if ev.runs:
            b_avg = sum(ev.bias_scores) / len(ev.bias_scores)
            c_avg = sum(ev.controversy_scores) / len(ev.controversy_scores)
            for r in ev.runs:
                total_bias_errors.append(abs(r.bias_score - a.expected_bias))
                total_controversy_errors.append(abs(r.controversy_score - a.expected_controversy))
                if r.bias_category == a.expected_bias_category:
                    total_cat_correct += 1
                # Pass = bias_err < 15 AND controversy_err < 20
                if abs(r.bias_score - a.expected_bias) < 15 and abs(r.controversy_score - a.expected_controversy) < 20:
                    all_pass += 1
            total_runs += len(ev.runs)
        else:
            b_avg = float("nan")
            c_avg = float("nan")
        total_fails += ev.failed_runs

        lines.append(
            f"| {a.id} {a.title[:10]} | {a.expected_bias} | {b_avg:.0f} | {ev.bias_mae:.1f} | {ev.bias_spread} | {ev.bias_category_accuracy:.0%} | "
            f"{a.expected_controversy} | {c_avg:.0f} | {ev.controversy_mae:.1f} | {ev.controversy_spread} | {ev.failed_runs} |"
        )

    lines.append("")

    # --- Aggregate metrics ---
    lines.append("## Aggregate Metrics")
    lines.append("")

    if total_runs > 0:
        overall_bias_mae = sum(total_bias_errors) / len(total_bias_errors)
        overall_controversy_mae = sum(total_controversy_errors) / len(total_controversy_errors)
        overall_cat_accuracy = total_cat_correct / total_runs
        overall_pass_rate = all_pass / total_runs
    else:
        overall_bias_mae = float("inf")
        overall_controversy_mae = float("inf")
        overall_cat_accuracy = 0.0
        overall_pass_rate = 0.0

    lines.append(f"| Metric | Value | Target |")
    lines.append(f"|--------|-------|--------|")
    lines.append(f"| Bias MAE | {overall_bias_mae:.1f} | < 15 |")
    lines.append(f"| Bias Category Accuracy | {overall_cat_accuracy:.0%} | > 50% |")
    lines.append(f"| Controversy MAE | {overall_controversy_mae:.1f} | < 20 |")
    lines.append(f"| Pass Rate (b_err<15 & c_err<20) | {overall_pass_rate:.0%} | 60-70% |")
    lines.append(f"| Total Runs | {total_runs} | - |")
    lines.append(f"| Failed Runs | {total_fails} | 0 |")
    lines.append("")

    # --- Pass/Fail verdict ---
    bias_pass = overall_bias_mae < 15
    cat_pass = overall_cat_accuracy > 0.50
    controv_pass = overall_controversy_mae < 20
    rate_pass = overall_pass_rate >= 0.60

    verdict = "PASS" if (bias_pass and cat_pass and controv_pass and rate_pass) else "FAIL"
    lines.append(f"## Overall Verdict: **{verdict}**")
    lines.append("")
    lines.append(f"- Bias MAE < 15: {'PASS' if bias_pass else 'FAIL'}")
    lines.append(f"- Bias Category Accuracy > 50%: {'PASS' if cat_pass else 'FAIL'}")
    lines.append(f"- Controversy MAE < 20: {'PASS' if controv_pass else 'FAIL'}")
    lines.append(f"- Pass Rate >= 60%: {'PASS' if rate_pass else 'FAIL'}")
    lines.append("")

    # --- Per-run detail ---
    lines.append("## Detailed Run Results")
    lines.append("")
    for ev in evaluations:
        a = ev.article
        lines.append(f"### {a.id}: {a.title}")
        lines.append(f"- Source: {a.source}")
        lines.append(f"- Expected: bias={a.expected_bias} ({a.expected_bias_category}), controversy={a.expected_controversy} ({a.expected_controversy_level})")
        lines.append("")
        if ev.runs:
            lines.append("| Run | Bias | B Err | B Category | C Score | C Err | C Level | Time |")
            lines.append("|-----|------|-------|------------|---------|-------|---------|------|")
            for i, r in enumerate(ev.runs, 1):
                b_err = abs(r.bias_score - a.expected_bias)
                c_err = abs(r.controversy_score - a.expected_controversy)
                cat_match = "OK" if r.bias_category == a.expected_bias_category else "MISS"
                lines.append(
                    f"| {i} | {r.bias_score} | {b_err} | {r.bias_category} ({cat_match}) | "
                    f"{r.controversy_score} | {c_err} | {r.controversy_level} | {r.elapsed:.1f}s |"
                )
        else:
            lines.append("*All runs failed to produce valid output.*")
        lines.append("")

    return "\n".join(lines)


# ============================================================
# 10. Main
# ============================================================

def main():
    n_runs = 3
    if len(sys.argv) > 1:
        try:
            n_runs = int(sys.argv[1])
        except ValueError:
            print(f"Usage: python eval_gold_standard.py [N_RUNS]")
            print(f"  N_RUNS: number of evaluation runs per article (default: 3)")
            sys.exit(1)

    print("\n" + "=" * 70)
    print("  Gold Standard Evaluation v2")
    print(f"  Model: qwen3.5:4b | Embed: multilingual-MiniLM (CPU)")
    print(f"  Knowledge Base: {len(KNOWLEDGE_BASE)} entries | Top-K: 5 | Runs: {n_runs}")
    print(f"  Articles: {len(SEED_ARTICLES)}")
    print("=" * 70)

    evaluations = []
    for article in SEED_ARTICLES:
        print(f"\n{'='*70}")
        print(f"  {article.id}: {article.title}")
        print(f"  Expected: bias={article.expected_bias} ({article.expected_bias_category}), "
              f"controversy={article.expected_controversy} ({article.expected_controversy_level})")
        print(f"{'='*70}")

        ev = evaluate_article(article, n_runs=n_runs)
        evaluations.append(ev)

    # Generate report
    report = generate_report(evaluations, n_runs)

    # Print report to console
    print("\n\n" + report)

    # Save report to file
    report_dir = os.path.dirname(os.path.abspath(__file__))
    report_path = os.path.join(report_dir, f"eval_report_{time.strftime('%Y%m%d_%H%M%S')}.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"\nReport saved to: {report_path}")


if __name__ == "__main__":
    main()
