<script>
  /**
   * SourceIcon — compact inline brand icon for news sources.
   * Shows only the colored square with character (no badge frame or name text).
   * Use alongside source name text for lightweight brand identification.
   */
  import { getSourceInfo } from '$lib/core/sources.js';

  let { source = '', size = 'small' } = $props();

  let info = $derived(getSourceInfo(source));
</script>

<span
  class="source-icon {size}"
  style="background: {info.color}"
  title={info.name}
  aria-label={info.name}
>{info.icon}</span>

<style>
  .source-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    color: #FFFFFF;
    font-weight: 900;
    flex-shrink: 0;
    line-height: 1;
    vertical-align: middle;
  }
  .small {
    width: 18px;
    height: 18px;
    font-size: 10px;
  }
  .medium {
    width: 22px;
    height: 22px;
    font-size: 12px;
  }
</style>
