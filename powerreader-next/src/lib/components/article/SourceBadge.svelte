<script>
  /**
   * SourceBadge — neutral media source badge with brand icon.
   * No political camp coloring — shows media identity only.
   */
  import { getSourceInfo } from '$lib/core/sources.js';

  let { source = '', size = 'small' } = $props();

  let info = $derived(getSourceInfo(source));
</script>

<span class="source-badge {size}">
  <span class="brand-icon" style="background: {info.color}">{info.icon}</span>
  <span class="source-name">{info.name}</span>
</span>

<style>
  .source-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: 0;
    border: 2px solid var(--pr-ink);
    background: var(--md-sys-color-surface-container);
    white-space: nowrap;
  }
  .small {
    padding: 2px 8px;
    font: var(--md-sys-typescale-label-small-font);
  }
  .medium {
    padding: 4px 12px;
    font: var(--md-sys-typescale-label-large-font);
  }
  .brand-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 0;
    background: #666;
    color: #FFFFFF;
    font-size: 11px;
    font-weight: 900;
    flex-shrink: 0;
    line-height: 1;
    border: 1px solid var(--pr-ink);
  }
  .small .brand-icon {
    width: 18px;
    height: 18px;
    font-size: 10px;
  }
  .source-name {
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
