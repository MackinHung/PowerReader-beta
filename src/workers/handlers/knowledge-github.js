/**
 * Knowledge GitHub Handlers
 *
 * GitHub API integration for knowledge review workflow.
 * Users propose edits via PR, admins review and merge/close.
 *
 * Auth model:
 *   - User JWT: propose edits, browse PRs
 *   - Admin JWT: merge/close PRs (checked via env.ADMIN_USER_IDS)
 *
 * Flow:
 *   User proposes edit → Workers creates branch + commit + PR on GitHub
 *   → Admin reviews via web UI → merge/close via GitHub API
 *   → Cloudflare Pages auto-rebuild on merge
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { jsonResponse, errorResponse } from '../../../shared/response.js';

// ── GitHub API helpers ──────────────────────────────────

const GITHUB_API = 'https://api.github.com';

/**
 * Make an authenticated GitHub API request.
 * @param {object} env - Workers env with GITHUB_PAT
 * @param {string} path - API path (e.g. /repos/owner/repo/contents/...)
 * @param {object} [options] - fetch options
 * @returns {Promise<{ ok: boolean, status: number, data: object }>}
 */
async function githubFetch(env, path, options = {}) {
  const url = `${GITHUB_API}${path}`;
  const headers = {
    'Authorization': `Bearer ${env.GITHUB_PAT}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'PowerReader-Workers',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

/**
 * Check if a user_hash is in the admin list.
 * @param {object} env
 * @param {string} userHash
 * @returns {boolean}
 */
function isAdmin(env, userHash) {
  if (!env.ADMIN_USER_IDS) return false;
  const adminIds = env.ADMIN_USER_IDS.split(',').map(id => id.trim());
  return adminIds.includes(userHash);
}

// ── Handlers ────────────────────────────────────────────

/**
 * POST /api/v1/knowledge/github/propose
 *
 * Create a PR proposing an edit to a knowledge entry.
 *
 * Body: { entry_id, batch_file, changes, reason, content_hash }
 *   - entry_id: ID of the knowledge entry to edit
 *   - batch_file: batch file name (e.g. "batch_001")
 *   - changes: object with fields to update (e.g. { content: "new content" })
 *   - reason: user's reason for the edit
 *   - content_hash: SHA-256 of the current batch file content (conflict detection)
 */
export async function proposeEdit(request, env, ctx, { params, user }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'validation_error', 'Invalid JSON body');
  }

  const { entry_id, batch_file, changes, reason, content_hash } = body;

  // Validate required fields
  if (!entry_id || !batch_file || !changes || !reason || !content_hash) {
    return errorResponse(400, 'validation_error',
      'Missing required fields: entry_id, batch_file, changes, reason, content_hash');
  }

  if (typeof changes !== 'object' || Object.keys(changes).length === 0) {
    return errorResponse(400, 'validation_error', 'Changes must be a non-empty object');
  }

  const repo = env.GITHUB_REPO;
  const filePath = `data/knowledge/${batch_file}.json`;

  // 1. Read current file from GitHub
  const fileResult = await githubFetch(env, `/repos/${repo}/contents/${filePath}?ref=master`);

  if (!fileResult.ok) {
    if (fileResult.status === 404) {
      return errorResponse(404, 'not_found', `Batch file ${batch_file} not found`);
    }
    return errorResponse(502, 'github_error', 'Failed to read batch file from GitHub');
  }

  // 2. Verify content_hash matches (conflict detection)
  const currentSha = fileResult.data.sha;
  const currentContentB64 = fileResult.data.content;
  const currentContent = decodeBase64(currentContentB64);

  const actualHash = await sha256(currentContent);
  if (actualHash !== content_hash) {
    return jsonResponse(409, {
      success: false, data: null,
      error: {
        type: 'content_changed',
        message: 'The batch file has been modified since you last loaded it. Please refresh and try again.',
      },
    });
  }

  // 3. Check for existing open PR for this entry
  const existingPR = await findExistingPR(env, repo, entry_id);
  if (existingPR) {
    return jsonResponse(409, {
      success: false, data: null,
      error: {
        type: 'pr_exists',
        message: `An edit proposal for this entry is already pending review (PR #${existingPR.number}).`,
        pr_number: existingPR.number,
      },
    });
  }

  // 4. Parse current file and find entry
  let batchData;
  try {
    batchData = JSON.parse(currentContent);
  } catch {
    return errorResponse(502, 'github_error', 'Failed to parse batch file from GitHub');
  }

  const entryIndex = batchData.entries.findIndex(e => e.id === entry_id);
  if (entryIndex === -1) {
    return errorResponse(404, 'not_found', `Entry ${entry_id} not found in ${batch_file}`);
  }

  // 5. Apply changes (immutable — create new entry object)
  const oldEntry = batchData.entries[entryIndex];
  const allowedFields = ['title', 'content', 'party', 'type'];
  const filteredChanges = {};
  for (const key of Object.keys(changes)) {
    if (allowedFields.includes(key)) {
      filteredChanges[key] = changes[key];
    }
  }

  if (Object.keys(filteredChanges).length === 0) {
    return errorResponse(400, 'validation_error', 'No valid fields to update. Allowed: title, content, party, type');
  }

  const newEntry = { ...oldEntry, ...filteredChanges };
  const newEntries = batchData.entries.map((e, i) =>
    i === entryIndex ? newEntry : e
  );
  const newBatchData = { ...batchData, entries: newEntries };
  const newContent = JSON.stringify(newBatchData, null, 2);

  // 6. Create branch
  const timestamp = Date.now();
  const branchName = `knowledge-edit/${entry_id}-${timestamp}`;

  const masterRef = await githubFetch(env, `/repos/${repo}/git/refs/heads/master`);
  if (!masterRef.ok) {
    return errorResponse(502, 'github_error', 'Failed to get master branch reference');
  }

  const masterSha = masterRef.data.object.sha;
  const branchResult = await githubFetch(env, `/repos/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: masterSha,
    }),
  });

  if (!branchResult.ok) {
    return errorResponse(502, 'github_error', 'Failed to create branch');
  }

  // 7. Commit changes
  const commitMessage = `knowledge: update ${oldEntry.title}\n\nEntry: ${entry_id}\nReason: ${reason}\nProposed by: ${user.user_hash}`;
  const updateResult = await githubFetch(env, `/repos/${repo}/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: commitMessage,
      content: encodeBase64(newContent),
      sha: currentSha,
      branch: branchName,
      committer: {
        name: 'PowerReader Bot',
        email: 'bot@powerreader.pages.dev',
      },
    }),
  });

  if (!updateResult.ok) {
    // Clean up branch on failure
    await githubFetch(env, `/repos/${repo}/git/refs/heads/${branchName}`, {
      method: 'DELETE',
    });
    return errorResponse(502, 'github_error', 'Failed to commit changes');
  }

  // 8. Create PR
  const prTitle = `[Knowledge Edit] ${oldEntry.title}: ${reason}`;
  const prBody = [
    `## Knowledge Entry Edit Proposal`,
    ``,
    `- **Entry ID**: \`${entry_id}\``,
    `- **Batch File**: \`${batch_file}.json\``,
    `- **Proposed by**: \`${user.user_hash}\``,
    `- **Reason**: ${reason}`,
    ``,
    `### Changes`,
    ...Object.entries(filteredChanges).map(([key, value]) =>
      `- **${key}**: ${JSON.stringify(value).slice(0, 200)}`
    ),
  ].join('\n');

  const prResult = await githubFetch(env, `/repos/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: prTitle,
      body: prBody,
      head: branchName,
      base: 'master',
    }),
  });

  if (!prResult.ok) {
    // Clean up branch on failure
    await githubFetch(env, `/repos/${repo}/git/refs/heads/${branchName}`, {
      method: 'DELETE',
    });
    return errorResponse(502, 'github_error', 'Failed to create pull request');
  }

  return jsonResponse(201, {
    success: true,
    data: {
      pr_number: prResult.data.number,
      pr_url: prResult.data.html_url,
    },
    error: null,
  });
}

/**
 * GET /api/v1/knowledge/github/prs
 *
 * List open PRs for knowledge edits.
 */
export async function listPRs(request, env, ctx, { params, user }) {
  const repo = env.GITHUB_REPO;

  const result = await githubFetch(env, `/repos/${repo}/pulls?state=open&per_page=100`);

  if (!result.ok) {
    return errorResponse(502, 'github_error', 'Failed to list pull requests from GitHub');
  }

  // Filter only knowledge-edit branches
  const prs = result.data
    .filter(pr => pr.head.ref.startsWith('knowledge-edit/'))
    .map(pr => ({
      number: pr.number,
      title: pr.title,
      user: pr.body?.match(/Proposed by.*`([^`]+)`/)?.[1] || 'unknown',
      created_at: pr.created_at,
      labels: pr.labels.map(l => l.name),
    }));

  return jsonResponse(200, {
    success: true,
    data: { prs },
    error: null,
  });
}

