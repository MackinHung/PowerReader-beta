<script>
  let { icon, label = '', variant = 'standard', disabled = false, onclick } = $props();
</script>

<button
  class="md-icon-button {variant}"
  aria-label={label}
  {disabled}
  {onclick}
>
  <span class="material-symbols-outlined">{icon}</span>
</button>

<style>
  .md-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border: none;
    border-radius: var(--md-sys-shape-corner-full);
    cursor: pointer;
    position: relative;
    overflow: hidden;
    font-size: 24px;
    padding: 0;
  }
  .md-icon-button::after {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0;
    transition: opacity var(--md-sys-motion-duration-short4);
    pointer-events: none;
  }
  .md-icon-button:hover::after { opacity: var(--md-sys-state-hover-opacity); }
  .md-icon-button:active::after { opacity: var(--md-sys-state-pressed-opacity); }
  .standard {
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
  }
  .filled {
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    width: 40px;
    height: 40px;
  }
  .tonal {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
    width: 40px;
    height: 40px;
  }
  .md-icon-button:disabled {
    opacity: 0.38;
    cursor: default;
    pointer-events: none;
  }
</style>
