/**
 * Unit tests for knowledge/review page
 *
 * Tests cover: no permission, PR list, empty state, expand/diff,
 * merge, reject, reject with reason, error handling, list update, loading
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';

// ── Mocks ──

const mockAuth = {
  isAuthenticated: true,
  token: 'admin-token',
};

vi.mock('$lib/stores/auth.svelte.js', () => ({
  getAuthStore: () => mockAuth,
}));

const mockFetchPRs = vi.fn();
const mockFetchPRDetail = vi.fn();
const mockMergePR = vi.fn();
const mockClosePR = vi.fn();

vi.mock('$lib/core/api.js', () => ({
  fetchKnowledgePRs: (...args) => mockFetchPRs(...args),
  fetchKnowledgePRDetail: (...args) => mockFetchPRDetail(...args),
  mergeKnowledgePR: (...args) => mockMergePR(...args),
  closeKnowledgePR: (...args) => mockClosePR(...args),
}));

vi.mock('$lib/i18n/zh-TW.js', () => ({
  t: vi.fn((key) => {
    const map = {
      'knowledge.review.title': '編輯審核',
      'knowledge.review.no_permission': '您沒有審核權限',
      'knowledge.review.empty': '目前沒有待審核的編輯',
      'knowledge.review.approve': '核准合併',
      'knowledge.review.reject': '駁回',
      'knowledge.review.reject_reason': '駁回原因',
      'knowledge.review.merged': '已合併，網站將自動更新',
      'knowledge.review.closed': '已駁回',
      'knowledge.review.submitter': '提交者',
      'knowledge.review.date': '提交日期',
      'knowledge.review.loading': '載入中...',
      'knowledge.review.merging': '合併中...',
      'knowledge.review.closing': '駁回中...',
      'knowledge.back_to_list': '返回知識庫',
      'knowledge.diff.before': '修改前',
      'knowledge.diff.after': '修改後',
      'knowledge.diff.changed': '已變更',
      'knowledge.diff.unchanged': '未變更',
      'knowledge.stances.title': '各黨立場比較',
      'error.message.generic': '系統錯誤',
    };
    return map[key] || key;
  }),
}));

vi.mock('$app/state', () => ({
  page: {
    url: new URL('http://localhost/knowledge/review'),
    params: {},
  },
}));

function createContainer() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

const samplePRs = [
  { number: 1, title: '[Knowledge Edit] Person A: fix bio', user: 'u1', created_at: '2026-03-01T10:00:00Z', labels: [] },
  { number: 2, title: '[Knowledge Edit] Topic B: update stance', user: 'u2', created_at: '2026-03-02T10:00:00Z', labels: [] },
];

// ── Tests ──

describe('Knowledge Review Page', () => {
  let container;

  beforeEach(() => {
    container = createContainer();
    mockAuth.isAuthenticated = true;
    mockAuth.token = 'admin-token';
    mockFetchPRs.mockReset();
    mockFetchPRDetail.mockReset();
    mockMergePR.mockReset();
    mockClosePR.mockReset();
  });

  it('shows no permission when not authenticated', async () => {
    mockAuth.isAuthenticated = false;
    mockAuth.token = null;

    const ReviewPage = (await import('../../src/routes/knowledge/review/+page.svelte')).default;
    mount(ReviewPage, { target: container });

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    expect(container.textContent).toContain('您沒有審核權限');
  });

  it('shows PR list when admin', async () => {
    mockFetchPRs.mockResolvedValue({
      success: true,
      data: { prs: samplePRs },
    });

    const ReviewPage = (await import('../../src/routes/knowledge/review/+page.svelte')).default;
    mount(ReviewPage, { target: container });

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    expect(container.textContent).toContain('#1');
    expect(container.textContent).toContain('Person A');
    expect(container.textContent).toContain('#2');
    expect(container.textContent).toContain('Topic B');
  });

  it('shows empty state when no PRs', async () => {
    mockFetchPRs.mockResolvedValue({
      success: true,
      data: { prs: [] },
    });

    const ReviewPage = (await import('../../src/routes/knowledge/review/+page.svelte')).default;
    mount(ReviewPage, { target: container });

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    expect(container.textContent).toContain('目前沒有待審核的編輯');
  });

  it('expands PR and shows diff on click', async () => {
    mockFetchPRs.mockResolvedValue({
      success: true,
      data: { prs: [samplePRs[0]] },
    });

    mockFetchPRDetail.mockResolvedValue({
      success: true,
      data: {
        pr: { number: 1, title: 'Edit', state: 'open' },
        diff: { removed: ['"content": "old"'], added: ['"content": "new"'] },
        changed_files: [],
      },
    });

    const ReviewPage = (await import('../../src/routes/knowledge/review/+page.svelte')).default;
    mount(ReviewPage, { target: container });

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    // Click to expand
    const header = container.querySelector('.pr-header');
    header.click();

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    expect(mockFetchPRDetail).toHaveBeenCalledWith('admin-token', 1);
    // DiffView should be rendered
    expect(container.querySelector('.diff-view')).toBeTruthy();
  });

  it('merges PR successfully', async () => {
    mockFetchPRs.mockResolvedValue({
      success: true,
      data: { prs: [samplePRs[0]] },
    });

    mockFetchPRDetail.mockResolvedValue({
      success: true,
      data: {
        pr: { number: 1, title: 'Edit', state: 'open' },
        diff: { removed: [], added: [] },
        changed_files: [],
      },
    });

    mockMergePR.mockResolvedValue({
      success: true,
      data: { merged: true },
    });

    const ReviewPage = (await import('../../src/routes/knowledge/review/+page.svelte')).default;
    mount(ReviewPage, { target: container });

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    // Expand
    container.querySelector('.pr-header').click();
    await new Promise(r => setTimeout(r, 20));
    flushSync();

    // Click approve
    const approveBtn = container.querySelector('.action-btn--approve');
    approveBtn.click();

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    expect(mockMergePR).toHaveBeenCalledWith('admin-token', 1);
    expect(container.textContent).toContain('已合併');
  });

  it('closes PR successfully', async () => {
    mockFetchPRs.mockResolvedValue({
      success: true,
      data: { prs: [samplePRs[0]] },
    });

    mockFetchPRDetail.mockResolvedValue({
      success: true,
      data: {
        pr: { number: 1, title: 'Edit', state: 'open' },
        diff: { removed: [], added: [] },
        changed_files: [],
      },
    });

    mockClosePR.mockResolvedValue({
      success: true,
      data: { closed: true },
    });

    const ReviewPage = (await import('../../src/routes/knowledge/review/+page.svelte')).default;
    mount(ReviewPage, { target: container });

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    // Expand
    container.querySelector('.pr-header').click();
    await new Promise(r => setTimeout(r, 20));
    flushSync();

    // Click reject toggle
    container.querySelector('.action-btn--reject-toggle').click();
    flushSync();

    // Click reject confirm
    container.querySelector('.action-btn--reject').click();

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    expect(mockClosePR).toHaveBeenCalledWith('admin-token', 1, '');
    expect(container.textContent).toContain('已駁回');
  });

  it('sends reject reason when provided', async () => {
    mockFetchPRs.mockResolvedValue({
      success: true,
      data: { prs: [samplePRs[0]] },
    });

    mockFetchPRDetail.mockResolvedValue({
      success: true,
      data: {
        pr: { number: 1, title: 'Edit', state: 'open' },
        diff: { removed: [], added: [] },
        changed_files: [],
      },
    });

    mockClosePR.mockResolvedValue({
      success: true,
      data: { closed: true },
    });

    const ReviewPage = (await import('../../src/routes/knowledge/review/+page.svelte')).default;
    mount(ReviewPage, { target: container });

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    container.querySelector('.pr-header').click();
    await new Promise(r => setTimeout(r, 20));
    flushSync();

    container.querySelector('.action-btn--reject-toggle').click();
    flushSync();

    // Type reason
    const reasonInput = container.querySelector('.reject-input');
    reasonInput.value = 'Inaccurate data';
    reasonInput.dispatchEvent(new Event('input'));
    flushSync();

    container.querySelector('.action-btn--reject').click();

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    expect(mockClosePR).toHaveBeenCalledWith('admin-token', 1, 'Inaccurate data');
  });

  it('shows error on merge failure', async () => {
    mockFetchPRs.mockResolvedValue({
      success: true,
      data: { prs: [samplePRs[0]] },
    });

    mockFetchPRDetail.mockResolvedValue({
      success: true,
      data: {
        pr: { number: 1, title: 'Edit', state: 'open' },
        diff: { removed: [], added: [] },
        changed_files: [],
      },
    });

    mockMergePR.mockResolvedValue({
      success: false,
      data: null,
      error: { type: 'github_error', status: 502 },
    });

    const ReviewPage = (await import('../../src/routes/knowledge/review/+page.svelte')).default;
    mount(ReviewPage, { target: container });

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    container.querySelector('.pr-header').click();
    await new Promise(r => setTimeout(r, 20));
    flushSync();

    container.querySelector('.action-btn--approve').click();
    await new Promise(r => setTimeout(r, 20));
    flushSync();

    expect(container.textContent).toContain('系統錯誤');
  });

  it('removes PR from list after successful merge', async () => {
    mockFetchPRs.mockResolvedValue({
      success: true,
      data: { prs: [...samplePRs] },
    });

    mockFetchPRDetail.mockResolvedValue({
      success: true,
      data: {
        pr: { number: 1, title: 'Edit', state: 'open' },
        diff: { removed: [], added: [] },
        changed_files: [],
      },
    });

    mockMergePR.mockResolvedValue({
      success: true,
      data: { merged: true },
    });

    const ReviewPage = (await import('../../src/routes/knowledge/review/+page.svelte')).default;
    mount(ReviewPage, { target: container });

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    // Should have 2 PRs initially
    expect(container.querySelectorAll('.pr-item').length).toBe(2);

    container.querySelector('.pr-header').click();
    await new Promise(r => setTimeout(r, 20));
    flushSync();

    container.querySelector('.action-btn--approve').click();
    await new Promise(r => setTimeout(r, 20));
    flushSync();

    // PR #1 removed, only #2 remains
    expect(container.querySelectorAll('.pr-item').length).toBe(1);
    expect(container.textContent).toContain('#2');
  });

  it('shows loading state while fetching PRs', async () => {
    // Never-resolving to keep loading state
    mockFetchPRs.mockReturnValue(new Promise(() => {}));

    const ReviewPage = (await import('../../src/routes/knowledge/review/+page.svelte')).default;
    mount(ReviewPage, { target: container });

    await new Promise(r => setTimeout(r, 10));
    flushSync();

    expect(container.textContent).toContain('載入中...');
  });
});
