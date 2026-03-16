<script>
  let { minColumnWidth = '320px', gap = '12px', children } = $props();
</script>

<div
  class="responsive-grid"
  style="--grid-min: {minColumnWidth}; --grid-gap: {gap};"
>
  {@render children?.()}
</div>

<style>
  .responsive-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--grid-min, 320px), 1fr));
    gap: var(--grid-gap, 12px);
    width: 100%;
  }
</style>
