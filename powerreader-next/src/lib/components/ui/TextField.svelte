<script>
  let {
    value = $bindable(''),
    label = '',
    type = 'text',
    error = '',
    helper = '',
    disabled = false
  } = $props();

  let focused = $state(false);
  let hasValue = $derived(value !== '' && value != null);
</script>

<div class="md-text-field" class:focused class:has-value={hasValue} class:error={!!error} class:disabled>
  <div class="field-container">
    <input
      class="field-input"
      {type}
      bind:value
      {disabled}
      onfocus={() => focused = true}
      onblur={() => focused = false}
      id={label}
    />
    {#if label}
      <label class="field-label" for={label}>{label}</label>
    {/if}
  </div>
  {#if error}
    <p class="field-helper error-text">{error}</p>
  {:else if helper}
    <p class="field-helper">{helper}</p>
  {/if}
</div>

<style>
  .md-text-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }
  .field-container {
    position: relative;
    height: 56px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    border: 1px solid var(--md-sys-color-outline);
    transition: border-color var(--md-sys-motion-duration-short4);
  }
  .focused .field-container {
    border: 2px solid var(--md-sys-color-primary);
  }
  .error .field-container {
    border-color: var(--md-sys-color-error);
  }
  .error.focused .field-container {
    border: 2px solid var(--md-sys-color-error);
  }
  .field-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 20px 16px 8px;
    border: none;
    background: transparent;
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface);
    outline: none;
  }
  .field-label {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface-variant);
    pointer-events: none;
    transition: all var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
    background: var(--md-sys-color-surface);
    padding: 0 4px;
  }
  .focused .field-label,
  .has-value .field-label {
    top: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-primary);
  }
  .error .field-label {
    color: var(--md-sys-color-error);
  }
  .field-helper {
    padding: 0 16px;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .error-text {
    color: var(--md-sys-color-error);
  }
  .disabled {
    opacity: 0.38;
    pointer-events: none;
  }
</style>
