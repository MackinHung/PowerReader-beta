/**
 * PowerReader - Shared Utility Functions
 *
 * All functions must be:
 * - Pure (no side effects)
 * - Cloudflare Workers compatible (Web Crypto API)
 * - Immutable (never mutate inputs)
 *
 * Navigation:
 * - Upstream: shared/config.js
 * - Downstream: All teams (T01-T07)
 * - Maintainer: T01 (System Architecture Team)
 * - Last Updated: 2026-03-07
 */

export function nowISO() {
  const now = new Date();
  const offset = 8 * 60;
  const local = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}+08:00`;
}

export function formatDate(isoString) {
  return isoString.slice(0, 10);
}

export function isValidISO8601(str) {
  if (typeof str !== 'string') return false;
  if (isNaN(Date.parse(str))) return false;
  return /[+-]\d{2}:\d{2}$|Z$/.test(str);
}

export async function hashSHA256(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateArticleHash(url) { return hashSHA256(url); }
export async function generateContentHash(markdown) { return hashSHA256(markdown); }
export async function generateUserHash(googleUid) { return hashSHA256(`powerreader:user:${googleUid}`); }

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const m = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','/':'&#x2F;'};
  return str.replace(/[&<>"'/]/g, c => m[c]);
}

export function batchArray(array, batchSize) {
  if (!Array.isArray(array) || batchSize < 1) return [];
  const result = [];
  for (let i = 0; i < array.length; i += batchSize) result.push(array.slice(i, i + batchSize));
  return result;
}

export function isNonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }

export function isValidURL(str) {
  try { const u = new URL(str); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

export function isIntegerInRange(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }

export default { nowISO, formatDate, isValidISO8601, hashSHA256, generateArticleHash, generateContentHash, generateUserHash, escapeHtml, batchArray, isNonEmptyString, isValidURL, isIntegerInRange };
