/**
 * Authentication Middleware for Cloudflare Workers
 *
 * Supports:
 * - JWT (RS256) for user authentication
 * - Service Token for internal endpoints (T02 crawler, T07 metrics)
 * - Admin API Key for privileged operations
 *
 * Lesson from OceanRAG: Cross-verify JWT + session to prevent IDOR.
 *
 * Maintainer: T01 (System Architecture Team)
 */

/**
 * Verify JWT token from Authorization header.
 * Returns { valid, user } where user = { user_hash, session_id }.
 *
 * @param {Request} request
 * @param {object} env - Workers env with JWT_PUBLIC_KEY secret
 * @returns {Promise<{ valid: boolean, user: object|null }>}
 */
export async function verifyJwt(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, user: null };
  }

  const token = authHeader.slice(7);

  try {
    // Import RS256 public key
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(env.JWT_PUBLIC_KEY),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Decode JWT parts
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    const signedContent = `${headerB64}.${payloadB64}`;

    const signature = base64UrlDecode(signatureB64);
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signature,
      new TextEncoder().encode(signedContent)
    );

    if (!valid) return { valid: false, user: null };

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, user: null };
    }

    // Cross-verify session (OceanRAG lesson: JWT alone is insufficient)
    if (payload.session_id) {
      const session = await env.DB.prepare(
        'SELECT user_hash FROM sessions WHERE session_id = ? AND expires_at > datetime(?)'
      ).bind(payload.session_id, new Date().toISOString()).first();

      if (!session || session.user_hash !== payload.sub) {
        return { valid: false, user: null };
      }
    }

    return {
      valid: true,
      user: {
        user_hash: payload.sub,
        session_id: payload.session_id
      }
    };
  } catch {
    return { valid: false, user: null };
  }
}

/**
 * Verify service token for internal endpoints.
 * @param {Request} request
 * @param {object} env - Workers env with SERVICE_TOKEN secret
 * @returns {{ valid: boolean, isAdmin: boolean }}
 */
export function verifyServiceToken(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, isAdmin: false };
  }

  const token = authHeader.slice(7);

  if (token === env.SERVICE_TOKEN) {
    return { valid: true, isAdmin: false };
  }

  if (token === env.ADMIN_API_KEY) {
    return { valid: true, isAdmin: true };
  }

  return { valid: false, isAdmin: false };
}

/**
 * Decode base64url string to ArrayBuffer
 */
function base64UrlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
