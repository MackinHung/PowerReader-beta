/**
 * CJK Text Wrapping Utilities
 *
 * Pure functions for measuring and wrapping CJK text on Canvas.
 * Handles Chinese punctuation no-break rules.
 */

/** Punctuation that must not appear at the start of a line. */
const NO_START = new Set('，。！？；：、）」』】》…—');

/** Punctuation that must not appear at the end of a line. */
const NO_END = new Set('（「『【《');

export interface WrapResult {
  readonly lines: readonly string[];
  readonly totalHeight: number;
}

/**
 * Wraps text to fit within maxWidth on a Canvas context.
 *
 * @param ctx - Canvas 2D rendering context (with font already set)
 * @param text - The text to wrap
 * @param maxWidth - Maximum pixel width per line
 * @param lineHeight - Pixel height per line
 * @param maxLines - Maximum number of lines (truncate with … if exceeded)
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number,
  maxLines: number = Infinity,
): WrapResult {
  if (!text) return { lines: [], totalHeight: 0 };

  const chars = [...text];
  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const test = current + ch;
    const w = ctx.measureText(test).width;

    if (w <= maxWidth) {
      current = test;
      continue;
    }

    // Would exceed width — break here
    // Check no-start rule: if next char is punctuation that can't start a line,
    // keep it on current line
    if (i + 1 < chars.length && NO_START.has(chars[i + 1])) {
      current += ch;
      continue;
    }

    // Check no-end rule: if current char can't end a line, carry it to next line
    if (NO_END.has(ch)) {
      lines.push(current);
      current = ch;
    } else {
      lines.push(current + ch);
      current = '';
    }

    // Check max lines with truncation
    if (lines.length >= maxLines) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] = truncateWithEllipsis(ctx, last, maxWidth);
      return { lines: lines.slice(0, maxLines), totalHeight: maxLines * lineHeight };
    }
  }

  if (current) {
    lines.push(current);
  }

  // Final truncation check
  if (lines.length > maxLines) {
    const truncated = lines.slice(0, maxLines);
    truncated[maxLines - 1] = truncateWithEllipsis(ctx, truncated[maxLines - 1], maxWidth);
    return { lines: truncated, totalHeight: maxLines * lineHeight };
  }

  return { lines, totalHeight: lines.length * lineHeight };
}

/**
 * Truncates a single line to fit within maxWidth, appending ⋯⋯.
 */
function truncateWithEllipsis(
  ctx: CanvasRenderingContext2D,
  line: string,
  maxWidth: number,
): string {
  const ellipsis = '⋯⋯';
  const ellipsisW = ctx.measureText(ellipsis).width;
  const target = maxWidth - ellipsisW;

  if (ctx.measureText(line).width <= maxWidth) return line;

  const chars = [...line];
  let result = '';
  for (const ch of chars) {
    const test = result + ch;
    if (ctx.measureText(test).width > target) break;
    result = test;
  }
  return result + ellipsis;
}

/**
 * Measures the width of a text string using the current Canvas font.
 */
export function measureLine(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).width;
}
