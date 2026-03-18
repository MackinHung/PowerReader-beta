/**
 * Auth Handlers
 *
 * Google OAuth login → JWT (RS256) + session.
 * PDPA compliance: Right to deletion + data export.
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { SECURITY } from '../../../shared/config.js';
import { nowISO, generateUserHash } from '../../../shared/utils.js';
import { jsonResponse } from '../../../shared/response.js';

/**
 * GET /api/v1/auth/google — Initiate Google OAuth redirect flow
 * Redirects user to Google's consent screen.
 * Query params: ?redirect=<frontend_url_after_login>
 */
export async function googleAuth(request, env, ctx, { url }) {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return jsonResponse(503, {
      success: false, data: null,
      error: { type: 'api_error', message: '系統錯誤,請稍後再試' }
    });
  }

  const redirectUri = `${url.origin}/api/v1/auth/google/callback`;
  const frontendRedirect = url.searchParams.get('redirect') || '';

  // Store frontend redirect URL in state parameter
  const state = btoa(JSON.stringify({ redirect: frontendRedirect }));

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', clientId);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid profile');
  googleAuthUrl.searchParams.set('state', state);
  googleAuthUrl.searchParams.set('prompt', 'select_account');

  return Response.redirect(googleAuthUrl.toString(), 302);
}

/**
 * GET /api/v1/auth/google/callback — Handle Google OAuth callback
 * Exchanges auth code for tokens, creates user/session, redirects to frontend.
 */
