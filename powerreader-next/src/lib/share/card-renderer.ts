/**
 * Canvas Card Renderer
 *
 * Pure-function engine for rendering branded share cards.
 * Produces 1080×1350px (IG 4:5) PNG blobs using Canvas 2D API.
 * Zero external dependencies.
 */

import { wrapText, measureLine } from './card-text.js';
import type { ArticleCardData, EventCardData } from './types.js';

// ── Dimensions ──────────────────────────────────────────────

const W = 1080;
const H = 1350;
const PAD = 60;
const CONTENT_W = W - PAD * 2;

// ── Colors ──────────────────────────────────────────────────

const BG = '#FFFFFF';
const ACCENT = '#FF5722';
const INK = '#1A1A1A';
const TEXT_PRIMARY = '#1A1A1A';
const TEXT_SECONDARY = '#6B6B6B';
const CYAN = '#00E5FF';
const BORDER = '#1A1A1A';

const BIAS_COLORS = [
  '#1B5E20', '#2E7D32', '#66BB6A', '#9E9E9E',
  '#42A5F5', '#1565C0', '#0D47A1',
] as const;

const BIAS_LABELS = ['極綠', '偏綠', '略綠', '中立', '略藍', '偏藍', '極藍'] as const;

const CAMP_COLORS = {
  green: { start: '#1B5E20', end: '#A5D6A7', label: '民進黨' },
  white: { start: '#28C8C8', end: '#80E4E4', label: '民眾黨' },
  blue: { start: '#0D47A1', end: '#90CAF9', label: '國民黨' },
} as const;

const EMOTION_LEVELS = [
  { max: 20, label: '冷靜客觀', color: '#4CAF50' },
  { max: 40, label: '略帶立場', color: '#2196F3' },
  { max: 60, label: '情緒化', color: '#FFC107' },
  { max: 80, label: '煽情', color: '#FF9800' },
  { max: 100, label: '極端煽動', color: '#F44336' },
] as const;

// ── Fonts ───────────────────────────────────────────────────
// Fallback chain for CJK
const SERIF = '"Noto Serif TC", "Source Han Serif TC", serif';
const SANS = '"Noto Sans TC", sans-serif';

// ── Article Card ────────────────────────────────────────────

export async function renderArticleCard(data: ArticleCardData): Promise<Blob> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d')!;

  drawBackground(ctx);
  let y = PAD;

  y = drawHeader(ctx, y);
  y = drawTitle(ctx, data.title, y);
  y = drawSourceBadge(ctx, `來源：${data.source}`, y);

  if (data.isPolitical && data.biasScore != null) {
    y = drawSectionLabel(ctx, '立場偏向', y);
    y = drawBiasSpectrum(ctx, PAD, y, CONTENT_W, data.biasScore);
  }

  if (data.isPolitical && data.campRatio) {
    y = drawSectionLabel(ctx, '陣營比例', y);
    y = drawCampBar(ctx, PAD, y, CONTENT_W, data.campRatio);
  }

  if (!data.isPolitical) {
    y = drawNonPoliticalBadge(ctx, y);
  }

  if (data.emotionIntensity != null) {
    y = drawSectionLabel(ctx, '情緒強度', y);
    y = drawEmotionChip(ctx, PAD, y, data.emotionIntensity);
  }

  if (data.points.length > 0) {
    y = drawSectionLabel(ctx, '論述重點', y);
    y = drawPoints(ctx, PAD, y, CONTENT_W, data.points);
  }

  drawFooter(ctx);

  return canvasToBlob(canvas);
}

// ── Event Card ──────────────────────────────────────────────

export async function renderEventCard(data: EventCardData): Promise<Blob> {
  // Draw on max-height canvas first, then crop to content
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d')!;

  drawBackground(ctx);
  let y = PAD;

  y = drawHeader(ctx, y);
  y = drawTitle(ctx, data.title, y);

  // Stats row — large numbers with labels
  y += 10;
  y = drawEventStats(ctx, PAD, y, CONTENT_W, data);

  // Analysis progress — CTA when 0%, normal bar otherwise
  y += 10;
  if (data.analysisProgress.analyzed === 0) {
    y = drawAnalysisCTA(ctx, PAD, y, CONTENT_W, data.analysisProgress.total);
  } else {
    y = drawAnalysisProgressBar(ctx, PAD, y, CONTENT_W, data.analysisProgress);
  }

  if (data.blindspotType) {
    y = drawBlindspotWarning(ctx, y, data.blindspotType);
  }

  // Footer right after content
  y += 40;
  drawFooterAt(ctx, y);
  y += 50;

  // Bottom border anchor — 8px accent bar
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, y, W, 8);
  const finalH = y + 8 + 20;

  // Crop to actual content height
  const cropped = createCanvas(W, finalH);
  const cctx = cropped.getContext('2d')!;
  cctx.drawImage(canvas, 0, 0);

  return canvasToBlob(cropped);
}