/**
 * GET /api/v1/knowledge/github/prs/:number
 *
 * Get PR detail with diff.
 */
export async function getPRDetail(request, env, ctx, { params, user }) {
  const prNumber = params.number;
  const repo = env.GITHUB_REPO;

  // Fetch PR info
  const prResult = await githubFetch(env, `/repos/${repo}/pulls/${prNumber}`);

  if (!prResult.ok) {
    if (prResult.status === 404) {
      return errorResponse(404, 'not_found', `PR #${prNumber} not found`);
    }
    return errorResponse(502, 'github_error', 'Failed to get PR detail from GitHub');
  }

  // Fetch changed files
  const filesResult = await githubFetch(env, `/repos/${repo}/pulls/${prNumber}/files`);

  if (!filesResult.ok) {
    return errorResponse(502, 'github_error', 'Failed to get PR files from GitHub');
  }

  // Parse JSON diff to extract old/new entries
  let diff = null;
  const jsonFile = filesResult.data.find(f => f.filename.endsWith('.json'));

  if (jsonFile && jsonFile.patch) {
    diff = parsePatchDiff(jsonFile.patch);
  }

  return jsonResponse(200, {
    success: true,
    data: {
      pr: {
        number: prResult.data.number,
        title: prResult.data.title,
        body: prResult.data.body,
        state: prResult.data.state,
        created_at: prResult.data.created_at,
        user: prResult.data.body?.match(/Proposed by.*`([^`]+)`/)?.[1] || 'unknown',
        head_branch: prResult.data.head.ref,
        mergeable: prResult.data.mergeable,
      },
      diff,
      changed_files: filesResult.data.map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      })),
    },
    error: null,
  });
}

/**
 * POST /api/v1/knowledge/github/prs/:number/merge
 *
 * Merge a PR (admin only, squash merge).
 */
export async function mergePR(request, env, ctx, { params, user }) {
  if (!isAdmin(env, user.user_hash)) {
    return errorResponse(403, 'forbidden', 'Only admins can merge pull requests');
  }

  const prNumber = params.number;
  const repo = env.GITHUB_REPO;

  // Get PR to check state and get branch name
  const prResult = await githubFetch(env, `/repos/${repo}/pulls/${prNumber}`);
  if (!prResult.ok) {
    if (prResult.status === 404) {
      return errorResponse(404, 'not_found', `PR #${prNumber} not found`);
    }
    return errorResponse(502, 'github_error', 'Failed to get PR from GitHub');
  }

  if (prResult.data.state !== 'open') {
    return errorResponse(400, 'validation_error', `PR #${prNumber} is not open`);
  }

  // Squash merge
  const mergeResult = await githubFetch(env, `/repos/${repo}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: JSON.stringify({
      merge_method: 'squash',
    }),
  });

  if (!mergeResult.ok) {
    return errorResponse(502, 'github_error', 'Failed to merge pull request');
  }

  // Delete branch
  const branchName = prResult.data.head.ref;
  await githubFetch(env, `/repos/${repo}/git/refs/heads/${branchName}`, {
    method: 'DELETE',
  });

  return jsonResponse(200, {
    success: true,
    data: { merged: true },
    error: null,
  });
}

/**
 * POST /api/v1/knowledge/github/prs/:number/close
 *
 * Close a PR without merging (admin only).
 * Body: { reason } (optional)
 */
export async function closePR(request, env, ctx, { params, user }) {
  if (!isAdmin(env, user.user_hash)) {
    return errorResponse(403, 'forbidden', 'Only admins can close pull requests');
  }

  const prNumber = params.number;
  const repo = env.GITHUB_REPO;

  let closeReason = '';
  try {
    const body = await request.json();
    closeReason = body.reason || '';
  } catch {
    // No body or invalid JSON — reason is optional
  }

  // Get PR to get branch name
  const prResult = await githubFetch(env, `/repos/${repo}/pulls/${prNumber}`);
  if (!prResult.ok) {
    if (prResult.status === 404) {
      return errorResponse(404, 'not_found', `PR #${prNumber} not found`);
    }
    return errorResponse(502, 'github_error', 'Failed to get PR from GitHub');
  }

  if (prResult.data.state !== 'open') {
    return errorResponse(400, 'validation_error', `PR #${prNumber} is not open`);
  }

  // Add comment with close reason
  if (closeReason) {
    await githubFetch(env, `/repos/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body: `Closed by admin: ${closeReason}`,
      }),
    });
  }

  // Close PR
  const closeResult = await githubFetch(env, `/repos/${repo}/pulls/${prNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
  });

  if (!closeResult.ok) {
    return errorResponse(502, 'github_error', 'Failed to close pull request');
  }

  // Delete branch
  const branchName = prResult.data.head.ref;
  await githubFetch(env, `/repos/${repo}/git/refs/heads/${branchName}`, {
    method: 'DELETE',
  });

  return jsonResponse(200, {
    success: true,
    data: { closed: true },
    error: null,
  });
}

// ── Internal utilities ──────────────────────────────────

/**
 * Find existing open PR for a knowledge entry.
 */
async function findExistingPR(env, repo, entryId) {
  const result = await githubFetch(env, `/repos/${repo}/pulls?state=open&per_page=100`);
  if (!result.ok) return null;

  return result.data.find(pr => {
    const branch = pr.head.ref;
    // Branch format: knowledge-edit/{entry_id}-{timestamp}
    return branch.startsWith(`knowledge-edit/${entryId}-`);
  }) || null;
}

/**
 * Compute SHA-256 hash of a string.
 */
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Decode base64 content (GitHub returns base64 with newlines).
 */
function decodeBase64(b64) {
  // GitHub API returns base64 content with line breaks
  const cleaned = b64.replace(/\n/g, '');
  return atob(cleaned);
}

/**
 * Encode string to base64 for GitHub API.
 */
function encodeBase64(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

/**
 * Parse unified diff patch to extract added/removed lines.
 * Returns a simplified diff summary for the review UI.
 */
function parsePatchDiff(patch) {
  const lines = patch.split('\n');
  const removed = [];
  const added = [];

  for (const line of lines) {
    if (line.startsWith('-') && !line.startsWith('---')) {
      removed.push(line.slice(1));
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      added.push(line.slice(1));
    }
  }

  return { removed, added };
}

// Export internal helpers for testing
export { githubFetch, isAdmin, sha256, decodeBase64, encodeBase64, findExistingPR, parsePatchDiff };
