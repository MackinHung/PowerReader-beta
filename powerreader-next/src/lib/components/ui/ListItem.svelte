<script>
  let { headline = '', supporting = '', onclick, leading, trailing } = $props();
</script>

{#if onclick}
  <button class="md-list-item clickable" {onclick}>
    {#if leading}
      <div class="item-leading">
        {@render leading()}
      </div>
    {/if}
    <div class="item-content">
      <span class="item-headline">{headline}</span>
      {#if supporting}
        <span class="item-supporting">{supporting}</span>
      {/if}
    </div>
    {#if trailing}
      <div class="item-trailing">
        {@render trailing()}
      </div>
    {/if}
  </button>
{:else}
  <div class="md-list-item" role="listitem">
    {#if leading}
      <div class="item-leading">
        {@render leading()}
      </div>
    {/if}
    <div class="item-content">
      <span class="item-headline">{headline}</span>
      {#if supporting}
        <span class="item-supporting">{supporting}</span>
      {/if}
    </div>
    {#if trailing}
      <div class="item-trailing">
        {@render trailing()}
      </div>
    {/if}
  </div>
{/if}

<style>
  .md-list-item {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 56px;
    padding: 8px 16px;
    width: 100%;
    border: none;
    background: transparent;
    text-align: left;
    font: inherit;
    color: inherit;
    position: relative;
  }
  .md-list-item::after {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--md-sys-motion-duration-short4);
    pointer-events: none;
  }
  .clickable {
    cursor: pointer;
  }
  .clickable:hover::after { opacity: var(--md-sys-state-hover-opacity); }
  .clickable:active::after { opacity: var(--md-sys-state-pressed-opacity); }
  .item-leading {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--md-sys-color-on-surface-variant);
  }
  .item-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .item-headline {
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item-supporting {
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item-trailing {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
