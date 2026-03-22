<script>
  import { untrack } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';
  import { showSnackbar } from '$lib/components/ui/Snackbar.svelte';
  import { t } from '$lib/i18n/zh-TW.js';
  import * as api from '$lib/core/api.js';

  const authStore = getAuthStore();

  let loading = $state(true);
  let items = $state([]);
  let inventory = $state([]);
  let selectedCategory = $state('all');
  let confirmItem = $state(null);
  let purchasing = $state(false);

  $effect(() => {
    if (typeof window === 'undefined') return;
    untrack(() => loadShop());
  });

  async function loadShop() {
    loading = true;
    try {
      const itemsResult = await api.fetchShopItems();
      if (itemsResult.success && itemsResult.data) {
        items = itemsResult.data.items;
      }
      if (authStore.isAuthenticated && authStore.token) {
        await authStore.fetchPoints();
        const invResult = await api.fetchInventory(authStore.token);
        if (invResult.success && invResult.data) {
          inventory = invResult.data.inventory;
        }
      }
    } catch (e) {
      console.error('Failed to load shop:', e);
    } finally {
      loading = false;
    }
  }

  let filteredItems = $derived(
    selectedCategory === 'all'
      ? items
      : items.filter(i => i.category === selectedCategory)
  );

  let userPointsCents = $derived(authStore.userPoints?.total_points_cents ?? 0);
  let displayPoints = $derived((userPointsCents / 100).toFixed(2));

  function isOwned(itemId) {
    return inventory.some(p => p.item_id === itemId && p.is_active);
  }

  function getOwnedCount(itemId) {
    return inventory.filter(p => p.item_id === itemId).length;
  }

  function canBuy(item) {
    if (userPointsCents < item.cost_cents) return false;
    if (item.max_per_user !== null && getOwnedCount(item.id) >= item.max_per_user) return false;
    return true;
  }

  function openConfirm(item) {
    if (!authStore.isAuthenticated) {
      showSnackbar(t('point_shop.login_required'));
      return;
    }
    if (userPointsCents < item.cost_cents) {
      showSnackbar(t('point_shop.insufficient_points'));
      return;
    }
    confirmItem = item;
  }

  async function confirmPurchase() {
    if (!confirmItem || !authStore.token) return;
    purchasing = true;
    try {
      const result = await api.purchaseShopItem(confirmItem.id, authStore.token);
      if (result.success) {
        showSnackbar(t('point_shop.purchase_success'));
        confirmItem = null;
        await loadShop();
      } else {
        const msg = result.error?.type === 'insufficient_points'
          ? t('point_shop.insufficient_points')
          : result.error?.type === 'already_owned'
            ? t('point_shop.owned')
            : t('point_shop.purchase_error');
        showSnackbar(msg);
      }
    } catch {
      showSnackbar(t('point_shop.purchase_error'));
    } finally {
      purchasing = false;
    }
  }

  async function handleUseItem(purchaseId) {
    if (!authStore.token) return;
    try {
      const result = await api.useShopItem(purchaseId, authStore.token);
      if (result.success) {
        showSnackbar(t('point_shop.use_success'));
        await loadShop();
      } else {
        showSnackbar(t('point_shop.use_error'));
      }
    } catch {
      showSnackbar(t('point_shop.use_error'));
    }
  }

  let activeInventory = $derived(inventory.filter(p => p.is_active));
</script>

