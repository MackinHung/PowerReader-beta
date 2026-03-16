<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import Tabs from '$lib/components/ui/Tabs.svelte';

  let { children } = $props();

  const tabItems = [
    { label: '盲區', value: 'blindspot' },
    { label: '比較', value: 'compare' }
  ];

  let currentPath = $derived(page.url.pathname);
  let activeTab = $state('blindspot');
  let lastSyncedPath = '';

  // Sync route -> tab (when user navigates via URL or back button)
  $effect(() => {
    const pathTab = currentPath.includes('/compare') ? 'compare' : 'blindspot';
    if (currentPath !== lastSyncedPath) {
      activeTab = pathTab;
      lastSyncedPath = currentPath;
    }
  });

  // Sync tab -> route (when user clicks tab)
  $effect(() => {
    const target = `/observe/${activeTab}`;
    if (target !== currentPath && lastSyncedPath === currentPath) {
      lastSyncedPath = target;
      goto(target);
    }
  });
</script>

<div class="observe-layout">
  <Tabs items={tabItems} bind:active={activeTab} />
  {@render children?.()}
</div>

<style>
  .observe-layout {
    display: flex;
    flex-direction: column;
  }
</style>
