<script>
  import { fade, fly } from 'svelte/transition';

  let { open = $bindable(false), title = '', fullscreen = false, onclose, children } = $props();

  function handleBackdropClick() {
    open = false;
    onclose?.();
  }

  function handleClose() {
    open = false;
    onclose?.();
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') handleClose();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="md-dialog-backdrop"
    transition:fade={{ duration: 200 }}
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <div
      class="md-dialog-content"
      class:fullscreen
      transition:fly={{ y: fullscreen ? 100 : 30, duration: 300 }}
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header class="dialog-header">
        <h2 class="dialog-title">{title}</h2>
        <button class="dialog-close" onclick={handleClose} aria-label="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>
      <div class="dialog-body">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}

<style>
  .md-dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.32);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }
  .md-dialog-content {
    background: #FFFFFF;
    border: 4px solid var(--pr-ink);
    box-shadow: 12px 12px 0px var(--pr-ink);
    border-radius: 0;
    max-width: 560px;
    width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .fullscreen {
    max-width: 100%;
    max-height: 100%;
    width: 100%;
    height: 100%;
    border-radius: 0;
  }
  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 24px 0;
  }
  .dialog-title {
    font: 900 24px/32px var(--pr-font-sans);
    color: var(--pr-ink);
  }
  .dialog-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: 3px solid var(--pr-ink);
    border-radius: 0;
    box-shadow: 2px 2px 0px var(--pr-ink);
    background: #FFFFFF;
    color: var(--pr-ink);
    cursor: pointer;
    transition: transform 100ms ease, box-shadow 100ms ease;
  }
  .dialog-close:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0px var(--pr-ink);
  }
  .dialog-close:active {
    transform: translate(2px, 2px);
    box-shadow: 0px 0px 0px var(--pr-ink);
  }
  .dialog-body {
    padding: 24px;
    overflow-y: auto;
  }
</style>
