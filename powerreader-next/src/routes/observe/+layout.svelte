<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';

  let { children } = $props();

  const tabItems = [
    { label: '盲區', value: 'blindspot' },
    { label: '比較', value: 'compare' }
  ];

  let currentPath = $derived(page.url.pathname);
  let activeTab = $state('blindspot');
  let navigating = false;

  // Sync route -> tab (when user navigates via URL or back button)
  $effect(() => {
    const path = currentPath;
    const pathTab = path.includes('/compare') ? 'compare' : 'blindspot';
    untrack(() => {
      if (activeTab !== pathTab) {
        navigating = true;
        activeTab = pathTab;
        navigating = false;
      }
    });
  });

  // Sync tab -> route (when user clicks tab)
  $effect(() => {
    const tab = activeTab;
    if (navigating) return;
    untrack(() => {
      const target = `/observe/${tab}`;
      if (target !== currentPath) {
        goto(target);
      }
    });
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
