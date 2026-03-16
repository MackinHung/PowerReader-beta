<script>
  let { dividers = false, children } = $props();
</script>

<div class="md-list" class:dividers role="list">
  {@render children?.()}
</div>

<style>
  .md-list {
    display: flex;
    flex-direction: column;
    width: 100%;
  }
  .dividers :global(.md-list-item + .md-list-item) {
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }
</style>
