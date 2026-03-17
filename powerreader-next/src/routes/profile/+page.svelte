<script>
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import TrendChart from '$lib/components/data-viz/TrendChart.svelte';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';
  import { API_BASE } from '$lib/core/api.js';

  const authStore = getAuthStore();

  let loading = $state(true);
  let contributions = $state([]);
  let trendData = $state([]);

  $effect(() => {
    if (typeof window === 'undefined') return;
    if (authStore.isAuthenticated) {
      loadProfile();
    } else {
      loading = false;
    }
  });

  async function loadProfile() {
    loading = true;
    try {
      await Promise.all([
        authStore.fetchProfile(),
        authStore.fetchPoints()
      ]);
    } catch (e) {
      console.error('Failed to load profile:', e);
    } finally {
      loading = false;
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
          <p>登入後可以保存分析紀錄、累積貢獻點數、參與投票</p>
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

    <div class="kpi-grid">
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
      <Card variant="filled">
        <div class="kpi-card">
          <span class="kpi-value">{authStore.userProfile?.vote_rights ?? 0}</span>
          <span class="kpi-label">投票權</span>
        </div>
      </Card>
    </div>

    <section class="section">
      <h3 class="section-title">30 天活動</h3>
      <TrendChart data={trendData} />
    </section>

    {#if contributions.length > 0}
      <section class="section">
        <h3 class="section-title">最近貢獻</h3>
        <div class="contrib-list">
          {#each contributions as contrib}
            <a href="/article/{contrib.article_id}" class="contrib-item">
              <span class="contrib-title">{contrib.title}</span>
              <span class="contrib-date">{contrib.date}</span>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    <div class="logout-section">
      <Button variant="text" onclick={handleLogout}>登出</Button>
    </div>
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
  .logout-section {
    display: flex;
    justify-content: center;
    padding-top: 8px;
  }
</style>
