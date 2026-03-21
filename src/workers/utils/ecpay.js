/**
 * PowerReader - ECPay Payment Integration Utilities
 *
 * Generates and verifies ECPay AioCheckOut parameters.
 * Uses Web Crypto API (SHA256) for CheckMacValue signing.
 *
 * ECPay Docs: https://developers.ecpay.com.tw/?p=2509
 *
 * Navigation:
 * - Upstream: handlers/sponsor.js
 * - Maintainer: T01 (System Architecture Team)
 */

/**
 * ECPay .NET-compatible URL encoding.
 * ECPay requires specific characters to be encoded differently from standard encodeURIComponent.
 *
 * @param {string} str - String to encode
 * @returns {string} .NET UrlEncode compatible string (lowercase hex)
 */
export function dotNetUrlEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%20/g, '+')
    .toLowerCase();
}

/**
 * Generate ECPay CheckMacValue (SHA256, EncryptType=1).
 *
 * Algorithm:
 * 1. Sort params alphabetically by key
 * 2. Concatenate as "HashKey=...&key1=val1&key2=val2&...&HashIV=..."
 * 3. URL-encode with .NET UrlEncode rules
 * 4. Convert to lowercase
 * 5. SHA256 hash
 * 6. Convert to uppercase
 *
 * @param {Record<string, string>} params - ECPay form parameters (excluding CheckMacValue)
 * @param {string} hashKey - ECPay HashKey
 * @param {string} hashIV - ECPay HashIV
 * @returns {Promise<string>} CheckMacValue (uppercase hex SHA256)
 */
export async function generateCheckMacValue(params, hashKey, hashIV) {
  // 1. Sort keys alphabetically (case-insensitive per ECPay spec)
  const sortedKeys = Object.keys(params).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  // 2. Build raw string
  const pairs = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  const raw = `HashKey=${hashKey}&${pairs}&HashIV=${hashIV}`;

  // 3. URL-encode (.NET compatible) + lowercase
  const encoded = dotNetUrlEncode(raw);

  // 4. SHA256 hash → uppercase hex
  const msgBuffer = new TextEncoder().encode(encoded);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex.toUpperCase();
}

/**
 * Build ECPay AioCheckOut form parameters.
 *
 * @param {object} order - Order details
 * @param {string} order.merchantTradeNo - Unique order number (max 20 chars)
 * @param {number} order.amount - Total amount in TWD (integer)
 * @param {string} order.itemName - Item description
 * @param {string} order.tradeDesc - Trade description
 * @param {object} env - Worker env bindings
 * @param {string} env.ECPAY_MERCHANT_ID - ECPay MerchantID
 * @param {string} env.ECPAY_HASH_KEY - ECPay HashKey
 * @param {string} env.ECPAY_HASH_IV - ECPay HashIV
 * @param {string} returnURL - Server callback URL
 * @param {string} clientBackURL - Client redirect URL after payment
 * @returns {Promise<{ form_params: Record<string, string>, action_url: string }>}
 */
export async function buildAioCheckOutForm(order, env, returnURL, clientBackURL) {
  const merchantID = env.ECPAY_MERCHANT_ID || '3002607';
  const hashKey = env.ECPAY_HASH_KEY || 'pwFHCqoQZGmho4w6';
  const hashIV = env.ECPAY_HASH_IV || 'EkRm7iFT261dpevs';

  // Determine stage vs production
  const isStage = merchantID === '3002607';
  const actionUrl = isStage
    ? 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'
    : 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';

  // Format date: yyyy/MM/dd HH:mm:ss
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const merchantTradeDate = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const params = {
    MerchantID: merchantID,
    MerchantTradeNo: order.merchantTradeNo,
    MerchantTradeDate: merchantTradeDate,
    PaymentType: 'aio',
    TotalAmount: String(order.amount),
    TradeDesc: order.tradeDesc,
    ItemName: order.itemName,
    ReturnURL: returnURL,
    ClientBackURL: clientBackURL,
    ChoosePayment: 'ALL',
    EncryptType: '1',
  };

  const checkMacValue = await generateCheckMacValue(params, hashKey, hashIV);

  return {
    form_params: { ...params, CheckMacValue: checkMacValue },
    action_url: actionUrl,
  };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Both strings are XOR-compared byte-by-byte; the result leaks no
 * positional information about where differences occur.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function constantTimeEqual(a, b) {
  const len = Math.max(a.length, b.length);
  let result = a.length ^ b.length; // non-zero if different lengths
  for (let i = 0; i < len; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return result === 0;
}

/**
 * Verify ECPay callback CheckMacValue.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param {Record<string, string>} body - Parsed callback body (URL-decoded key-value pairs)
 * @param {string} hashKey - ECPay HashKey
 * @param {string} hashIV - ECPay HashIV
 * @returns {Promise<boolean>} True if CheckMacValue matches
 */
export async function verifyCallback(body, hashKey, hashIV) {
  const receivedMac = body.CheckMacValue;
  if (!receivedMac) return false;

  // Remove CheckMacValue from params before computing
  const params = { ...body };
  delete params.CheckMacValue;

  const computed = await generateCheckMacValue(params, hashKey, hashIV);
  return constantTimeEqual(computed, receivedMac);
}
