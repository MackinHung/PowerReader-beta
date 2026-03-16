<script>
  let { data = [], color = 'var(--md-sys-color-primary)', height = 60 } = $props();

  let tooltip = $state({ visible: false, x: 0, y: 0, date: '', value: 0 });

  let pointData = $derived.by(() => {
    if (data.length < 2) return { polyline: '', polygon: '', coords: [] };

    const padding = 4;
    const w = 300;
    const h = height;
    const values = data.map((d) => d.value);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = maxV - minV || 1;

    const coords = data.map((d, i) => ({
      x: padding + (i / (data.length - 1)) * (w - padding * 2),
      y: padding + (1 - (d.value - minV) / range) * (h - padding * 2),
      date: d.date,
      value: d.value,
    }));

    const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');
    const polygon = `${coords[0].x},${h} ${polyline} ${coords[coords.length - 1].x},${h}`;

    return { polyline, polygon, coords };
  });

  function handleHover(coord, event) {
    const svg = event.currentTarget.closest('svg');
    const rect = svg.getBoundingClientRect();
    tooltip = {
      visible: true,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top - 30,
      date: coord.date,
      value: coord.value,
    };
  }

  function handleLeave() {
    tooltip = { ...tooltip, visible: false };
  }
</script>

<div class="trend-chart" style="height: {height}px">
  {#if data.length >= 2}
    <svg viewBox="0 0 300 {height}" preserveAspectRatio="none" width="100%" {height}>
      <polygon points={pointData.polygon} fill={color} opacity="0.15" />
      <polyline
        points={pointData.polyline}
        fill="none"
        stroke={color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      {#each pointData.coords as coord}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <circle
          cx={coord.x}
          cy={coord.y}
          r="4"
          fill="transparent"
          stroke="transparent"
          stroke-width="12"
          onmouseenter={(e) => handleHover(coord, e)}
          onmouseleave={handleLeave}
        />
      {/each}
    </svg>
    {#if tooltip.visible}
      <div class="tooltip" style="left: {tooltip.x}px; top: {tooltip.y}px">
        <span class="tooltip-date">{tooltip.date}</span>
        <span class="tooltip-value">{tooltip.value}</span>
      </div>
    {/if}
  {:else}
    <div class="no-data">資料不足</div>
  {/if}
</div>

<style>
  .trend-chart {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
  }
  .tooltip {
    position: absolute;
    background: var(--md-sys-color-inverse-surface);
    color: var(--md-sys-color-inverse-on-surface);
    padding: 4px 8px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    font: var(--md-sys-typescale-label-small-font);
    pointer-events: none;
    transform: translateX(-50%);
    white-space: nowrap;
    display: flex;
    gap: 6px;
    z-index: 1;
  }
  .tooltip-date {
    opacity: 0.8;
  }
  .tooltip-value {
    font-weight: 600;
  }
  .no-data {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
