/**
 * PowerReader - Sponsor Handler (ECPay Integration)
 *
 * Handles sponsorship creation, ECPay callback processing,
 * public stats, and user sponsorship history.
 *
 * Navigation:
 * - Upstream: router.js
 * - Dependencies: utils/ecpay.js, shared/response.js
 * - Maintainer: T01 (System Architecture Team)
 */

import { jsonResponse, successResponse, errorResponse } from '../../../shared/response.js';
import { buildAioCheckOutForm, verifyCallback } from '../utils/ecpay.js';

/**
 * Sponsor type → allocation ratios.
 * Each type splits the donation amount into developer/platform/compute pools.
 */
const ALLOCATION_RATIOS = {
  coffee:  { developer: 1.00, platform: 0.00, compute: 0.00 },
  civic:   { developer: 0.20, platform: 0.80, compute: 0.00 },
  compute: { developer: 0.10, platform: 0.40, compute: 0.50 },
  proxy:   { developer: 0.20, platform: 0.00, compute: 0.80 },
};

const VALID_TYPES = Object.keys(ALLOCATION_RATIOS);
const MIN_AMOUNT = 30; // ECPay minimum

/**
 * Compute allocation amounts from total + sponsor type.
 * Uses Math.round for each sub-pool; adjusts developer to absorb rounding diff.
 *
 * @param {number} amount - Total TWD
 * @param {string} type - Sponsor type key
 * @returns {{ alloc_developer: number, alloc_platform: number, alloc_compute: number }}
 */
function computeAllocation(amount, type) {
  const ratios = ALLOCATION_RATIOS[type];
  const alloc_platform = Math.round(amount * ratios.platform);
  const alloc_compute = Math.round(amount * ratios.compute);
  // Developer absorbs rounding residual
  const alloc_developer = amount - alloc_platform - alloc_compute;
  return { alloc_developer, alloc_platform, alloc_compute };
}

/**
 * Generate a unique MerchantTradeNo.
 * Format: PR + 14-digit timestamp + 4-digit random = 20 chars (ECPay max).
 *
 * @returns {string}
 */
function generateTradeNo() {
  const ts = Date.now().toString().slice(-14);
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `PR${ts}${rand}`;
}

/**
 * Sponsor type → display item name for ECPay receipt.
 */
const ITEM_NAMES = {
  coffee:  'PowerReader Sponsor - Coffee',
  civic:   'PowerReader Sponsor - Civic',
  compute: 'PowerReader Sponsor - Compute',
  proxy:   'PowerReader Sponsor - Proxy Media',
};

/**
 * POST /api/v1/sponsor/create — Create a sponsor order and return ECPay form params.
 *
 * Body: { amount: number, type: 'coffee'|'civic'|'compute'|'proxy' }
 * Auth: jwt (optional — anonymous if no user)
 */
export async function createSponsorOrder(request, env, ctx, { params, user, url }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'validation_error', 'Invalid JSON body');
  }

  const { amount, type } = body;

  // Validate type
  if (!type || !VALID_TYPES.includes(type)) {
    return errorResponse(400, 'validation_error', `Invalid sponsor type. Must be one of: ${VALID_TYPES.join(', ')}`);
  }

  // Validate amount
  const parsedAmount = Number(amount);
  if (!Number.isInteger(parsedAmount) || parsedAmount < MIN_AMOUNT) {
    return errorResponse(400, 'validation_error', `Amount must be an integer >= ${MIN_AMOUNT}`);
  }

  const merchantTradeNo = generateTradeNo();
  const { alloc_developer, alloc_platform, alloc_compute } = computeAllocation(parsedAmount, type);
  const userHash = user ? user.user_hash : null;

  // INSERT pending order
  await env.DB.prepare(
    `INSERT INTO sponsorships (merchant_trade_no, user_hash, amount, sponsor_type, alloc_developer, alloc_platform, alloc_compute, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).bind(merchantTradeNo, userHash, parsedAmount, type, alloc_developer, alloc_platform, alloc_compute).run();

  // Build ECPay form
  const origin = new URL(request.url).origin;
  const returnURL = `${origin}/api/v1/sponsor/callback`;
  const clientBackURL = env.CLIENT_URL ? `${env.CLIENT_URL}/#/power-pool` : `${origin}/#/power-pool`;

  const result = await buildAioCheckOutForm(
    {
      merchantTradeNo,
      amount: parsedAmount,
      itemName: ITEM_NAMES[type],
      tradeDesc: 'PowerReader Sponsorship',
    },
    env,
    returnURL,
    clientBackURL
  );

  return successResponse(result, 201);
}

