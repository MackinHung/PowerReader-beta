<script>
  let { checked = $bindable(false), disabled = false, label = '' } = $props();

  function toggle() {
    if (!disabled) checked = !checked;
  }
</script>

<label class="md-switch" class:disabled>
  {#if label}
    <span class="switch-label">{label}</span>
  {/if}
  <button
    class="switch-track"
    class:checked
    role="switch"
    aria-checked={checked}
    aria-label={label || 'Toggle'}
    {disabled}
    onclick={toggle}
  >
    <div class="switch-thumb"></div>
  </button>
</label>

<style>
  .md-switch {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
  }
  .disabled {
    opacity: 0.38;
    cursor: default;
    pointer-events: none;
  }
  .switch-label {
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface);
  }
  .switch-track {
    position: relative;
    width: 52px;
    height: 32px;
    border-radius: 0;
    border: 2px solid var(--pr-ink);
    background: var(--md-sys-color-surface-container-highest);
    cursor: pointer;
    padding: 0;
    transition: background var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
                border-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .switch-track.checked {
    background: var(--md-sys-color-primary);
    border-color: var(--md-sys-color-primary);
  }
  .switch-thumb {
    position: absolute;
    top: 50%;
    left: 6px;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    border-radius: 0;
    background: var(--md-sys-color-outline);
    transition: left var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
                width var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
                height var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
                background var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .checked .switch-thumb {
    left: 24px;
    width: 24px;
    height: 24px;
    background: var(--md-sys-color-on-primary);
  }
</style>