// ── Drawing Helpers ─────────────────────────────────────────

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
}

function drawHeader(ctx: CanvasRenderingContext2D, y: number): number {
  // Full-width accent block
  const blockH = 130;
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, W, blockH);

  // Brand — white bold
  ctx.font = `900 40px ${SANS}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('POWERREADER', PAD, 56);

  // Subtitle — white lighter
  ctx.font = `24px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('新聞立場分析', PAD, 92);

  y = blockH + 36;
  return y;
}

function drawTitle(ctx: CanvasRenderingContext2D, title: string, y: number): number {
  ctx.font = `900 48px ${SANS}`;
  ctx.fillStyle = INK;
  const { lines } = wrapText(ctx, title, CONTENT_W, 64, 3);
  for (const line of lines) {
    y += 56;
    ctx.fillText(line, PAD, y);
  }
  y += 24;
  return y;
}

function drawSourceBadge(ctx: CanvasRenderingContext2D, text: string, y: number): number {
  // Source with border box
  ctx.font = `24px ${SANS}`;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = '#F5F5F5';
  ctx.fillRect(PAD, y, tw + 24, 38);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(PAD, y, tw + 24, 38);
  ctx.fillStyle = INK;
  ctx.fillText(text, PAD + 12, y + 26);
  y += 54;
  return y;
}

function drawSectionLabel(ctx: CanvasRenderingContext2D, label: string, y: number): number {
  y += 24;
  // Left accent mark
  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, y + 6, 4, 20);
  ctx.font = `700 26px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.fillText(label, PAD + 14, y + 24);
  y += 40;
  return y;
}

function drawBiasSpectrum(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  biasScore: number,
): number {
  const segW = w / 7;
  const barH = 24;

  // Draw 7 color segments
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = BIAS_COLORS[i];
    const sx = x + i * segW;
    ctx.fillRect(sx, y, segW, barH);
  }

  // Indicator position: biasScore 0-100 maps to segment 0-6
  // 0=極綠(seg0), 50=中立(seg3), 100=極藍(seg6)
  const normalizedPos = (biasScore / 100) * w;
  const dotX = x + normalizedPos;
  const dotY = y + barH / 2;

  // White outline dot
  ctx.beginPath();
  ctx.arc(dotX, dotY, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = TEXT_PRIMARY;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Inner dot
  ctx.beginPath();
  ctx.arc(dotX, dotY, 8, 0, Math.PI * 2);
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.fill();

  y += barH + 16;

  // Endpoint labels
  ctx.font = `24px ${SANS}`;
  ctx.fillStyle = '#2E7D32';
  ctx.textAlign = 'left';
  ctx.fillText('偏綠', x, y + 24);
  ctx.fillStyle = '#1565C0';
  ctx.textAlign = 'right';
  ctx.fillText('偏藍', x + w, y + 24);
  ctx.textAlign = 'left';

  // Category label (centered)
  const segIdx = Math.round((biasScore / 100) * 6);
  const clampedIdx = Math.max(0, Math.min(6, segIdx));
  const catLabel = BIAS_LABELS[clampedIdx];
  ctx.font = `bold 28px ${SANS}`;
  ctx.fillStyle = BIAS_COLORS[clampedIdx];
  ctx.textAlign = 'center';
  ctx.fillText(catLabel, x + w / 2, y + 24);
  ctx.textAlign = 'left';

  y += 44;
  return y;
}

function drawCampBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  ratio: { green?: number; white?: number; blue?: number },
): number {
  const total = (ratio.green ?? 0) + (ratio.white ?? 0) + (ratio.blue ?? 0);
  if (total === 0) return y + 10;

  const barH = 28;
  let bx = x;

  const segments: Array<{ key: keyof typeof CAMP_COLORS; value: number }> = [
    { key: 'green', value: ratio.green ?? 0 },
    { key: 'white', value: ratio.white ?? 0 },
    { key: 'blue', value: ratio.blue ?? 0 },
  ];

  // Draw proportional bar
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.value <= 0) continue;
    const segW = (seg.value / total) * w;
    const cfg = CAMP_COLORS[seg.key];

    // Gradient fill
    const grad = ctx.createLinearGradient(bx, y, bx + segW, y);
    grad.addColorStop(0, cfg.start);
    grad.addColorStop(1, cfg.end);
    ctx.fillStyle = grad;

    ctx.fillRect(bx, y, segW, barH);

    // Percentage label if wide enough
    if (segW > 60) {
      ctx.font = `bold 18px ${SANS}`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(seg.value)}%`, bx + segW / 2, y + barH / 2 + 6);
      ctx.textAlign = 'left';
    }

    bx += segW;
  }

  y += barH + 16;

  // Legend
  let lx = x;
  for (const seg of segments) {
    if (seg.value <= 0) continue;
    const cfg = CAMP_COLORS[seg.key];

    // Dot
    ctx.beginPath();
    ctx.arc(lx + 8, y + 8, 8, 0, Math.PI * 2);
    ctx.fillStyle = cfg.start;
    ctx.fill();

    // Label
    ctx.font = `24px ${SANS}`;
    ctx.fillStyle = TEXT_PRIMARY;
    const label = `${cfg.label} ${Math.round(seg.value)}%`;
    ctx.fillText(label, lx + 22, y + 16);
    lx += measureLine(ctx, label) + 50;
  }

  y += 36;
  return y;
}

