<script>
  /**
   * Accordion — reusable animated expand/collapse panel.
   * Replaces native <details> with smooth grid-based animation,
   * Material chevron icon, and proper accessibility.
   */
  let { title = '', badge = '', open = false, children } = $props();

  let expanded = $state(open);
  const regionId = `accordion-region-${Math.random().toString(36).slice(2, 8)}`;

  function toggle() {
    expanded = !expanded;
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  }
</script>

<div class="accordion">
  <button
    class="accordion-trigger"
    aria-expanded={expanded}
    aria-controls={regionId}
    onclick={toggle}
    onkeydown={handleKeydown}
    type="button"
  >
    <span class="material-symbols-outlined accordion-chevron" class:expanded>
      chevron_right
    </span>
    <span class="accordion-title">{title}</span>
    {#if badge}
      <span class="accordion-badge">{badge}</span>
    {/if}
  </button>

  <div
    id={regionId}
    role="region"
    class="accordion-panel"
    class:expanded
  >
    <div class="accordion-content">
      {@render children?.()}
    </div>
  </div>
</div>

<style>
  .accordion {
    border-top: var(--pr-divider, 1px solid var(--md-sys-color-surface-container-high));
  }

  .accordion-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 48px;
    padding: 12px 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;
  }
  .accordion-trigger:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 4%, transparent);
  }
  .accordion-trigger:focus-visible {
    outline: 3px solid #FF5722;
    outline-offset: -3px;
  }

  .accordion-chevron {
    font-size: 20px;
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
    transition: transform var(--md-sys-motion-duration-short4, 200ms)
                var(--md-sys-motion-easing-standard, cubic-bezier(0.2, 0, 0, 1));
  }
  .accordion-chevron.expanded {
    transform: rotate(90deg);
  }

  .accordion-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--pr-heading-tertiary, 700 clamp(14px, 2.5vw, 16px)/1.4 var(--pr-font-sans));
    color: var(--md-sys-color-on-surface);
  }

  .accordion-badge {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .accordion-panel {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows var(--md-sys-motion-duration-medium2, 300ms)
                var(--md-sys-motion-easing-standard, cubic-bezier(0.2, 0, 0, 1));
  }
  .accordion-panel.expanded {
    grid-template-rows: 1fr;
  }

  .accordion-content {
    overflow: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    .accordion-chevron {
      transition: none;
    }
    .accordion-panel {
      transition: none;
    }
  }
</style>
