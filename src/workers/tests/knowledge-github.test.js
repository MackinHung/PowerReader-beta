/**
 * Unit tests for knowledge-github handler
 *
 * Tests cover: proposeEdit, listPRs, getPRDetail, mergePR, closePR
 * Uses mock fetch to simulate GitHub API responses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock shared modules ────────────────────────────────
vi.mock('../../../shared/response.js', () => ({
  jsonResponse: vi.fn((status, body) => ({ status, body })),
  errorResponse: vi.fn((status, type, message, details) => ({
    status,
    body: { success: false, data: null, error: { type, message, ...(details ? { details } : {}) } },
  })),
}));

import {
  proposeEdit,
  listPRs,
  getPRDetail,
  mergePR,
  closePR,
  isAdmin,
  sha256,
  decodeBase64,
  encodeBase64,
  parsePatchDiff,
} from '../handlers/knowledge-github.js';

// ── Helpers ────────────────────────────────────────────

const MOCK_REPO = 'MackinHung/powerreader-next';

function createMockEnv(overrides = {}) {
  return {
    GITHUB_PAT: 'ghp_test_token_123',
    GITHUB_REPO: MOCK_REPO,
    ADMIN_USER_IDS: 'admin_hash_1,admin_hash_2',
    ...overrides,
  };
}

function createRequest(body) {
  return {
    json: vi.fn().mockResolvedValue(body),
  };
}

function createBadJsonRequest() {
  return {
    json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
  };
}

const SAMPLE_BATCH_DATA = {
  entries: [
    {
      id: 'pol_abc123',
      type: 'politician',
      title: 'Test Person',
      content: 'Original content here',
      party: 'KMT',
    },
    {
      id: 'pol_def456',
      type: 'politician',
      title: 'Other Person',
      content: 'Other content',
      party: 'DPP',
    },
  ],
};

const SAMPLE_BATCH_JSON = JSON.stringify(SAMPLE_BATCH_DATA, null, 2);
const SAMPLE_BATCH_B64 = btoa(unescape(encodeURIComponent(SAMPLE_BATCH_JSON)));

let mockFetchResponses;

function setupGlobalFetch() {
  mockFetchResponses = [];
  globalThis.fetch = vi.fn().mockImplementation(async (url) => {
    const response = mockFetchResponses.shift();
    if (!response) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ message: 'No mock response configured' }),
      };
    }
    return {
      ok: response.ok !== undefined ? response.ok : true,
      status: response.status || 200,
      json: async () => response.data || {},
    };
  });
}

function addMockResponse(data, ok = true, status = 200) {
  mockFetchResponses.push({ data, ok, status });
}

// ── Setup ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setupGlobalFetch();
});

// ══════════════════════════════════════════════════════
// proposeEdit
// ══════════════════════════════════════════════════════

describe('proposeEdit', () => {
  it('creates PR successfully for a valid edit proposal', async () => {
    const env = createMockEnv();

    // Compute the content hash of the sample batch
    const encoder = new TextEncoder();
    const data = encoder.encode(SAMPLE_BATCH_JSON);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const request = createRequest({
      entry_id: 'pol_abc123',
      batch_file: 'batch_001',
      changes: { content: 'Updated content' },
      reason: 'Fix outdated info',
      content_hash: contentHash,
    });

    // 1. GET file contents from GitHub
    addMockResponse({
      sha: 'file_sha_abc',
      content: SAMPLE_BATCH_B64,
    });

    // 2. GET open PRs (check for existing PR)
    addMockResponse([]);

    // 3. GET master ref
    addMockResponse({ object: { sha: 'master_sha_123' } });

    // 4. POST create branch
    addMockResponse({ ref: 'refs/heads/knowledge-edit/pol_abc123-1234' });

    // 5. PUT commit file
    addMockResponse({ content: { sha: 'new_file_sha' } });

    // 6. POST create PR
    addMockResponse({
      number: 42,
      html_url: 'https://github.com/MackinHung/powerreader-next/pull/42',
    });

    const result = await proposeEdit(request, env, {}, {
      params: {},
      user: { user_hash: 'user_123' },
    });

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
    expect(result.body.data.pr_number).toBe(42);
    expect(result.body.data.pr_url).toContain('/pull/42');
  });

  it('returns 409 when content_hash does not match', async () => {
    const env = createMockEnv();

    const request = createRequest({
      entry_id: 'pol_abc123',
      batch_file: 'batch_001',
      changes: { content: 'Updated content' },
      reason: 'Fix outdated info',
      content_hash: 'wrong_hash_value',
    });

    // GET file contents
    addMockResponse({
      sha: 'file_sha_abc',
      content: SAMPLE_BATCH_B64,
    });

    const result = await proposeEdit(request, env, {}, {
      params: {},
      user: { user_hash: 'user_123' },
    });

    expect(result.status).toBe(409);
    expect(result.body.error.type).toBe('content_changed');
  });

  it('returns 409 when open PR already exists for entry', async () => {
    const env = createMockEnv();

    const encoder = new TextEncoder();
    const data = encoder.encode(SAMPLE_BATCH_JSON);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const request = createRequest({
      entry_id: 'pol_abc123',
      batch_file: 'batch_001',
      changes: { content: 'Updated content' },
      reason: 'Fix outdated info',
      content_hash: contentHash,
    });

    // GET file contents
    addMockResponse({
      sha: 'file_sha_abc',
      content: SAMPLE_BATCH_B64,
    });

    // GET open PRs — one exists for this entry
    addMockResponse([
      {
        number: 99,
        head: { ref: 'knowledge-edit/pol_abc123-9999999' },
        labels: [],
      },
    ]);

    const result = await proposeEdit(request, env, {}, {
      params: {},
      user: { user_hash: 'user_123' },
    });

    expect(result.status).toBe(409);
    expect(result.body.error.type).toBe('pr_exists');
    expect(result.body.error.pr_number).toBe(99);
  });

  it('returns 400 when required fields are missing', async () => {
    const env = createMockEnv();

    const request = createRequest({
      entry_id: 'pol_abc123',
      // missing batch_file, changes, reason, content_hash
    });

    const result = await proposeEdit(request, env, {}, {
      params: {},
      user: { user_hash: 'user_123' },
    });

    expect(result.status).toBe(400);
    expect(result.body.error.type).toBe('validation_error');
  });

  it('returns 400 when request body is invalid JSON', async () => {
    const env = createMockEnv();
    const request = createBadJsonRequest();

    const result = await proposeEdit(request, env, {}, {
      params: {},
      user: { user_hash: 'user_123' },
    });

    expect(result.status).toBe(400);
    expect(result.body.error.type).toBe('validation_error');
  });
});

// ══════════════════════════════════════════════════════
// listPRs
// ══════════════════════════════════════════════════════

describe('listPRs', () => {
  it('returns list of knowledge-edit PRs', async () => {
    const env = createMockEnv();

    addMockResponse([
      {
        number: 1,
        title: '[Knowledge Edit] Test: reason',
        head: { ref: 'knowledge-edit/pol_abc123-1234' },
        body: 'Proposed by: `user_hash_1`',
        created_at: '2026-03-19T10:00:00Z',
        labels: [{ name: 'knowledge' }],
      },
      {
        number: 2,
        title: 'Some other PR',
        head: { ref: 'feature/something' },
        body: '',
        created_at: '2026-03-19T11:00:00Z',
        labels: [],
      },
      {
        number: 3,
        title: '[Knowledge Edit] Another',
        head: { ref: 'knowledge-edit/pol_def456-5678' },
        body: 'Proposed by: `user_hash_2`',
        created_at: '2026-03-19T12:00:00Z',
        labels: [],
      },
    ]);

    const result = await listPRs({}, env, {}, {
      params: {},
      user: { user_hash: 'user_123' },
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    // Should filter out PR #2 (not a knowledge-edit branch)
    expect(result.body.data.prs).toHaveLength(2);
    expect(result.body.data.prs[0].number).toBe(1);
    expect(result.body.data.prs[1].number).toBe(3);
  });

  it('returns empty list when no knowledge PRs exist', async () => {
    const env = createMockEnv();

    addMockResponse([
      {
        number: 1,
        title: 'Feature PR',
        head: { ref: 'feature/abc' },
        body: '',
        created_at: '2026-03-19T10:00:00Z',
        labels: [],
      },
    ]);

    const result = await listPRs({}, env, {}, {
      params: {},
      user: { user_hash: 'user_123' },
    });

    expect(result.status).toBe(200);
    expect(result.body.data.prs).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════
// getPRDetail
// ══════════════════════════════════════════════════════

describe('getPRDetail', () => {
  it('returns PR detail with diff info', async () => {
    const env = createMockEnv();

    // GET PR
    addMockResponse({
      number: 42,
      title: '[Knowledge Edit] Test Person: fix info',
      body: 'Proposed by: `user_hash_1`',
      state: 'open',
      created_at: '2026-03-19T10:00:00Z',
      head: { ref: 'knowledge-edit/pol_abc123-1234' },
      mergeable: true,
    });

    // GET files
    addMockResponse([
      {
        filename: 'data/knowledge/batch_001.json',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: '-      "content": "Original content"\n+      "content": "Updated content"',
      },
    ]);

    const result = await getPRDetail({}, env, {}, {
      params: { number: '42' },
      user: { user_hash: 'user_123' },
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.pr.number).toBe(42);
    expect(result.body.data.pr.mergeable).toBe(true);
    expect(result.body.data.changed_files).toHaveLength(1);
    expect(result.body.data.diff).not.toBeNull();
  });

  it('returns 404 when PR does not exist', async () => {
    const env = createMockEnv();

    addMockResponse({ message: 'Not Found' }, false, 404);

    const result = await getPRDetail({}, env, {}, {
      params: { number: '999' },
      user: { user_hash: 'user_123' },
    });

    expect(result.status).toBe(404);
    expect(result.body.error.type).toBe('not_found');
  });
});

// ══════════════════════════════════════════════════════
// mergePR
// ══════════════════════════════════════════════════════

describe('mergePR', () => {
  it('merges PR successfully for admin user', async () => {
    const env = createMockEnv();

    // GET PR
    addMockResponse({
      number: 42,
      state: 'open',
      head: { ref: 'knowledge-edit/pol_abc123-1234' },
    });

    // PUT merge
    addMockResponse({ merged: true });

    // DELETE branch
    addMockResponse({});

    const result = await mergePR({}, env, {}, {
      params: { number: '42' },
      user: { user_hash: 'admin_hash_1' },
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.merged).toBe(true);
  });

  it('returns 403 for non-admin user', async () => {
    const env = createMockEnv();

    const result = await mergePR({}, env, {}, {
      params: { number: '42' },
      user: { user_hash: 'regular_user_hash' },
    });

    expect(result.status).toBe(403);
    expect(result.body.error.type).toBe('forbidden');
  });
});

// ══════════════════════════════════════════════════════
// closePR
// ══════════════════════════════════════════════════════

describe('closePR', () => {
  it('closes PR successfully for admin user', async () => {
    const env = createMockEnv();

    const request = createRequest({});

    // GET PR
    addMockResponse({
      number: 42,
      state: 'open',
      head: { ref: 'knowledge-edit/pol_abc123-1234' },
    });

    // PATCH close PR
    addMockResponse({ state: 'closed' });

    // DELETE branch
    addMockResponse({});

    const result = await closePR(request, env, {}, {
      params: { number: '42' },
      user: { user_hash: 'admin_hash_2' },
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.closed).toBe(true);
  });

  it('closes PR with reason and adds comment', async () => {
    const env = createMockEnv();

    const request = createRequest({ reason: 'Information is incorrect' });

    // GET PR
    addMockResponse({
      number: 42,
      state: 'open',
      head: { ref: 'knowledge-edit/pol_abc123-1234' },
    });

    // POST comment
    addMockResponse({ id: 1 });

    // PATCH close PR
    addMockResponse({ state: 'closed' });

    // DELETE branch
    addMockResponse({});

    const result = await closePR(request, env, {}, {
      params: { number: '42' },
      user: { user_hash: 'admin_hash_1' },
    });

    expect(result.status).toBe(200);
    expect(result.body.data.closed).toBe(true);

    // Verify comment was posted (the third fetch call should be to issues/comments)
    const commentCall = globalThis.fetch.mock.calls.find(call =>
      call[0].includes('/issues/42/comments')
    );
    expect(commentCall).toBeDefined();
  });

  it('returns 403 for non-admin user', async () => {
    const env = createMockEnv();
    const request = createRequest({});

    const result = await closePR(request, env, {}, {
      params: { number: '42' },
      user: { user_hash: 'regular_user_hash' },
    });

    expect(result.status).toBe(403);
    expect(result.body.error.type).toBe('forbidden');
  });
});

// ══════════════════════════════════════════════════════
// GitHub API error handling
// ══════════════════════════════════════════════════════

describe('GitHub API error handling', () => {
  it('returns 502 when GitHub API fails for listPRs', async () => {
    const env = createMockEnv();

    addMockResponse({ message: 'Internal Server Error' }, false, 500);

    const result = await listPRs({}, env, {}, {
      params: {},
      user: { user_hash: 'user_123' },
    });

    expect(result.status).toBe(502);
    expect(result.body.error.type).toBe('github_error');
  });
});

// ══════════════════════════════════════════════════════
// Utility functions
// ══════════════════════════════════════════════════════

describe('isAdmin', () => {
  it('returns true for admin user', () => {
    const env = createMockEnv();
    expect(isAdmin(env, 'admin_hash_1')).toBe(true);
    expect(isAdmin(env, 'admin_hash_2')).toBe(true);
  });

  it('returns false for non-admin user', () => {
    const env = createMockEnv();
    expect(isAdmin(env, 'random_user')).toBe(false);
  });

  it('returns false when ADMIN_USER_IDS is not set', () => {
    const env = createMockEnv({ ADMIN_USER_IDS: undefined });
    expect(isAdmin(env, 'admin_hash_1')).toBe(false);
  });
});

describe('parsePatchDiff', () => {
  it('extracts added and removed lines', () => {
    const patch = `@@ -1,3 +1,3 @@
 unchanged line
-old line
+new line
 another unchanged`;

    const result = parsePatchDiff(patch);
    expect(result.removed).toEqual(['old line']);
    expect(result.added).toEqual(['new line']);
  });
});