function drawEmotionChip(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  intensity: number,
): number {
  const level = EMOTION_LEVELS.find(l => intensity <= l.max) ?? EMOTION_LEVELS[4];

  // Chip background
  const chipW = 360;
  const chipH = 48;
  ctx.fillStyle = level.color + '33'; // 20% alpha
  ctx.fillRect(x, y, chipW, chipH);

  // Chip border
  ctx.strokeStyle = level.color + '66'; // 40% alpha
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, chipW, chipH);

  // Text
  ctx.font = `bold 24px ${SANS}`;
  ctx.fillStyle = level.color;
  ctx.fillText(`情緒強度：${level.label}`, x + 20, y + chipH / 2 + 8);

  y += chipH + 16;
  return y;
}

function drawPoints(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  points: readonly string[],
): number {
  const maxPoints = Math.min(points.length, 3);
  ctx.font = `28px ${SANS}`;
  ctx.fillStyle = TEXT_PRIMARY;

  for (let i = 0; i < maxPoints; i++) {
    const bullet = '• ';
    const bulletW = ctx.measureText(bullet).width;
    const { lines } = wrapText(ctx, points[i], w - bulletW - 10, 40, 2);

    for (let j = 0; j < lines.length; j++) {
      y += 38;
      if (j === 0) {
        ctx.fillText(bullet + lines[j], x, y);
      } else {
        ctx.fillText(lines[j], x + bulletW, y);
      }
    }
    y += 8;
  }

  return y;
}

function drawNonPoliticalBadge(ctx: CanvasRenderingContext2D, y: number): number {
  y += 20;
  const label = '非政治性報導';
  ctx.font = `bold 32px ${SANS}`;
  const tw = ctx.measureText(label).width;
  const chipW = tw + 48;
  const chipH = 52;
  const chipX = (W - chipW) / 2;

  // Badge background
  ctx.fillStyle = '#E8E4DE';
  ctx.fillRect(chipX, y, chipW, chipH);

  // Text
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.textAlign = 'center';
  ctx.fillText(label, W / 2, y + chipH / 2 + 10);
  ctx.textAlign = 'left';

  y += chipH + 20;
  return y;
}

function drawBlindspotWarning(
  ctx: CanvasRenderingContext2D,
  y: number,
  blindspotType: string,
): number {
  y += 10;
  const labelMap: Record<string, string> = {
    green_only: '⚠ 僅泛綠報導',
    blue_only: '⚠ 僅泛藍報導',
    white_missing: '⚠ 缺乏中立報導',
    imbalanced: '⚠ 報導失衡',
  };
  const label = labelMap[blindspotType] ?? `⚠ ${blindspotType}`;

  ctx.font = `bold 28px ${SANS}`;
  const tw = ctx.measureText(label).width;
  const chipW = tw + 40;
  const chipH = 48;
  const chipX = (W - chipW) / 2;

  ctx.fillStyle = '#FFF3E0';
  ctx.fillRect(chipX, y, chipW, chipH);

  ctx.strokeStyle = '#FF9800';
  ctx.lineWidth = 2;
  ctx.strokeRect(chipX, y, chipW, chipH);

  ctx.fillStyle = '#E65100';
  ctx.textAlign = 'center';
  ctx.fillText(label, W / 2, y + chipH / 2 + 9);
  ctx.textAlign = 'left';

  y += chipH + 16;
  return y;
}

