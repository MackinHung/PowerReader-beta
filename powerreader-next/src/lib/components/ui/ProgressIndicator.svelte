<script>
  let { type = 'linear', value = null } = $props();

  let indeterminate = $derived(value === null || value === undefined);
  let clampedValue = $derived(Math.max(0, Math.min(100, value ?? 0)));

  // SVG circular values
  let radius = 20;
  let circumference = $derived(2 * Math.PI * radius);
  let dashOffset = $derived(circumference - (clampedValue / 100) * circumference);
</script>

{#if type === 'linear'}
  <div class="md-progress-linear" role="progressbar" aria-valuenow={indeterminate ? undefined : clampedValue} aria-valuemin="0" aria-valuemax="100">
    <div class="linear-track">
      <div class="linear-indicator" class:indeterminate style:width={indeterminate ? undefined : `${clampedValue}%`}></div>
    </div>
  </div>
{:else}
  <svg class="md-progress-circular" class:indeterminate viewBox="0 0 48 48" width="48" height="48" role="progressbar" aria-valuenow={indeterminate ? undefined : clampedValue}>
    <circle class="circular-track" cx="24" cy="24" r={radius} fill="none" stroke-width="4" />
    <circle
      class="circular-indicator"
      cx="24" cy="24" r={radius}
      fill="none" stroke-width="4"
      stroke-dasharray={circumference}
      stroke-dashoffset={indeterminate ? circumference * 0.75 : dashOffset}
      stroke-linecap="round"
    />
  </svg>
{/if}

<style>
  .md-progress-linear {
    width: 100%;
    height: 4px;
  }
  .linear-track {
    width: 100%;
    height: 100%;
    border-radius: var(--md-sys-shape-corner-full);
    background: var(--md-sys-color-secondary-container);
    overflow: hidden;
  }
  .linear-indicator {
    height: 100%;
    border-radius: var(--md-sys-shape-corner-full);
    background: var(--md-sys-color-primary);
    transition: width var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
  }
  .linear-indicator.indeterminate {
    width: 40% !important;
    animation: linear-slide 1.5s var(--md-sys-motion-easing-standard) infinite;
  }
  @keyframes linear-slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  .md-progress-circular {
    display: block;
  }
  .circular-track {
    stroke: var(--md-sys-color-secondary-container);
  }
  .circular-indicator {
    stroke: var(--md-sys-color-primary);
    transform: rotate(-90deg);
    transform-origin: center;
    transition: stroke-dashoffset var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
  }
  .md-progress-circular.indeterminate {
    animation: circular-spin 1.5s linear infinite;
  }
  .indeterminate .circular-indicator {
    transition: none;
  }
  @keyframes circular-spin {
    100% { transform: rotate(360deg); }
  }
</style>
