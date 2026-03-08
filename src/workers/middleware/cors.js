/**
 * CORS Middleware for Cloudflare Workers
 *
 * Allows requests from PowerReader PWA and development origins.
 * Maintainer: T01 (System Architecture Team)
 */

const ALLOWED_ORIGINS = [
  'https://powerreader.pages.dev',
  'https://master.powerreader.pages.dev',
  'https://powerreader.dev',
  'https://staging.powerreader.dev',
  'http://localhost:8788',  // wrangler dev
  'http://localhost:3000',  // local frontend dev
];

export function corsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleCorsPreFlight(request) {
  const origin = request.headers.get('Origin') || '';
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin)
  });
}
