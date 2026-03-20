/**
 * Card Share Utility
 *
 * Handles Web Share API with download fallback.
 */

import type { ShareResult } from './types.js';

/**
 * Shares a card image blob via Web Share API or downloads as fallback.
 */
export async function shareCard(blob: Blob, title: string): Promise<ShareResult> {
  const file = new File([blob], 'powerreader-analysis.png', { type: 'image/png' });

  // Try native share with file support
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title,
        files: [file],
      });
      return { method: 'native', success: true };
    } catch {
      // User cancelled or share failed — fall through to download
    }
  }

  // Download fallback
  downloadBlob(blob, 'powerreader-analysis.png');
  return { method: 'download', success: true };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
