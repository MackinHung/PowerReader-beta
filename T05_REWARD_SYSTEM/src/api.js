/**
 * T05 - Reward System API Handler
 *
 * Cloudflare Worker request handler for T05 endpoints.
 * Designed to be mounted under `/api/v1/rewards/` by T01's main router.
 *
 * v1.0 Endpoints:
 *   POST /submit    - Process analysis submission (called by T03 after quality gate)
 *   POST /failure   - Record failed submission
 *   GET  /me        - Get current user's points & status
 *
 * Phase 2+ Endpoints (not implemented):
 *   GET  /leaderboard
 *   POST /vote
 *   GET  /votes/:id
 *   GET  /votes/:id/verify
 *
 * Dependencies:
 *   - D1 Database: powerreader-db (bound as env.DB via wrangler.toml)
 *   - Module: ./index.js (barrel re-export)
 *
 * @module T05/api
 */

import {
  createD1Repository,
  processAnalysisReward,
  processAnalysisFailure,
  centsToDisplayPoints,
  getAvailableVoteRights,
  getAnonymizedName,
  checkCooldown,
  DAILY_ANALYSIS_LIMIT,
} from "./index.js";

// ── Response Helpers ────────────────────────────────────────

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ success: false, error: message }, status);
}

// ── Validation Helpers ──────────────────────────────────────

const SHA256_REGEX = /^[a-f0-9]{64}$/i;

function isValidSha256(value) {
  return typeof value === "string" && SHA256_REGEX.test(value);
}

// ── Route Handlers ──────────────────────────────────────────

/**
 * POST /submit
 *
 * Called by T03 after quality gate passes.
 * Request body:
 *   {
 *     "user_hash": "sha256...",
 *     "article_id": "sha256...",
 *     "content_hash": "sha256...",
 *     "time_spent_ms": 12345,
 *     "quality_gate_result": "passed"
 *   }
 */
async function handleSubmit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { user_hash, article_id, content_hash, time_spent_ms, quality_gate_result } = body;

  // Validate required fields
  if (!user_hash || !article_id || time_spent_ms === undefined) {
    return errorResponse("Missing required fields: user_hash, article_id, time_spent_ms");
  }

  if (!content_hash) {
    return errorResponse("Missing required field: content_hash (required for deduplication)");
  }

  // Validate SHA-256 format
  if (!isValidSha256(user_hash)) {
    return errorResponse("user_hash must be a valid SHA-256 hex string");
  }
  if (!isValidSha256(article_id)) {
    return errorResponse("article_id must be a valid SHA-256 hex string");
  }
  if (!isValidSha256(content_hash)) {
    return errorResponse("content_hash must be a valid SHA-256 hex string");
  }

  if (quality_gate_result !== "passed") {
    return errorResponse("Quality gate must be 'passed' to award points");
  }

  if (typeof time_spent_ms !== "number" || time_spent_ms < 0) {
    return errorResponse("time_spent_ms must be a non-negative number");
  }

  const repo = createD1Repository(env.DB);
  const result = await processAnalysisReward(
    repo,
    user_hash,
    article_id,
    content_hash,
    time_spent_ms,
  );

  if (!result.success) {
    return errorResponse(result.error, result.code);
  }

  return jsonResponse({
    success: true,
    data: {
      total_points: centsToDisplayPoints(result.record.total_points_cents),
      contribution_count: result.record.contribution_count,
      vote_rights: result.record.vote_rights,
      daily_remaining: DAILY_ANALYSIS_LIMIT - result.record.daily_analysis_count,
    },
  });
}

/**
 * POST /failure
 *
 * Called by T03 when quality gate rejects a submission.
 * Request body:
 *   {
 *     "user_hash": "sha256...",
 *     "failed_gate": "failed_format"
 *   }
 */
async function handleFailure(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { user_hash, failed_gate } = body;

  if (!user_hash) {
    return errorResponse("Missing required field: user_hash");
  }

  if (!isValidSha256(user_hash)) {
    return errorResponse("user_hash must be a valid SHA-256 hex string");
  }

  const repo = createD1Repository(env.DB);
  const result = await processAnalysisFailure(repo, user_hash);

  const responseData = {
    success: true,
    data: {
      consecutive_failures: result.record.consecutive_failures,
      cooldown_triggered: result.cooldownTriggered,
    },
  };

  if (result.cooldownTriggered) {
    const cooldownStatus = checkCooldown(result.record, new Date().toISOString());
    responseData.data.remaining_seconds = Math.ceil(cooldownStatus.remainingMs / 1000);
    responseData.data.message = "連續失敗 3 次，冷卻 1 小時";
  }

  return jsonResponse(responseData);
}

/**
 * GET /me
 *
 * Returns the current user's points summary.
 * Requires user_hash in query params or auth header.
 */
async function handleGetMe(request, env) {
  const url = new URL(request.url);
  const userHash = url.searchParams.get("user_hash");

  if (!userHash) {
    return errorResponse("Missing query parameter: user_hash", 400);
  }

  if (!isValidSha256(userHash)) {
    return errorResponse("user_hash must be a valid SHA-256 hex string", 400);
  }

  const repo = createD1Repository(env.DB);
  const record = await repo.getUser(userHash);

  if (!record) {
    return jsonResponse({
      success: true,
      data: {
        total_points: 0,
        contribution_count: 0,
        vote_rights: 0,
        available_vote_rights: 0,
        display_name: getAnonymizedName(userHash),
        cooldown: null,
      },
    });
  }

  const now = new Date().toISOString();
  const cooldownStatus = checkCooldown(record, now);

  return jsonResponse({
    success: true,
    data: {
      total_points: centsToDisplayPoints(record.total_points_cents),
      contribution_count: record.contribution_count,
      vote_rights: record.vote_rights,
      available_vote_rights: getAvailableVoteRights(record),
      display_name: getAnonymizedName(userHash),
      daily_analysis_count: record.daily_analysis_count,
      cooldown: cooldownStatus.inCooldown
        ? {
            remaining_seconds: Math.ceil(cooldownStatus.remainingMs / 1000),
          }
        : null,
      last_contribution_at: record.last_contribution_at,
    },
  });
}

// ── Router ──────────────────────────────────────────────────

/**
 * Main T05 request handler.
 *
 * Designed to be called by T01's main Workers router:
 *   if (path.startsWith("/api/v1/rewards")) {
 *     return handleT05Request(request, env, path);
 *   }
 *
 * @param {Request} request  - Incoming HTTP request
 * @param {Object}  env      - Cloudflare Worker env bindings (DB D1)
 * @param {string}  subPath  - Path after "/api/v1/rewards" (e.g., "/submit", "/me")
 * @returns {Promise<Response>}
 */
export async function handleT05Request(request, env, subPath) {
  const method = request.method;

  if (method === "POST" && subPath === "/submit") {
    return handleSubmit(request, env);
  }

  if (method === "POST" && subPath === "/failure") {
    return handleFailure(request, env);
  }

  if (method === "GET" && subPath === "/me") {
    return handleGetMe(request, env);
  }

  // Phase 2+ endpoints
  if (subPath.startsWith("/vote") || subPath === "/leaderboard") {
    return errorResponse("此功能將在 Phase 2 推出", 501);
  }

  return errorResponse("Not Found", 404);
}

export default { handleT05Request };
