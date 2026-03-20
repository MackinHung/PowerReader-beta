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
    border-radius: 0;
    border: 3px solid var(--pr-ink);
    box-shadow: 4px 4px 0px var(--pr-ink);
    background: #FFFFFF;
    transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
  }
  .focused .field-container {
    border: 3px solid #FF5722;
    transform: translate(2px, 2px);
    box-shadow: 2px 2px 0px var(--pr-ink);
  }
  .error .field-container {
    border-color: var(--md-sys-color-error);
  }
  .error.focused .field-container {
    border: 3px solid var(--md-sys-color-error);
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
    background: transparent;
    padding: 0 4px;
  }
  .focused .field-label,
  .has-value .field-label {
    top: -10px;
    background: #FFFFFF;
    border: 1px solid var(--pr-ink);
    font: 900 12px var(--pr-font-sans);
    color: var(--pr-ink);
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
