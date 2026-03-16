<script module>
  import { writable } from 'svelte/store';

  const snackbarState = writable({ visible: false, message: '', action: null, duration: 4000 });

  export function showSnackbar(message, opts = {}) {
    snackbarState.set({
      visible: true,
      message,
      action: opts.action ?? null,
      duration: opts.duration ?? 4000
    });
  }

  export { snackbarState };
</script>

<script>
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';

  let visible = $state(false);
  let message = $state('');
  let action = $state(null);
  let timer = null;

  onMount(() => {
    const unsubscribe = snackbarState.subscribe(s => {
      visible = s.visible;
      message = s.message;
      action = s.action;
      if (timer) clearTimeout(timer);
      if (s.visible && s.duration > 0) {
        timer = setTimeout(() => {
          snackbarState.set({ visible: false, message: '', action: null, duration: 4000 });
        }, s.duration);
      }
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  });

  function dismiss() {
    snackbarState.set({ visible: false, message: '', action: null, duration: 4000 });
  }

  function handleAction() {
    action?.onclick?.();
    dismiss();
  }
</script>

{#if visible}
  <div class="md-snackbar" transition:fly={{ y: 48, duration: 250 }}>
    <span class="snackbar-message">{message}</span>
    {#if action}
      <button class="snackbar-action" onclick={handleAction}>
        {action.label}
      </button>
    {/if}
  </div>
{/if}

<style>
  .md-snackbar {
    position: fixed;
    bottom: 96px;
    left: 50%;
    transform: translateX(-50%);
    max-width: 344px;
    width: calc(100% - 32px);
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    background: var(--md-sys-color-inverse-surface);
    color: var(--md-sys-color-inverse-on-surface);
    box-shadow: var(--md-sys-elevation-3);
    z-index: 2000;
  }
  .snackbar-message {
    flex: 1;
    font: var(--md-sys-typescale-body-medium-font);
  }
  .snackbar-action {
    flex-shrink: 0;
    border: none;
    background: transparent;
    color: var(--md-sys-color-primary-container);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
    padding: 8px;
    border-radius: var(--md-sys-shape-corner-extra-small);
  }
  .snackbar-action:hover {
    background: color-mix(in srgb, var(--md-sys-color-primary-container) 8%, transparent);
  }
</style>