/**
 * POST /api/v1/sponsor/callback — ECPay server-to-server callback.
 *
 * Auth: none (ECPay calls this directly).
 * MUST return plain text "1|OK" on success (ECPay requirement).
 */
export async function handleEcpayCallback(request, env) {
  // Parse URL-encoded body
  const text = await request.text();
  const entries = new URLSearchParams(text);
  const body = Object.fromEntries(entries);

  const hashKey = env.ECPAY_HASH_KEY || 'pwFHCqoQZGmho4w6';
  const hashIV = env.ECPAY_HASH_IV || 'EkRm7iFT261dpevs';

  // Verify CheckMacValue
  const valid = await verifyCallback(body, hashKey, hashIV);
  if (!valid) {
    return new Response('0|CheckMacValue verification failed', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const merchantTradeNo = body.MerchantTradeNo;
  const rtnCode = body.RtnCode;

  // Look up the pending order
  const order = await env.DB.prepare(
    'SELECT id, status FROM sponsorships WHERE merchant_trade_no = ?'
  ).bind(merchantTradeNo).first();

  if (!order) {
    return new Response('0|Order not found', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Update based on RtnCode
  if (rtnCode === '1') {
    await env.DB.prepare(
      `UPDATE sponsorships
       SET status = 'paid',
           ecpay_trade_no = ?,
           payment_type = ?,
           payment_date = ?,
           paid_at = datetime('now')
       WHERE merchant_trade_no = ?`
    ).bind(
      body.TradeNo || null,
      body.PaymentType || null,
      body.PaymentDate || null,
      merchantTradeNo
    ).run();
  } else {
    await env.DB.prepare(
      `UPDATE sponsorships SET status = 'failed' WHERE merchant_trade_no = ?`
    ).bind(merchantTradeNo).run();
  }

  // ECPay requires exactly "1|OK"
  return new Response('1|OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/**
 * GET /api/v1/sponsor/stats — Public sponsorship transparency stats.
 *
 * Auth: none (publicly visible for transparency).
 */
export async function getSponsorStats(request, env) {
  // Aggregate totals
  const totals = await env.DB.prepare(
    `SELECT
       COUNT(*) as total_count,
       COALESCE(SUM(amount), 0) as total_amount,
       COALESCE(SUM(alloc_developer), 0) as pool_developer,
       COALESCE(SUM(alloc_platform), 0) as pool_platform,
       COALESCE(SUM(alloc_compute), 0) as pool_compute
     FROM sponsorships
     WHERE status = 'paid'`
  ).first();

  // Per-type breakdown
  const byTypeRows = await env.DB.prepare(
    `SELECT sponsor_type, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
     FROM sponsorships
     WHERE status = 'paid'
     GROUP BY sponsor_type`
  ).all();

  const by_type = {};
  for (const t of VALID_TYPES) {
    by_type[t] = { count: 0, amount: 0 };
  }
  for (const row of byTypeRows.results) {
    by_type[row.sponsor_type] = { count: row.count, amount: row.amount };
  }

  return successResponse({
    total_amount: totals.total_amount,
    total_count: totals.total_count,
    by_type,
    pools: {
      developer: totals.pool_developer,
      platform: totals.pool_platform,
      compute: totals.pool_compute,
    },
  });
}

/**
 * GET /api/v1/sponsor/me — User's own sponsorship history.
 *
 * Auth: jwt (required).
 */
export async function getMySponsorships(request, env, ctx, { user }) {
  const rows = await env.DB.prepare(
    `SELECT merchant_trade_no, amount, sponsor_type, status, created_at, paid_at
     FROM sponsorships
     WHERE user_hash = ?
     ORDER BY created_at DESC
     LIMIT 50`
  ).bind(user.user_hash).all();

  return successResponse({ sponsorships: rows.results });
}
