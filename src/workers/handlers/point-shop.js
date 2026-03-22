/**
 * PowerReader - Point Shop Handler
 *
 * Handles shop item listing, purchases, inventory, and item consumption.
 *
 * Navigation:
 * - Upstream: router.js
 * - Dependencies: shared/response.js
 * - Maintainer: T01 (System Architecture Team)
 */

import { successResponse, errorResponse } from '../../../shared/response.js';
import { nowISO } from '../../../shared/utils.js';

/**
 * GET /api/v1/point-shop/items — List all enabled shop items.
 *
 * Auth: none (public catalog).
 */
export async function getShopItems(request, env) {
  const rows = await env.DB.prepare(
    `SELECT id, name_key, description_key, cost_cents, category, icon,
            is_consumable, duration_hours, max_per_user, display_order
     FROM point_shop_items
     WHERE enabled = 1
     ORDER BY display_order ASC`
  ).all();

  return successResponse({ items: rows.results });
}

/**
 * POST /api/v1/point-shop/purchase — Purchase a shop item.
 *
 * Body: { item_id: string }
 * Auth: jwt (required).
 *
 * Validates: item exists, user has enough points, max_per_user not exceeded.
 * Deducts points atomically.
 */
export async function purchaseItem(request, env, ctx, { user }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'validation_error', 'Invalid JSON body');
  }

  const { item_id } = body;
  if (!item_id || typeof item_id !== 'string') {
    return errorResponse(400, 'validation_error', 'Missing item_id');
  }

  // Fetch item
  const item = await env.DB.prepare(
    'SELECT * FROM point_shop_items WHERE id = ? AND enabled = 1'
  ).bind(item_id).first();

  if (!item) {
    return errorResponse(404, 'not_found', 'Item not found or disabled');
  }

  // Fetch user points
  const userRow = await env.DB.prepare(
    'SELECT total_points_cents FROM users WHERE user_hash = ?'
  ).bind(user.user_hash).first();

  if (!userRow) {
    return errorResponse(404, 'not_found', 'User not found');
  }

  // Check sufficient points
  if (userRow.total_points_cents < item.cost_cents) {
    return errorResponse(400, 'insufficient_points', 'Not enough points');
  }

  // Check max_per_user limit (only for non-null max_per_user)
  if (item.max_per_user !== null) {
    const owned = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_purchases WHERE user_hash = ? AND item_id = ?'
    ).bind(user.user_hash, item_id).first();

    if (owned.count >= item.max_per_user) {
      return errorResponse(409, 'already_owned', 'You already own this item');
    }
  }

  // Calculate expiration for time-limited items
  let expiresAt = null;
  if (item.duration_hours) {
    const expires = new Date(Date.now() + item.duration_hours * 60 * 60 * 1000);
    expiresAt = expires.toISOString();
  }

  // Atomic: deduct points + insert purchase
  const newTotal = userRow.total_points_cents - item.cost_cents;

  const stmts = [
    env.DB.prepare(
      'UPDATE users SET total_points_cents = ?, updated_at = ? WHERE user_hash = ?'
    ).bind(newTotal, nowISO(), user.user_hash),
    env.DB.prepare(
      `INSERT INTO user_purchases (user_hash, item_id, cost_cents, expires_at)
       VALUES (?, ?, ?, ?)`
    ).bind(user.user_hash, item_id, item.cost_cents, expiresAt),
  ];

  await env.DB.batch(stmts);

  return successResponse({
    item_id,
    cost_cents: item.cost_cents,
    remaining_points_cents: newTotal,
    display_remaining: (newTotal / 100).toFixed(2),
    expires_at: expiresAt,
  }, 201);
}

/**
 * GET /api/v1/point-shop/inventory — User's purchased items.
 *
 * Auth: jwt (required).
 * Returns active (non-expired, non-consumed) purchases + item details.
 */
export async function getInventory(request, env, ctx, { user }) {
  const rows = await env.DB.prepare(
    `SELECT p.id as purchase_id, p.item_id, p.cost_cents, p.purchased_at,
            p.expires_at, p.is_consumed, p.consumed_at,
            i.name_key, i.description_key, i.category, i.icon, i.is_consumable
     FROM user_purchases p
     JOIN point_shop_items i ON p.item_id = i.id
     WHERE p.user_hash = ?
     ORDER BY p.purchased_at DESC
     LIMIT 100`
  ).bind(user.user_hash).all();

  // Tag expired items
  const now = new Date();
  const items = rows.results.map(row => ({
    ...row,
    is_active: !row.is_consumed && (!row.expires_at || new Date(row.expires_at) > now),
  }));

  return successResponse({ inventory: items });
}

/**
 * POST /api/v1/point-shop/use — Consume a consumable item.
 *
 * Body: { purchase_id: number }
 * Auth: jwt (required).
 *
 * Marks item as consumed. Applies effect (e.g., quota boost, cooldown skip).
 */
export async function useItem(request, env, ctx, { user }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'validation_error', 'Invalid JSON body');
  }

  const { purchase_id } = body;
  if (!purchase_id) {
    return errorResponse(400, 'validation_error', 'Missing purchase_id');
  }

  // Fetch purchase with item details
  const purchase = await env.DB.prepare(
    `SELECT p.*, i.is_consumable, i.id as item_type_id, i.duration_hours
     FROM user_purchases p
     JOIN point_shop_items i ON p.item_id = i.id
     WHERE p.id = ? AND p.user_hash = ?`
  ).bind(purchase_id, user.user_hash).first();

  if (!purchase) {
    return errorResponse(404, 'not_found', 'Purchase not found');
  }

  if (!purchase.is_consumable) {
    return errorResponse(400, 'validation_error', 'This item is not consumable');
  }

  if (purchase.is_consumed) {
    return errorResponse(409, 'already_consumed', 'Item already used');
  }

  // Check expiration
  if (purchase.expires_at && new Date(purchase.expires_at) <= new Date()) {
    return errorResponse(410, 'expired', 'Item has expired');
  }

  const stmts = [
    env.DB.prepare(
      'UPDATE user_purchases SET is_consumed = 1, consumed_at = ? WHERE id = ?'
    ).bind(nowISO(), purchase_id),
  ];

  // Apply item-specific effects
  const itemId = purchase.item_type_id;

  if (itemId === 'quota_boost_10') {
    // Boost daily analysis limit by 10 (reset applies at midnight anyway)
    // We reduce daily_analysis_count by 10, clamped to 0
    stmts.push(
      env.DB.prepare(
        `UPDATE users SET daily_analysis_count = MAX(0, daily_analysis_count - 10),
                updated_at = ? WHERE user_hash = ?`
      ).bind(nowISO(), user.user_hash)
    );
  } else if (itemId === 'skip_cooldown') {
    // Clear cooldown
    stmts.push(
      env.DB.prepare(
        'UPDATE users SET cooldown_until = NULL, consecutive_failures = 0, updated_at = ? WHERE user_hash = ?'
      ).bind(nowISO(), user.user_hash)
    );
  }

  await env.DB.batch(stmts);

  return successResponse({
    purchase_id,
    item_id: itemId,
    effect_applied: true,
  });
}
