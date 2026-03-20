<script>
  /**
   * BlindspotAlert — full-width warning banner for coverage blindspots.
   * Uses error-container colors, shows specific blindspot type message.
   */
  let { type = '', isBlindspot = false } = $props();

  const MESSAGES = {
    green_only: { icon: 'visibility_off', text: '報導盲區：僅綠營報導（缺少藍/白觀點）' },
    blue_only: { icon: 'visibility_off', text: '報導盲區：僅藍營報導（缺少綠/白觀點）' },
    white_missing: { icon: 'warning', text: '報導盲區：缺乏中立報導' },
    imbalanced: { icon: 'balance', text: '報導失衡：各陣營比例嚴重不均' },
  };

  let config = $derived(isBlindspot && type ? (MESSAGES[type] || null) : null);
</script>

{#if config}
  <div class="blindspot-alert" role="alert">
    <span class="material-symbols-outlined alert-icon">{config.icon}</span>
    <span class="alert-text">{config.text}</span>
  </div>
{/if}

<style>
  .blindspot-alert {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--md-sys-color-error-container);
    color: var(--md-sys-color-on-error-container);
    border-radius: 0;
    border: 3px solid var(--pr-ink);
    font: var(--md-sys-typescale-label-medium-font);
    animation: slide-in-top var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate);
  }
  .alert-icon {
    font-size: 18px;
    flex-shrink: 0;
  }
  .alert-text {
    flex: 1;
    min-width: 0;
  }
</style>