function drawEventStats(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  data: EventCardData,
): number {
  const cols = [
    { value: String(data.articleCount), label: '篇報導' },
    { value: String(data.sourceCount), label: '家媒體' },
  ];

  // Oversized numbers — no border box, just whitespace
  for (let i = 0; i < cols.length; i++) {
    const cx = x + i * (w / cols.length);

    // Giant number
    ctx.font = `900 80px ${SANS}`;
    ctx.fillStyle = INK;
    ctx.fillText(cols[i].value, cx, y + 72);

    // Label to the right of number
    const numW = ctx.measureText(cols[i].value).width;
    ctx.font = `26px ${SANS}`;
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.fillText(cols[i].label, cx + numW + 10, y + 72);
  }

  y += 100;
  return y;
}

function drawAnalysisProgressBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  progress: { analyzed: number; total: number },
): number {
  const { analyzed, total } = progress;
  const pct = total > 0 ? Math.min(100, Math.round((analyzed / total) * 100)) : 0;

  // Label with accent mark
  ctx.fillStyle = ACCENT;
  ctx.fillRect(x, y + 4, 4, 20);
  ctx.font = `700 26px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.fillText('分析進度', x + 14, y + 24);
  y += 44;

  // Bar — white bg + black border + cyan fill
  const barH = 20;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x, y, w, barH);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, barH);

  if (pct > 0) {
    const fillW = Math.max(20, (pct / 100) * w);
    ctx.fillStyle = CYAN;
    ctx.fillRect(x + 1, y + 1, fillW - 2, barH - 2);
  }
  y += barH + 14;

  // Progress text
  ctx.font = `28px ${SANS}`;
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.fillText(`已分析 ${analyzed}/${total} 篇（${pct}%）`, x, y + 26);
  y += 50;

  return y;
}

function drawAnalysisCTA(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  total: number,
): number {
  // Large status headline — agency framing
  ctx.font = `900 36px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.fillText('這則事件尚未被分析', x, y + 36);
  y += 56;

  // Empowerment copy
  ctx.font = `28px ${SANS}`;
  ctx.fillStyle = ACCENT;
  ctx.fillText('成為第一個揭露立場偏見的人', x, y + 28);
  y += 48;

  // Minimal progress indicator
  ctx.font = `24px ${SANS}`;
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.fillText(`0/${total} 篇已分析`, x, y + 22);
  y += 44;

  return y;
}

function drawFooterContent(ctx: CanvasRenderingContext2D, y: number): void {
  // Single-line footer: URL — tagline
  ctx.font = `600 24px ${SANS}`;
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.textAlign = 'center';
  ctx.fillText('powerreader.pages.dev ── AI 驅動的新聞立場透視', W / 2, y + 28);
  ctx.textAlign = 'left';
}

function drawFooterAt(ctx: CanvasRenderingContext2D, y: number): void {
  drawFooterContent(ctx, y);
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
  drawFooterContent(ctx, H - 80);
  // Bottom border anchor
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, H - 8, W, 8);
}

// ── Canvas Utilities ────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  radii: number[] | number,
): void {
  const r = typeof radii === 'number'
    ? [radii, radii, radii, radii]
    : radii;
  // [topLeft, topRight, bottomRight, bottomLeft]
  ctx.beginPath();
  ctx.moveTo(x + r[0], y);
  ctx.lineTo(x + w - r[1], y);
  ctx.arcTo(x + w, y, x + w, y + r[1], r[1]);
  ctx.lineTo(x + w, y + h - r[2]);
  ctx.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]);
  ctx.lineTo(x + r[3], y + h);
  ctx.arcTo(x, y + h, x, y + h - r[3], r[3]);
  ctx.lineTo(x, y + r[0]);
  ctx.arcTo(x, y, x + r[0], y, r[0]);
  ctx.closePath();
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      'image/png',
    );
  });
}
