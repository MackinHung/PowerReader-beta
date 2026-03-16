<script>
  import Card from '$lib/components/ui/Card.svelte';

  let { items = [] } = $props();

  let expandedIndex = $state(-1);

  function toggle(index) {
    expandedIndex = expandedIndex === index ? -1 : index;
  }
</script>

<Card variant="filled">
  <div class="knowledge-panel">
    <div class="panel-header">
      <span class="material-symbols-outlined header-icon">school</span>
      <span class="header-title">AI 使用的背景知識</span>
    </div>
    <p class="education-text">這些是 AI 分析時參考的背景資料</p>

    <div class="items">
      {#each items as item, i}
        <div class="item" class:expanded={expandedIndex === i}>
          <button class="item-header" onclick={() => toggle(i)}>
            <span class="category-badge">{item.category}</span>
            <span class="item-title">{item.title}</span>
            <span class="material-symbols-outlined item-icon" class:rotated={expandedIndex === i}>
              expand_more
            </span>
          </button>
          {#if expandedIndex === i}
            <div class="item-content">
              <p>{item.content}</p>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</Card>

<style>
  .knowledge-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .header-icon {
    font-size: 20px;
    color: var(--md-sys-color-primary);
  }
  .header-title {
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .education-text {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    margin: 0;
  }
  .items {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .item {
    border-radius: var(--md-sys-shape-corner-small);
    overflow: hidden;
  }
  .item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px;
    border: none;
    background: var(--md-sys-color-surface-container);
    color: inherit;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }
  .item-header:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .category-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-tertiary-container);
    background: var(--md-sys-color-tertiary-container);
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .item-title {
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item-icon {
    font-size: 20px;
    color: var(--md-sys-color-on-surface-variant);
    transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
    flex-shrink: 0;
  }
  .item-icon.rotated {
    transform: rotate(180deg);
  }
  .item-content {
    padding: 8px 12px 12px;
    background: var(--md-sys-color-surface-container);
  }
  .item-content p {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.5;
    white-space: pre-wrap;
  }
</style>
