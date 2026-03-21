<script>
  import { untrack } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import TrendChart from '$lib/components/data-viz/TrendChart.svelte';
  import { getAuthStore } from '$lib/stores/auth.svelte.js';
  import * as api from '$lib/core/api.js';

  const API_BASE = api.API_BASE;
  const authStore = getAuthStore();

  let loading = $state(true);
  let contributions = $state([]);
  let trendData = $state([]);
  let contribLoading = $state(false);
  let contribPage = $state(1);
  let contribHasMore = $state(false);

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

  /** Get avatar initial from display name */
  function getAvatarLetter(name) {
    if (!name) return 'P';
    return name.charAt(0).toUpperCase();
  }

  /** Format ISO date to readable string */
  function formatDate(iso) {
    if (!iso) return '';
    return iso.slice(0, 10);
  }

  /** Get provider display name */
  function getProviderLabel(provider) {
    if (!provider) return '';
    const map = { google: 'Google', github: 'GitHub', email: 'Email' };
    return map[provider.toLowerCase()] || provider;
  }
</script>

<div class="profile-page">
  <header class="page-header">
    <h1 class="page-title">個人貢獻</h1>
  </header>

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
    <!-- ═══ User Info ═══ -->
    <section class="section">
      <h2 class="section-title">
        <span class="material-symbols-outlined section-icon">person</span>
        使用者
      </h2>
      <Card variant="elevated">
        <div class="user-info">
          <div class="avatar-letter">
            {getAvatarLetter(authStore.userProfile?.display_name)}
          </div>
          <div class="user-text">
            <span class="user-name">{authStore.userProfile?.display_name || 'PowerReader 貢獻者'}</span>
            <div class="user-meta-row">
              {#if authStore.userProfile?.login_provider}
                <span class="provider-badge">
                  {getProviderLabel(authStore.userProfile.login_provider)}
                </span>
              {/if}
              {#if authStore.userProfile?.created_at}
                <span class="user-since">加入於 {formatDate(authStore.userProfile.created_at)}</span>
              {/if}
            </div>
          </div>
        </div>
      </Card>
    </section>

    <!-- ═══ KPI Stats ═══ -->
    <section class="section">
      <h2 class="section-title">
        <span class="material-symbols-outlined section-icon">monitoring</span>
        貢獻統計
      </h2>
      <div class="kpi-grid">
        <Card variant="filled">
          <div class="kpi-card">
            <span class="material-symbols-outlined kpi-icon">volunteer_activism</span>
            <span class="kpi-value">{authStore.userPoints?.contribution_count ?? 0}</span>
            <span class="kpi-label">貢獻數</span>
          </div>
        </Card>
        <Card variant="filled">
          <div class="kpi-card">
            <span class="material-symbols-outlined kpi-icon">toll</span>
            <span class="kpi-value">{authStore.userPoints?.display_points ?? '0.00'}</span>
            <span class="kpi-label">貢獻點數</span>
          </div>
        </Card>
        <Card variant="filled">
          <div class="kpi-card">
            <span class="material-symbols-outlined kpi-icon">speed</span>
            <span class="kpi-value">{authStore.dailyQuota.used}/{authStore.dailyQuota.limit}</span>
            <span class="kpi-label">今日配額</span>
            <div class="kpi-quota-bar">
              <div
                class="kpi-quota-fill"
                style:width="{Math.min(100, (authStore.dailyQuota.used / authStore.dailyQuota.limit) * 100)}%"
                class:kpi-quota-full={authStore.dailyQuota.remaining === 0}
              ></div>
            </div>
          </div>
        </Card>
      </div>
    </section>

    <!-- ═══ 30-Day Activity ═══ -->
    <section class="section">
      <h2 class="section-title">
        <span class="material-symbols-outlined section-icon">trending_up</span>
        30 天活動
      </h2>
      <Card variant="filled">
        <div class="trend-wrapper">
          <TrendChart data={trendData} />
        </div>
      </Card>
    </section>

    <!-- ═══ Recent Contributions ═══ -->
    <section class="section">
      <h2 class="section-title">
        <span class="material-symbols-outlined section-icon">history</span>
        最近貢獻
      </h2>
      {#if contributions.length > 0}
        <Card variant="filled">
          <div class="contrib-list">
            {#each contributions as contrib}
              <a href="/article/{contrib.article_id}" class="contrib-item">
                <span class="material-symbols-outlined contrib-leading-icon" class:done={contrib.status === 'done'}>
                  {contrib.status === 'done' ? 'check_circle' : 'pending'}
                </span>
                <div class="contrib-body">
                  <span class="contrib-title">{contrib.title || contrib.article_id}</span>
                  <div class="contrib-sub-meta">
                    <span class="contrib-points">+{contrib.points_earned ?? 0} 點</span>
                    <span class="contrib-date">{formatDate(contrib.created_at)}</span>
                  </div>
                </div>
                <div class="contrib-trailing">
                  {#if contrib.status}
                    <span class="contrib-badge" class:done={contrib.status === 'done'}>
                      {contrib.status === 'done' ? '已分析' : '待處理'}
                    </span>
                  {/if}
                  <span class="material-symbols-outlined contrib-arrow">chevron_right</span>
                </div>
              </a>
            {/each}
          </div>
        </Card>
        {#if contribHasMore}
          <Button variant="text" onclick={loadMoreContributions} disabled={contribLoading}>
            {contribLoading ? '載入中...' : '載入更多'}
          </Button>
        {/if}
      {:else if !contribLoading}
        <div class="empty-state">
          <span class="material-symbols-outlined">analytics</span>
          <p>尚無貢獻</p>
          <span class="cta-text">使用導航列的「自動分析」按鈕開始</span>
        </div>
      {/if}
    </section>

    <!-- ═══ Quick Access ═══ -->
    <section class="section">
      <h2 class="section-title">
        <span class="material-symbols-outlined section-icon">grid_view</span>
        快捷入口
      </h2>
      <div class="entry-cards">
        <a href="/power-pool" class="entry-card power-pool-card">
          <div class="entry-card-icon">
            <span class="material-symbols-outlined">rocket_launch</span>
          </div>
          <div class="entry-card-content">
            <span class="entry-card-title">動力池</span>
            <span class="entry-card-desc">查看飛輪願景、獎池分配與群體分析報告</span>
          </div>
          <span class="material-symbols-outlined entry-card-arrow">chevron_right</span>
        </a>
        <div class="entry-card shop-card" aria-disabled="true">
          <div class="entry-card-icon shop-icon">
            <span class="material-symbols-outlined">storefront</span>
          </div>
          <div class="entry-card-content">
            <span class="entry-card-title">點數商店</span>
            <span class="entry-card-desc">使用貢獻點數兌換獎品 — 即將推出</span>
          </div>
          <span class="entry-card-badge">Soon</span>
        </div>
      </div>
    </section>

    <!-- ═══ Account ═══ -->
    <section class="section">
      <h2 class="section-title">
        <span class="material-symbols-outlined section-icon">manage_accounts</span>
        帳號
      </h2>
      <Card variant="filled">
        <div class="account-row">
          <Button variant="text" onclick={handleLogout}>
            <span class="material-symbols-outlined">logout</span>
            登出
          </Button>
        </div>
      </Card>
    </section>
  {/if}
</div>

<style>
  .profile-page {
    display: flex;
    flex-direction: column;
    gap: var(--pr-page-gap);
    padding: var(--pr-page-padding);
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
  }

  /* ── Page Header ── */
  .page-header {
    padding: 4px 0 12px;
  }
  .page-title {
    margin: 0;
    font: var(--md-sys-typescale-headline-medium-font);
    color: var(--md-sys-color-on-surface);
    padding-left: 16px;
    border-left: 5px solid #FF5722;
    letter-spacing: 0.01em;
  }

  /* ── Section ── */
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section-title {
    margin: 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 12px;
    border-left: 4px solid #FF5722;
  }
  .section-icon {
    font-size: 24px;
    color: #FF5722;
    flex-shrink: 0;
  }

  /* ── Loading / Login ── */
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

  /* ── User Info ── */
  .user-info {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .avatar-letter {
    width: 48px;
    height: 48px;
    border-radius: var(--md-sys-shape-corner-full);
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
    display: flex;
    align-items: center;
    justify-content: center;
    font: var(--md-sys-typescale-title-large-font);
    font-weight: 600;
    flex-shrink: 0;
  }
  .user-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .user-name {
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .user-meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .provider-badge {
    font: var(--md-sys-typescale-label-small-font);
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }
  .user-since {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* ── KPI Grid ── */
  .kpi-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }
  @media (min-width: 480px) {
    .kpi-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .kpi-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px;
  }
  .kpi-icon {
    font-size: 28px;
    color: #FF5722;
  }
  .kpi-value {
    font: var(--md-sys-typescale-headline-medium-font);
    color: var(--md-sys-color-primary);
  }
  .kpi-label {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .kpi-quota-bar {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: var(--md-sys-color-surface-container-highest);
    overflow: hidden;
    margin-top: 4px;
  }
  .kpi-quota-fill {
    height: 100%;
    border-radius: 2px;
    background: var(--md-sys-color-primary);
    transition: width 0.3s ease;
  }
  .kpi-quota-full {
    background: var(--md-sys-color-error);
  }

  /* ── Trend Chart Wrapper ── */
  .trend-wrapper {
    padding: 4px 0;
  }

  /* ── Contribution List ── */
  .contrib-list {
    display: flex;
    flex-direction: column;
  }
  .contrib-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    text-decoration: none;
    color: inherit;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .contrib-item:last-child {
    border-bottom: none;
  }
  .contrib-item:hover {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 4%, transparent);
  }
  .contrib-leading-icon {
    font-size: 22px;
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
  }
  .contrib-leading-icon.done {
    color: var(--md-sys-color-primary);
  }
  .contrib-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .contrib-title {
    font: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .contrib-sub-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .contrib-points {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-primary);
    font-weight: 500;
  }
  .contrib-date {
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .contrib-trailing {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .contrib-badge {
    font: var(--md-sys-typescale-label-small-font);
    padding: 2px 8px;
    border-radius: 0;
    background: var(--md-sys-color-surface-container);
    color: var(--md-sys-color-on-surface-variant);
  }
  .contrib-badge.done {
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }
  .contrib-arrow {
    font-size: 20px;
    color: var(--md-sys-color-on-surface-variant);
  }

  /* ── Empty State ── */
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
  .cta-text {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* ── Entry Cards ── */
  .entry-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .entry-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 0;
    border: 3px solid var(--pr-ink);
    box-shadow: 4px 4px 0px var(--pr-ink);
    background: var(--md-sys-color-surface-container);
    text-decoration: none;
    color: inherit;
    transition: background var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .entry-card:hover:not([aria-disabled="true"]) {
    background: var(--md-sys-color-surface-container-high);
  }
  .entry-card[aria-disabled="true"] {
    opacity: 0.5;
    cursor: default;
  }
  .entry-card-icon {
    width: 40px;
    height: 40px;
    border-radius: 0;
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .entry-card-icon.shop-icon {
    background: var(--md-sys-color-surface-container-high);
    color: var(--md-sys-color-on-surface-variant);
  }
  .entry-card-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .entry-card-title {
    font: var(--md-sys-typescale-title-small-font);
    color: var(--md-sys-color-on-surface);
  }
  .entry-card-desc {
    font: var(--md-sys-typescale-body-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .entry-card-arrow {
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
  }
  .entry-card-badge {
    font: var(--md-sys-typescale-label-small-font);
    background: var(--md-sys-color-surface-container-highest);
    color: var(--md-sys-color-on-surface-variant);
    padding: 2px 8px;
    border-radius: 0;
    flex-shrink: 0;
  }

  /* ── Account Row ── */
  .account-row {
    display: flex;
    align-items: center;
    padding: 4px 0;
  }
</style>
