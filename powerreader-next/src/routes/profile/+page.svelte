<script>
  import { untrack } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import TrendChart from '$lib/components/data-viz/TrendChart.svelte';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';
  import { goto } from '$app/navigation';
  import * as api from '$lib/core/api.js';

  const API_BASE = api.API_BASE;
  const authStore = getAuthStore();

  let loading = $state(true);
  let contributions = $state([]);
  let trendData = $state([]);
  let contribLoading = $state(false);
  let contribPage = $state(1);
  let contribHasMore = $state(false);
  let showDeleteDialog = $state(false);
  let deleteConfirmText = $state('');
  let deleteLoading = $state(false);
  let exportLoading = $state(false);

  $effect(() => {
    if (typeof window === 'undefined') return;
    const isAuth = authStore.isAuthenticated;
    if (isAuth) {
      untrack(() => loadProfile());
    } else {
      loading = false;
    }
  });

  async function loadProfile() {
    loading = true;
    try {
      await authStore.fetchProfile();
      // Stop if fetchProfile triggered logout (401)
      if (!authStore.isAuthenticated) return;
      await authStore.fetchPoints();
      await loadContributions(1);
    } catch (e) {
      console.error('Failed to load profile:', e);
    } finally {
      loading = false;
    }
  }

  async function loadContributions(page) {
    if (!authStore.isAuthenticated || !authStore.token) return;
    contribLoading = true;
    try {
      const result = await api.fetchUserContributions(authStore.token, { page, limit: 20 });
      if (result.success && result.data) {
        const incoming = result.data.contributions || [];
        if (page === 1) {
          contributions = incoming;
        } else {
          contributions = [...contributions, ...incoming];
        }
        contribPage = page;
        contribHasMore = incoming.length >= 20;
        if (result.data.daily_counts) {
          trendData = result.data.daily_counts;
        }
      }
    } catch (e) {
      console.error('Failed to load contributions:', e);
    } finally {
      contribLoading = false;
    }
  }

  function loadMoreContributions() {
    if (!contribLoading && contribHasMore) {
      loadContributions(contribPage + 1);
    }
  }

  async function handleExportData() {
    exportLoading = true;
    try {
      const result = await api.exportUserData(authStore.token);
      if (result.success && result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `powerreader-data-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      exportLoading = false;
    }
  }

  function openDeleteDialog() {
    showDeleteDialog = true;
    deleteConfirmText = '';
  }

  function closeDeleteDialog() {
    showDeleteDialog = false;
    deleteConfirmText = '';
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== '刪除') return;
    deleteLoading = true;
    try {
      const result = await api.deleteUserAccount(authStore.token);
      if (result.success) {
        authStore.logout();
        goto('/');
      }
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      deleteLoading = false;
      showDeleteDialog = false;
    }
  }

  function handleLogin() {
    const apiOrigin = new URL(API_BASE).origin;
    const callbackUrl = `${window.location.origin}/auth/callback`;
    window.location.href = `${apiOrigin}/api/v1/auth/google?redirect=${encodeURIComponent(callbackUrl)}`;
  }

  function handleLogout() {
    authStore.logout();
    contributions = [];
    trendData = [];
  }
</script>

<div class="profile-page">
  {#if loading}
    <div class="center-state">
      <span class="material-symbols-outlined loading-icon">hourglass_top</span>
      <p>載入中...</p>
    </div>
  {:else if !authStore.isAuthenticated}
    <div class="login-prompt">
      <Card variant="elevated">
        <div class="login-card">
          <span class="material-symbols-outlined login-icon">person</span>
          <h2>登入 PowerReader</h2>
          <p>登入後可以保存分析紀錄、累積貢獻點數</p>
          <Button onclick={handleLogin}>
            <span class="material-symbols-outlined">login</span>
            使用 Google 登入
          </Button>
        </div>
      </Card>
    </div>
  {:else}
    <div class="user-section">
      <Card variant="elevated">
        <div class="user-info">
          <div class="avatar-placeholder">
            <span class="material-symbols-outlined">person</span>
          </div>
          <div class="user-text">
            <span class="user-name">{authStore.userProfile?.user_hash?.slice(0, 8) ?? '使用者'}...</span>
            <span class="user-email">加入於 {authStore.userProfile?.member_since?.slice(0, 10) ?? ''}</span>
          </div>
        </div>
      </Card>
    </div>

    <div class="kpi-grid kpi-grid-2">
      <Card variant="filled">
        <div class="kpi-card">
          <span class="kpi-value">{authStore.userProfile?.contribution_count ?? 0}</span>
          <span class="kpi-label">貢獻數</span>
        </div>
      </Card>
      <Card variant="filled">
        <div class="kpi-card">
          <span class="kpi-value">{authStore.userProfile?.display_points ?? '0.00'}</span>
          <span class="kpi-label">貢獻點數</span>
        </div>
      </Card>
    </div>

    <section class="section">
      <h3 class="section-title">30 天活動</h3>
      <TrendChart data={trendData} />
    </section>

    <section class="section">
      <h3 class="section-title">最近貢獻</h3>
      {#if contributions.length > 0}
        <div class="contrib-list">
          {#each contributions as contrib}
            <a href="/article/{contrib.article_id}" class="contrib-item">
              <span class="contrib-title">{contrib.title || contrib.article_id}</span>
              <div class="contrib-meta">
                {#if contrib.status}
                  <span class="contrib-badge" class:done={contrib.status === 'done'}>
                    {contrib.status === 'done' ? '已分析' : '待處理'}
                  </span>
                {/if}
                <span class="contrib-date">{contrib.created_at?.slice(0, 10) || ''}</span>
              </div>
            </a>
          {/each}
        </div>
        {#if contribHasMore}
          <Button variant="text" onclick={loadMoreContributions} disabled={contribLoading}>
            {contribLoading ? '載入中...' : '載入更多'}
          </Button>
        {/if}
      {:else if !contribLoading}
        <div class="empty-state">
          <span class="material-symbols-outlined">analytics</span>
          <p>尚無貢獻</p>
          <a href="/analyze" class="cta-link">前往分析文章</a>
        </div>
      {/if}
    </section>

    <section class="section account-section">
      <h3 class="section-title">帳號管理</h3>
      <div class="account-actions">
        <Button variant="outlined" onclick={handleExportData} disabled={exportLoading}>
          <span class="material-symbols-outlined">download</span>
          {exportLoading ? '匯出中...' : '匯出我的資料'}
        </Button>
        <Button variant="text" onclick={openDeleteDialog}>
          <span class="material-symbols-outlined" style="color: var(--md-sys-color-error)">delete_forever</span>
          <span style="color: var(--md-sys-color-error)">刪除帳號</span>
        </Button>
      </div>
    </section>

    <div class="logout-section">
      <Button variant="text" onclick={handleLogout}>登出</Button>
    </div>

    {#if showDeleteDialog}
      <div class="dialog-backdrop" onclick={closeDeleteDialog}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="dialog-card" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <h3 class="dialog-title">確認刪除帳號</h3>
          <p class="dialog-text">此操作不可逆。您的所有資料將被永久刪除。</p>
          <p class="dialog-text">請輸入「刪除」確認：</p>
          <input
            type="text"
            class="dialog-input"
            bind:value={deleteConfirmText}
            placeholder="刪除"
          />
          <div class="dialog-actions">
            <Button variant="text" onclick={closeDeleteDialog}>取消</Button>
            <Button
              variant="filled"
              onclick={handleDeleteAccount}
              disabled={deleteConfirmText !== '刪除' || deleteLoading}
            >
              {deleteLoading ? '處理中...' : '確認刪除'}
            </Button>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .profile-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
  }
  .center-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 48px 16px;
    gap: 12px;
    color: var(--md-sys-color-on-surface-variant);
  }
  .loading-icon {
    font-size: 48px;
    opacity: 0.6;
  }
  .center-state p {
    margin: 0;
    font: var(--md-sys-typescale-body-large-font);
  }
  .login-prompt {
    display: flex;
    justify-content: center;
    padding: 32px 0;
  }
  .login-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
  }
  .login-icon {
    font-size: 48px;
    color: var(--md-sys-color-primary);
  }
  .login-card h2 {
    margin: 0;
    font: var(--md-sys-typescale-headline-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .login-card p {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
    max-width: 280px;
  }
  .user-section {
    width: 100%;
  }
  .user-info {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .avatar-placeholder {
    width: 48px;
    height: 48px;
    border-radius: var(--md-sys-shape-corner-full);
    background: var(--md-sys-color-primary-container);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--md-sys-color-on-primary-container);
  }
  .user-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .user-name {
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .user-email {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .kpi-grid-2 {
    grid-template-columns: repeat(2, 1fr);
  }
  .kpi-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px;
  }
  .kpi-value {
    font: var(--md-sys-typescale-headline-medium-font);
    color: var(--md-sys-color-primary);
  }
  .kpi-label {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section-title {
    margin: 0;
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .contrib-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .contrib-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: var(--md-sys-shape-corner-small);
    text-decoration: none;
    color: inherit;
  }
  .contrib-item:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 4%, transparent);
  }
  .contrib-title {
    flex: 1;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .contrib-date {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
    margin-left: 12px;
  }
  .contrib-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .contrib-badge {
    font: var(--md-sys-typescale-label-small-font);
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    background: var(--md-sys-color-surface-container);
    color: var(--md-sys-color-on-surface-variant);
  }
  .contrib-badge.done {
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
    gap: 8px;
    color: var(--md-sys-color-on-surface-variant);
  }
  .empty-state .material-symbols-outlined {
    font-size: 48px;
    opacity: 0.5;
  }
  .empty-state p { margin: 0; font: var(--md-sys-typescale-body-medium-font); }
  .cta-link {
    color: var(--md-sys-color-primary);
    font: var(--md-sys-typescale-label-large-font);
    text-decoration: none;
  }
  .cta-link:hover { text-decoration: underline; }
  .account-section { padding-top: 8px; border-top: 1px solid var(--md-sys-color-outline-variant); }
  .account-actions { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .dialog-backdrop {
    position: fixed; inset: 0; z-index: 300;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
  }
  .dialog-card {
    background: var(--md-sys-color-surface-container-high);
    border-radius: var(--md-sys-shape-corner-large);
    padding: 24px;
    max-width: 400px;
    width: 90%;
    display: flex; flex-direction: column; gap: 12px;
  }
  .dialog-title {
    margin: 0;
    font: var(--md-sys-typescale-headline-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .dialog-text {
    margin: 0;
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .dialog-input {
    padding: 10px 12px;
    border: 1px solid var(--md-sys-color-outline);
    border-radius: var(--md-sys-shape-corner-small);
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    font: var(--md-sys-typescale-body-large-font);
    outline: none;
  }
  .dialog-input:focus { border-color: var(--md-sys-color-primary); }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .logout-section {
    display: flex;
    justify-content: center;
    padding-top: 8px;
  }
</style>