export async function googleOAuthCallback(request, env, ctx, { url }) {
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error || !code) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '登入已取消或失敗' }
    });
  }

  // Decode state to get frontend redirect URL
  let frontendRedirect = '';
  try {
    const stateData = JSON.parse(atob(stateParam || ''));
    frontendRedirect = stateData.redirect || '';
  } catch { /* ignore invalid state */ }

  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${url.origin}/api/v1/auth/google/callback`;

  // Exchange authorization code for tokens
  let tokenData;
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[Auth] Google token exchange failed:', tokenResponse.status, JSON.stringify(tokenData));
      return jsonResponse(502, {
        success: false, data: null,
        error: { type: 'api_error', message: '系統錯誤,請稍後再試' }
      });
    }
  } catch {
    return jsonResponse(502, {
      success: false, data: null,
      error: { type: 'api_error', message: '系統錯誤,請稍後再試' }
    });
  }

  // Get user info from the ID token
  let googleUser;
  try {
    const verifyResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${tokenData.id_token}`
    );
    if (!verifyResponse.ok) {
      return jsonResponse(401, {
        success: false, data: null,
        error: { type: 'unauthorized', message: '未授權,請先登入' }
      });
    }
    googleUser = await verifyResponse.json();
  } catch {
    return jsonResponse(502, {
      success: false, data: null,
      error: { type: 'api_error', message: '系統錯誤,請稍後再試' }
    });
  }

  // Anonymize user (SHA-256 of Google UID)
  const user_hash = await generateUserHash(googleUser.sub);

  // Extract display name from Google profile (scope: 'openid profile')
  const display_name = googleUser.name || googleUser.given_name || null;

  // Upsert user in D1 (update display_name on every login to stay fresh)
  await env.DB.prepare(`
    INSERT INTO users (user_hash, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_hash) DO UPDATE SET display_name = COALESCE(?, display_name), updated_at = ?
  `).bind(user_hash, display_name, nowISO(), nowISO(), display_name, nowISO()).run();

  // Create session
  const session_id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SECURITY.SESSION_TTL_HOURS * 3600 * 1000).toISOString();

  await env.DB.prepare(`
    INSERT INTO sessions (session_id, user_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(session_id, user_hash, expiresAt, nowISO()).run();

  // Generate JWT (RS256)
  const jwt = await signJwt(
    { sub: user_hash, session_id, iat: Math.floor(Date.now() / 1000) },
    env.JWT_PRIVATE_KEY,
    SECURITY.JWT_TTL_DAYS
  );

  // Redirect to frontend with token in URL fragment
  // Parse the frontend redirect to determine the base URL
  let redirectBase = frontendRedirect || 'https://powerreader.pages.dev';
  // Extract origin from the redirect URL
  try {
    const redirectUrl = new URL(redirectBase);
    redirectBase = redirectUrl.origin;
  } catch {
    redirectBase = 'https://powerreader.pages.dev';
  }

  const callbackUrl = `${redirectBase}/auth/callback?token=${encodeURIComponent(jwt)}&session=${encodeURIComponent(session_id)}`;
  return Response.redirect(callbackUrl, 302);
}

/**
 * GET /api/v1/user/me — Get current user info
 */
export async function getMe(request, env, ctx, { user }) {
  const row = await env.DB.prepare(
    'SELECT user_hash, display_name, total_points_cents, contribution_count, vote_rights, created_at FROM users WHERE user_hash = ?'
  ).bind(user.user_hash).first();

  if (!row) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到請求的資源' }
    });
  }

  // Derive role from contribution_count
  const role = row.contribution_count >= 100 ? 'expert'
    : row.contribution_count >= 10 ? 'regular'
    : 'contributor';

  return jsonResponse(200, {
    success: true,
    data: {
      user_hash: row.user_hash,
      display_name: row.display_name || null,
      role,
      total_points_cents: row.total_points_cents,
      display_points: (row.total_points_cents / 100).toFixed(2),
      contribution_count: row.contribution_count,
      vote_rights: row.vote_rights,
      member_since: row.created_at
    },
    error: null
  });
}

/**
 * DELETE /api/v1/user/me — Delete account (PDPA Article 11: Right to Deletion)
 */
export async function deleteMe(request, env, ctx, { user }) {
  const { user_hash } = user;

  // Delete all user data
  await env.DB.batch([
    env.DB.prepare('DELETE FROM analyses WHERE user_hash = ?').bind(user_hash),
    env.DB.prepare('DELETE FROM sessions WHERE user_hash = ?').bind(user_hash),
    env.DB.prepare('DELETE FROM users WHERE user_hash = ?').bind(user_hash),
  ]);

  return jsonResponse(200, {
    success: true,
    data: { deleted: true, user_hash },
    error: null
  });
}

/**
 * GET /api/v1/user/me/export — Export personal data (data portability)
 */
export async function exportMe(request, env, ctx, { user }) {
  const { user_hash } = user;

  const userData = await env.DB.prepare(
    'SELECT * FROM users WHERE user_hash = ?'
  ).bind(user_hash).first();

  const analyses = await env.DB.prepare(
    'SELECT * FROM analyses WHERE user_hash = ?'
  ).bind(user_hash).all();

  return jsonResponse(200, {
    success: true,
    data: {
      user: userData,
      analyses: analyses.results || [],
      exported_at: nowISO()
    },
    error: null
  });
}

/**
 * GET /api/v1/user/me/contributions — Contribution history + daily trend
 * Supports: ?days=30 (sparkline), ?page=1&limit=20 (history list)
 */
export async function getContributions(request, env, ctx, { user, url }) {
  const { user_hash } = user;
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)));
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  // Daily counts for sparkline (last N days)
  const dailyRows = await env.DB.prepare(`
    SELECT DATE(created_at) AS day, COUNT(*) AS cnt
    FROM analyses
    WHERE user_hash = ? AND created_at >= datetime('now', ?)
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `).bind(user_hash, `-${days} days`).all();

  // Build array of daily counts (fill missing days with 0)
  const dailyMap = {};
  for (const row of (dailyRows.results || [])) {
    dailyMap[row.day] = row.cnt;
  }

  const daily_counts = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    daily_counts.push(dailyMap[key] || 0);
  }

  // Paginated contribution history (analyses joined with articles)
  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM analyses WHERE user_hash = ?'
  ).bind(user_hash).first();
  const total = countResult?.total || 0;

  const contribRows = await env.DB.prepare(`
    SELECT a.article_id, a.bias_score, a.quality_gate_result, a.created_at,
           ar.title AS article_title
    FROM analyses a
    LEFT JOIN articles ar ON a.article_id = ar.article_id
    WHERE a.user_hash = ?
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(user_hash, limit, offset).all();

  const contributions = (contribRows.results || []).map(row => ({
    article_id: row.article_id,
    article_title: row.article_title || '',
    status: row.quality_gate_result === 'passed' ? 'accepted' : 'pending',
    points_earned: row.quality_gate_result === 'passed' ? 10 : 0,
    created_at: row.created_at
  }));

  return jsonResponse(200, {
    success: true,
    data: {
      daily_counts,
      contributions,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
    },
    error: null
  });
}

/**
 * Sign a JWT with RS256
 */
async function signJwt(payload, privateKeyJwk, ttlDays) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + (ttlDays * 86400);
  const fullPayload = { ...payload, exp };

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(fullPayload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signedContent = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'jwk',
    JSON.parse(privateKeyJwk),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signedContent)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