<div class="shop-page">
  <!-- Header -->
  <section class="shop-header">
    <h1 class="shop-title">
      <span class="material-symbols-outlined title-icon">storefront</span>
      {t('point_shop.title')}
    </h1>
    <p class="shop-subtitle">{t('point_shop.subtitle')}</p>

    {#if authStore.isAuthenticated}
      <div class="points-badge">
        <span class="material-symbols-outlined">toll</span>
        <span class="points-value">{displayPoints}</span>
        <span class="points-label">{t('point_shop.your_points')}</span>
      </div>
    {/if}
  </section>

  <!-- Category Filter -->
  <div class="category-filter">
    {#each ['all', 'cosmetic', 'functional'] as cat}
      <button
        class="filter-chip"
        class:selected={selectedCategory === cat}
        onclick={() => selectedCategory = cat}
      >
        {t(`point_shop.category.${cat}`)}
      </button>
    {/each}
  </div>

  <!-- Shop Grid -->
  {#if loading}
    <div class="loading-state">
      <span class="material-symbols-outlined spinning">progress_activity</span>
    </div>
  {:else if filteredItems.length === 0}
    <div class="empty-state">
      <span class="material-symbols-outlined">storefront</span>
      <p>{t('point_shop.empty')}</p>
    </div>
  {:else}
    <div class="shop-grid">
      {#each filteredItems as item (item.id)}
        {@const owned = isOwned(item.id)}
        {@const affordable = userPointsCents >= item.cost_cents}
        <Card variant="elevated">
          <div class="item-card" class:owned class:unaffordable={!affordable && !owned}>
            <div class="item-icon-wrap">
              <span class="material-symbols-outlined item-icon">{item.icon}</span>
              {#if item.is_consumable}
                <span class="item-tag consumable">{t('point_shop.consumable')}</span>
              {:else}
                <span class="item-tag permanent">{t('point_shop.permanent')}</span>
              {/if}
            </div>
            <h3 class="item-name">{t(item.name_key)}</h3>
            <p class="item-desc">{t(item.description_key)}</p>
            <div class="item-footer">
              <span class="item-cost">
                <span class="material-symbols-outlined cost-icon">toll</span>
                {t('point_shop.cost', { cost: (item.cost_cents / 100).toFixed(2) })}
              </span>
              {#if owned && item.max_per_user !== null}
                <span class="owned-badge">{t('point_shop.owned')}</span>
              {:else}
                <button
                  class="buy-btn"
                  disabled={!canBuy(item) || !authStore.isAuthenticated}
                  onclick={() => openConfirm(item)}
                >
                  {t('point_shop.buy')}
                </button>
              {/if}
            </div>
          </div>
        </Card>
      {/each}
    </div>
  {/if}

  <!-- Inventory Section -->
  {#if authStore.isAuthenticated && activeInventory.length > 0}
    <section class="inventory-section">
      <h2 class="section-title">
        <span class="material-symbols-outlined section-icon">inventory_2</span>
        {t('point_shop.inventory_title')}
      </h2>
      <div class="inventory-list">
        {#each activeInventory as purchase (purchase.purchase_id)}
          <Card variant="filled">
            <div class="inv-item">
              <span class="material-symbols-outlined inv-icon">{purchase.icon}</span>
              <div class="inv-info">
                <span class="inv-name">{t(purchase.name_key)}</span>
                {#if purchase.expires_at}
                  {@const hoursLeft = Math.max(0, Math.round((new Date(purchase.expires_at).getTime() - Date.now()) / 3600000))}
                  <span class="inv-expires">{t('point_shop.expires_in', { hours: hoursLeft })}</span>
                {/if}
              </div>
              {#if purchase.is_consumable && !purchase.is_consumed}
                <button class="use-btn" onclick={() => handleUseItem(purchase.purchase_id)}>
                  {t('point_shop.use_item')}
                </button>
              {:else}
                <span class="inv-status active">{t('point_shop.active')}</span>
              {/if}
            </div>
          </Card>
        {/each}
      </div>
    </section>
  {/if}
</div>

<!-- Purchase Confirmation Dialog -->
{#if confirmItem}
  <div class="confirm-backdrop" onclick={() => { if (!purchasing) confirmItem = null; }}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="confirm-dialog" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <span class="material-symbols-outlined confirm-icon">{confirmItem.icon}</span>
      <h3 class="confirm-title">{t('point_shop.confirm_title')}</h3>
      <p class="confirm-desc">
        {t('point_shop.confirm_desc', {
          cost: (confirmItem.cost_cents / 100).toFixed(2),
          name: t(confirmItem.name_key)
        })}
      </p>
      <p class="confirm-balance">
        {t('point_shop.confirm_balance', {
          remaining: ((userPointsCents - confirmItem.cost_cents) / 100).toFixed(2)
        })}
      </p>
      <div class="confirm-actions">
        <button class="confirm-btn primary" disabled={purchasing} onclick={confirmPurchase}>
          {#if purchasing}
            <span class="material-symbols-outlined spinning">progress_activity</span>
          {:else}
            {t('point_shop.buy')}
          {/if}
        </button>
        <button class="confirm-btn text" disabled={purchasing} onclick={() => confirmItem = null}>
          {t('common.button.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .shop-page {
    padding: 16px;
    max-width: 800px;
    margin: 0 auto;
  }

  /* Header */
  .shop-header {
    margin-bottom: 24px;
    text-align: center;
  }
  .shop-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 0 0 8px;
    font: var(--md-sys-typescale-headline-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .title-icon {
    font-size: 28px;
    color: #FF5722;
  }
  .shop-subtitle {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .points-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    padding: 8px 16px;
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
    border-radius: 0;
    border: 2px solid var(--pr-ink);
    box-shadow: 3px 3px 0px var(--pr-ink);
    font: var(--md-sys-typescale-title-medium-font);
  }
  .points-value {
    font-weight: 700;
    font-size: 1.2em;
  }
  .points-label {
    font: var(--md-sys-typescale-label-medium-font);
    opacity: 0.8;
  }

  /* Category Filter */
  .category-filter {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .filter-chip {
    padding: 6px 16px;
    border: 2px solid var(--md-sys-color-outline);
    background: transparent;
    color: var(--md-sys-color-on-surface);
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
    border-radius: 0;
    transition: all 0.15s;
  }
  .filter-chip.selected {
    border-color: #FF5722;
    background: rgba(255, 87, 34, 0.08);
    color: #FF5722;
    font-weight: 600;
  }
  .filter-chip:hover:not(.selected) {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }

  /* Grid */
  .shop-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  /* Item Card */
  .item-card {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 180px;
  }
  .item-card.owned {
    opacity: 0.6;
  }
  .item-card.unaffordable {
    opacity: 0.7;
  }
  .item-icon-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .item-icon {
    font-size: 32px;
    color: #FF5722;
  }
  .item-tag {
    font: var(--md-sys-typescale-label-small-font);
    padding: 2px 8px;
    border: 1px solid;
  }
  .item-tag.permanent {
    border-color: var(--md-sys-color-primary);
    color: var(--md-sys-color-primary);
  }
  .item-tag.consumable {
    border-color: var(--md-sys-color-tertiary);
    color: var(--md-sys-color-tertiary);
  }
  .item-name {
    margin: 0;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .item-desc {
    margin: 0;
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
    flex: 1;
  }
  .item-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 4px;
  }
  .item-cost {
    display: flex;
    align-items: center;
    gap: 4px;
    font: var(--md-sys-typescale-label-large-font);
    color: var(--md-sys-color-primary);
    font-weight: 600;
  }
  .cost-icon {
    font-size: 18px;
  }
  .buy-btn {
    padding: 6px 16px;
    border: 2px solid var(--pr-ink);
    background: #000;
    color: #fff;
    font: var(--md-sys-typescale-label-large-font);
    cursor: pointer;
    border-radius: 0;
    box-shadow: 2px 2px 0px var(--pr-ink);
    transition: all 0.15s;
  }
  .buy-btn:hover:not(:disabled) {
    box-shadow: 3px 3px 0px var(--pr-ink);
    transform: translate(-1px, -1px);
  }
  .buy-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
  }
  .owned-badge {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    padding: 4px 12px;
    border: 1px solid var(--md-sys-color-outline);
  }

  /* Loading & Empty */
  .loading-state, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 16px;
    color: var(--md-sys-color-on-surface-variant);
    font: var(--md-sys-typescale-body-large-font);
  }
  .loading-state .material-symbols-outlined,
  .empty-state .material-symbols-outlined {
    font-size: 48px;
    opacity: 0.5;
  }
  .spinning {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Inventory */
  .inventory-section {
    margin-top: 32px;
  }
  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
    border-left: 4px solid #FF5722;
    padding-left: 8px;
  }
  .section-icon {
    font-size: 24px;
    color: #FF5722;
  }
  .inventory-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .inv-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
  }
  .inv-icon {
    font-size: 28px;
    color: #FF5722;
  }
  .inv-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .inv-name {
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    font-weight: 500;
  }
  .inv-expires {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .use-btn {
    padding: 4px 12px;
    border: 2px solid #FF5722;
    background: transparent;
    color: #FF5722;
    font: var(--md-sys-typescale-label-medium-font);
    cursor: pointer;
    border-radius: 0;
  }
  .use-btn:hover {
    background: rgba(255, 87, 34, 0.08);
  }
  .inv-status.active {
    font: var(--md-sys-typescale-label-medium-font);
    color: var(--md-sys-color-primary);
  }

  /* Confirm Dialog */
  .confirm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .confirm-dialog {
    background: var(--md-sys-color-surface-container-high);
    border: 4px solid var(--pr-ink);
    box-shadow: 8px 8px 0px var(--pr-ink);
    border-radius: 0;
    padding: 24px;
    max-width: 360px;
    width: 90%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
  }
  .confirm-icon {
    font-size: 48px;
    color: #FF5722;
  }
  .confirm-title {
    margin: 0;
    font: var(--md-sys-typescale-title-large-font);
    color: var(--md-sys-color-on-surface);
  }
  .confirm-desc {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .confirm-balance {
    margin: 0;
    font: var(--md-sys-typescale-label-large-font);
    color: var(--md-sys-color-primary);
  }
  .confirm-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    margin-top: 8px;
  }
  .confirm-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: none;
    border-radius: 0;
    cursor: pointer;
    font: var(--md-sys-typescale-label-large-font);
    padding: 12px 24px;
  }
  .confirm-btn.primary {
    background: #000;
    color: #fff;
  }
  .confirm-btn.primary:hover:not(:disabled) {
    box-shadow: var(--md-sys-elevation-1);
  }
  .confirm-btn.primary:disabled {
    opacity: 0.5;
  }
  .confirm-btn.text {
    background: transparent;
    color: var(--md-sys-color-primary);
  }
  .confirm-btn.text:hover:not(:disabled) {
    background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
  }

  /* Mobile */
  @media (max-width: 599px) {
    .shop-grid {
      grid-template-columns: 1fr;
    }
    .item-card {
      min-height: auto;
    }
  }
</style>
