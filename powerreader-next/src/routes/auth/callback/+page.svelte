<script>
  import { goto } from '$app/navigation';

  let message = $state('登入處理中...');

  $effect(() => {
    if (typeof window === 'undefined') return;

    // Extract token from URL hash or query params
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash || window.location.search);
    const token = params.get('access_token') || params.get('token');

    if (token) {
      localStorage.setItem('auth_token', token);
      message = '登入成功！正在跳轉...';
      setTimeout(() => {
        goto('/profile', { replaceState: true });
      }, 1000);
    } else {
      message = '登入失敗，請重試';
      setTimeout(() => {
        goto('/profile', { replaceState: true });
      }, 2000);
    }
  });
</script>

<div class="callback-page">
  <span class="material-symbols-outlined callback-icon">
    {message.includes('成功') ? 'check_circle' : message.includes('失敗') ? 'error' : 'hourglass_top'}
  </span>
  <p class="callback-message">{message}</p>
</div>

<style>
  .callback-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 64px);
    gap: 16px;
    padding: 16px;
  }
  .callback-icon {
    font-size: 64px;
    color: var(--md-sys-color-primary);
  }
  .callback-message {
    margin: 0;
    font: var(--md-sys-typescale-title-medium-font);
    color: var(--md-sys-color-on-surface);
  }
</style>
