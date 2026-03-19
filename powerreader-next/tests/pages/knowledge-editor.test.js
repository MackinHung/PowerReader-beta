/**
 * Unit tests for knowledge/edit page
 *
 * Tests cover: login prompt, form fields for different types,
 * submit success/conflict/pr_exists, loading state, validation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';

// ── Mocks ──

const mockAuth = {
  isAuthenticated: false,
  token: null,
};

vi.mock('$lib/stores/auth.svelte.js', () => ({
  getAuthStore: () => mockAuth,
}));

const mockKnowledge = {
  loading: false,
  loaded: true,
  _entries: [],
  getEntry(id) { return this._entries.find(e => e.id === id); },
  loadKnowledge: vi.fn(),
};

vi.mock('$lib/stores/knowledge.svelte.js', () => ({
  getKnowledgeStore: () => mockKnowledge,
}));

const mockProposeEdit = vi.fn();

vi.mock('$lib/core/api.js', () => ({
  proposeKnowledgeEdit: (...args) => mockProposeEdit(...args),
}));

vi.mock('$lib/i18n/zh-TW.js', () => ({
  t: vi.fn((key) => {
    const map = {
      'knowledge.edit.title': '編輯知識條目',
      'knowledge.edit.login_required': '請先登入以建議編輯',
      'knowledge.edit.reason': '修改原因',
      'knowledge.edit.reason_placeholder': '請簡述修改原因...',
      'knowledge.edit.submit': '提交建議',
      'knowledge.edit.submitting': '提交中...',
      'knowledge.edit.success': '建議已提交',
      'knowledge.edit.success_detail': '已建立 Pull Request',
      'knowledge.edit.conflict': '內容已被他人修改，請重新載入',
      'knowledge.edit.pr_exists': '此條目已有待審核的編輯建議',
      'knowledge.edit.view_pr': '查看 PR',
      'knowledge.back_to_list': '返回知識庫',
      'knowledge.not_found': '找不到此知識條目',
      'knowledge.admin.form.title': '標題',
      'knowledge.admin.form.content': '內容',
      'knowledge.stances.dpp': '民主進步黨',
      'knowledge.stances.kmt': '中國國民黨',
      'knowledge.stances.tpp': '台灣民眾黨',
      'common.label.loading': '載入中...',
      'error.message.generic': '系統錯誤',
    };
    return map[key] || key;
  }),
}));

// Mock $app/state with configurable search params
let mockSearchParams = new URLSearchParams('id=p1');
vi.mock('$app/state', () => ({
  page: {
    url: {
      get searchParams() { return mockSearchParams; },
      pathname: '/knowledge/edit',
    },
    params: {},
  },
}));

function createContainer() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// ── Tests ──

describe('Knowledge Editor Page', () => {
  let container;

  beforeEach(() => {
    container = createContainer();
    mockAuth.isAuthenticated = false;
    mockAuth.token = null;
    mockKnowledge.loading = false;
    mockKnowledge._entries = [
      { id: 'p1', type: 'politician', title: 'Test Person', content: 'Bio text', party: 'DPP', batch_file: 'batch_001', content_hash: 'hash1' },
      { id: 'topic1', type: 'topic', title: 'Test Topic', stances: { DPP: 'DPP stance', KMT: 'KMT stance', TPP: 'TPP stance' }, batch_file: 'batch_002', content_hash: 'hash2' },
      { id: 'e1', type: 'event', title: 'Test Event', content: 'Event details', batch_file: 'batch_003', content_hash: 'hash3' },
    ];
    mockSearchParams = new URLSearchParams('id=p1');
    mockProposeEdit.mockReset();
  });

  it('shows login prompt when not authenticated', async () => {
    const EditPage = (await import('../../src/routes/knowledge/edit/+page.svelte')).default;
    mount(EditPage, { target: container });

    expect(container.textContent).toContain('請先登入以建議編輯');
  });

  it('loads entry data into form when authenticated', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.token = 'tok';

    const EditPage = (await import('../../src/routes/knowledge/edit/+page.svelte')).default;
    mount(EditPage, { target: container });

    // Wait for effects
    await new Promise(r => setTimeout(r, 10));
    flushSync();

    const titleInput = container.querySelector('#edit-title');
    expect(titleInput).toBeTruthy();
    expect(titleInput.value).toBe('Test Person');
  });

  it('shows politician form fields (title + content)', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.token = 'tok';

    const EditPage = (await import('../../src/routes/knowledge/edit/+page.svelte')).default;
    mount(EditPage, { target: container });

    await new Promise(r => setTimeout(r, 10));
    flushSync();

    expect(container.querySelector('#edit-title')).toBeTruthy();
    expect(container.querySelector('#edit-content')).toBeTruthy();
    expect(container.querySelector('#edit-reason')).toBeTruthy();
  });

  it('shows topic form fields with stance textareas', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.token = 'tok';
    mockSearchParams = new URLSearchParams('id=topic1');

    const EditPage = (await import('../../src/routes/knowledge/edit/+page.svelte')).default;
    mount(EditPage, { target: container });

    await new Promise(r => setTimeout(r, 10));
    flushSync();

    expect(container.querySelector('#edit-stance-dpp')).toBeTruthy();
    expect(container.querySelector('#edit-stance-kmt')).toBeTruthy();
    expect(container.querySelector('#edit-stance-tpp')).toBeTruthy();
    // topic should NOT have content textarea
    expect(container.querySelector('#edit-content')).toBeNull();
  });

  it('shows success state with PR link after successful submit', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.token = 'tok';
    mockProposeEdit.mockResolvedValue({
      success: true,
      data: { pr_number: 42, pr_url: 'https://github.com/test/pr/42' },
    });

    const EditPage = (await import('../../src/routes/knowledge/edit/+page.svelte')).default;
    mount(EditPage, { target: container });

    await new Promise(r => setTimeout(r, 10));
    flushSync();

    // Change title to enable submit
    const titleInput = container.querySelector('#edit-title');
    titleInput.value = 'Updated Person';
    titleInput.dispatchEvent(new Event('input'));

    const reasonInput = container.querySelector('#edit-reason');
    reasonInput.value = 'Fix info';
    reasonInput.dispatchEvent(new Event('input'));

    flushSync();

    const submitBtn = container.querySelector('.submit-btn');
    submitBtn.click();

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    expect(container.textContent).toContain('建議已提交');
    expect(container.textContent).toContain('查看 PR');
  });

  it('shows conflict error on 409 content_changed', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.token = 'tok';
    mockProposeEdit.mockResolvedValue({
      success: false,
      data: null,
      error: { type: 'content_changed', status: 409 },
    });

    const EditPage = (await import('../../src/routes/knowledge/edit/+page.svelte')).default;
    mount(EditPage, { target: container });

    await new Promise(r => setTimeout(r, 10));
    flushSync();

    const titleInput = container.querySelector('#edit-title');
    titleInput.value = 'Changed';
    titleInput.dispatchEvent(new Event('input'));

    const reasonInput = container.querySelector('#edit-reason');
    reasonInput.value = 'reason';
    reasonInput.dispatchEvent(new Event('input'));

    flushSync();

    container.querySelector('.submit-btn').click();

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    expect(container.textContent).toContain('內容已被他人修改');
  });

  it('shows pr_exists error on 409', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.token = 'tok';
    mockProposeEdit.mockResolvedValue({
      success: false,
      data: null,
      error: { type: 'pr_exists', status: 409 },
    });

    const EditPage = (await import('../../src/routes/knowledge/edit/+page.svelte')).default;
    mount(EditPage, { target: container });

    await new Promise(r => setTimeout(r, 10));
    flushSync();

    const titleInput = container.querySelector('#edit-title');
    titleInput.value = 'Changed';
    titleInput.dispatchEvent(new Event('input'));

    const reasonInput = container.querySelector('#edit-reason');
    reasonInput.value = 'reason';
    reasonInput.dispatchEvent(new Event('input'));

    flushSync();

    container.querySelector('.submit-btn').click();

    await new Promise(r => setTimeout(r, 20));
    flushSync();

    expect(container.textContent).toContain('此條目已有待審核的編輯建議');
  });

  it('disables submit when reason is empty', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.token = 'tok';

    const EditPage = (await import('../../src/routes/knowledge/edit/+page.svelte')).default;
    mount(EditPage, { target: container });

    await new Promise(r => setTimeout(r, 10));
    flushSync();

    // Change title but leave reason empty
    const titleInput = container.querySelector('#edit-title');
    titleInput.value = 'Changed';
    titleInput.dispatchEvent(new Event('input'));
    flushSync();

    const submitBtn = container.querySelector('.submit-btn');
    expect(submitBtn.disabled).toBe(true);
  });

  it('shows submitting loading state', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.token = 'tok';

    // Never-resolving promise to keep submitting state
    mockProposeEdit.mockReturnValue(new Promise(() => {}));

    const EditPage = (await import('../../src/routes/knowledge/edit/+page.svelte')).default;
    mount(EditPage, { target: container });

    await new Promise(r => setTimeout(r, 10));
    flushSync();

    const titleInput = container.querySelector('#edit-title');
    titleInput.value = 'Changed';
    titleInput.dispatchEvent(new Event('input'));

    const reasonInput = container.querySelector('#edit-reason');
    reasonInput.value = 'reason';
    reasonInput.dispatchEvent(new Event('input'));
    flushSync();

    container.querySelector('.submit-btn').click();

    await new Promise(r => setTimeout(r, 5));
    flushSync();

    expect(container.textContent).toContain('提交中...');
  });

  it('shows event form fields (title + content)', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.token = 'tok';
    mockSearchParams = new URLSearchParams('id=e1');

    const EditPage = (await import('../../src/routes/knowledge/edit/+page.svelte')).default;
    mount(EditPage, { target: container });

    await new Promise(r => setTimeout(r, 10));
    flushSync();

    expect(container.querySelector('#edit-title')).toBeTruthy();
    expect(container.querySelector('#edit-content')).toBeTruthy();
    expect(container.querySelector('#edit-reason')).toBeTruthy();
  });
});
