/**
 * Auth Handlers
 *
 * Google OAuth login → JWT (RS256) + session.
 * PDPA compliance: Right to deletion + data export.
 *
 * Maintainer: T01 (System Architecture Team)
 */

import { SECURITY } from '../../../shared/config.js';
import { nowISO } from '../../../shared/utils.js';
import { generateUserHash } from '../../../shared/utils.js';

/**
 * POST /api/v1/auth/google — Google OAuth login
 * Receives Google ID token, validates, creates/updates user, returns JWT.
 */
export async function googleAuth(request, env, ctx, { url }) {
  const body = await request.json();
  const { id_token } = body;

  if (!id_token) {
    return jsonResponse(400, {
      success: false, data: null,
      error: { type: 'validation_error', message: '輸入資料格式錯誤,請檢查後重試' }
    });
  }

  // Verify Google ID token
  // In production, verify via Google's tokeninfo endpoint or JWKS
  let googleUser;
  try {
    const verifyResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`
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

  // Upsert user in D1
  await env.DB.prepare(`
    INSERT INTO users (user_hash, created_at, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_hash) DO UPDATE SET updated_at = ?
  `).bind(user_hash, nowISO(), nowISO(), nowISO()).run();

  // Create session
  const session_id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SECURITY.SESSION_TTL_HOURS * 3600 * 1000).toISOString();

  // Note: sessions table needs to be created in D1 schema
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

  return jsonResponse(200, {
    success: true,
    data: { token: jwt, user_hash, session_id, expires_at: expiresAt },
    error: null
  });
}

/**
 * GET /api/v1/user/me — Get current user info
 */
export async function getMe(request, env, ctx, { user }) {
  const row = await env.DB.prepare(
    'SELECT user_hash, total_points_cents, contribution_count, vote_rights, created_at FROM users WHERE user_hash = ?'
  ).bind(user.user_hash).first();

  if (!row) {
    return jsonResponse(404, {
      success: false, data: null,
      error: { type: 'not_found', message: '找不到請求的資源' }
    });
  }

  return jsonResponse(200, {
    success: true,
    data: {
      user_hash: row.user_hash,
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

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
