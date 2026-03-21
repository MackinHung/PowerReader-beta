/**
 * Tests for sponsor handler + ecpay utilities
 *
 * Covers:
 * - ECPay CheckMacValue generation & verification
 * - Allocation ratio computation
 * - createSponsorOrder handler
 * - handleEcpayCallback handler
 * - getSponsorStats handler
 * - getMySponsorships handler
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { generateCheckMacValue, verifyCallback, dotNetUrlEncode, buildAioCheckOutForm, constantTimeEqual } from '../../src/workers/utils/ecpay.js';
import { createSponsorOrder, handleEcpayCallback, getSponsorStats, getMySponsorships } from '../../src/workers/handlers/sponsor.js';

// =============================================
// ECPay Utility Tests
// =============================================

describe('dotNetUrlEncode', () => {
  test('encodes special characters per .NET UrlEncode', () => {
    expect(dotNetUrlEncode('hello world')).toBe('hello+world');
    expect(dotNetUrlEncode('test!')).toBe('test%21');
    expect(dotNetUrlEncode("it's")).toBe('it%27s');
    expect(dotNetUrlEncode('(value)')).toBe('%28value%29');
    expect(dotNetUrlEncode('a*b')).toBe('a%2ab');
  });

  test('result is lowercase', () => {
    const result = dotNetUrlEncode('ABC=123');
    expect(result).toBe(result.toLowerCase());
  });
});

describe('constantTimeEqual', () => {
  test('returns true for identical strings', () => {
    expect(constantTimeEqual('ABC123', 'ABC123')).toBe(true);
  });

  test('returns false for different strings', () => {
    expect(constantTimeEqual('ABC123', 'ABC124')).toBe(false);
  });

  test('returns false for different lengths', () => {
    expect(constantTimeEqual('short', 'longer_string')).toBe(false);
  });

  test('returns true for empty strings', () => {
    expect(constantTimeEqual('', '')).toBe(true);
  });

  test('returns false for empty vs non-empty', () => {
    expect(constantTimeEqual('', 'x')).toBe(false);
  });
});

describe('generateCheckMacValue', () => {
  // ECPay test credentials
  const hashKey = 'pwFHCqoQZGmho4w6';
  const hashIV = 'EkRm7iFT261dpevs';

  test('produces uppercase hex SHA256 string', async () => {
    const params = {
      MerchantID: '3002607',
      MerchantTradeNo: 'PR12345678901234',
      MerchantTradeDate: '2026/03/21 12:00:00',
      PaymentType: 'aio',
      TotalAmount: '100',
      TradeDesc: 'Test',
      ItemName: 'TestItem',
      ReturnURL: 'https://example.com/callback',
      ChoosePayment: 'ALL',
      EncryptType: '1',
    };

    const mac = await generateCheckMacValue(params, hashKey, hashIV);
    expect(mac).toMatch(/^[A-F0-9]{64}$/); // SHA256 = 64 hex chars, uppercase
  });

  test('deterministic — same params produce same MAC', async () => {
    const params = { A: '1', B: '2' };
    const mac1 = await generateCheckMacValue(params, hashKey, hashIV);
    const mac2 = await generateCheckMacValue(params, hashKey, hashIV);
    expect(mac1).toBe(mac2);
  });

  test('different params produce different MAC', async () => {
    const mac1 = await generateCheckMacValue({ A: '1' }, hashKey, hashIV);
    const mac2 = await generateCheckMacValue({ A: '2' }, hashKey, hashIV);
    expect(mac1).not.toBe(mac2);
  });

  test('sorts keys case-insensitively', async () => {
    const params1 = { aKey: '1', BKey: '2' };
    const params2 = { BKey: '2', aKey: '1' };
    const mac1 = await generateCheckMacValue(params1, hashKey, hashIV);
    const mac2 = await generateCheckMacValue(params2, hashKey, hashIV);
    expect(mac1).toBe(mac2);
  });
});

describe('verifyCallback', () => {
  const hashKey = 'pwFHCqoQZGmho4w6';
  const hashIV = 'EkRm7iFT261dpevs';

  test('returns true for valid CheckMacValue', async () => {
    const params = { MerchantID: '3002607', RtnCode: '1' };
    const mac = await generateCheckMacValue(params, hashKey, hashIV);
    const body = { ...params, CheckMacValue: mac };

    expect(await verifyCallback(body, hashKey, hashIV)).toBe(true);
  });

  test('returns false for invalid CheckMacValue', async () => {
    const body = { MerchantID: '3002607', RtnCode: '1', CheckMacValue: 'INVALID' };
    expect(await verifyCallback(body, hashKey, hashIV)).toBe(false);
  });

  test('returns false when CheckMacValue missing', async () => {
    const body = { MerchantID: '3002607' };
    expect(await verifyCallback(body, hashKey, hashIV)).toBe(false);
  });
});

describe('buildAioCheckOutForm', () => {
  test('returns form_params and action_url for stage env', async () => {
    const env = { ECPAY_MERCHANT_ID: '3002607', ECPAY_HASH_KEY: 'pwFHCqoQZGmho4w6', ECPAY_HASH_IV: 'EkRm7iFT261dpevs' };
    const order = { merchantTradeNo: 'PR00000000000001', amount: 100, itemName: 'Test', tradeDesc: 'Test Desc' };

    const result = await buildAioCheckOutForm(order, env, 'https://cb.test/callback', 'https://app.test/pool');

    expect(result.action_url).toContain('payment-stage.ecpay.com.tw');
    expect(result.form_params.MerchantID).toBe('3002607');
    expect(result.form_params.TotalAmount).toBe('100');
    expect(result.form_params.CheckMacValue).toMatch(/^[A-F0-9]{64}$/);
    expect(result.form_params.EncryptType).toBe('1');
    expect(result.form_params.PaymentType).toBe('aio');
    expect(result.form_params.ReturnURL).toBe('https://cb.test/callback');
    expect(result.form_params.ClientBackURL).toBe('https://app.test/pool');
  });

  test('uses production URL for non-test MerchantID', async () => {
    const env = { ECPAY_MERCHANT_ID: '9999999', ECPAY_HASH_KEY: 'testkey', ECPAY_HASH_IV: 'testiv' };
    const order = { merchantTradeNo: 'PR00000000000002', amount: 60, itemName: 'Test', tradeDesc: 'Test' };

    const result = await buildAioCheckOutForm(order, env, 'https://cb/cb', 'https://app');
    expect(result.action_url).toContain('payment.ecpay.com.tw');
    expect(result.action_url).not.toContain('stage');
  });
});

// =============================================
// Handler Tests
// =============================================

/**
 * Create a mock env with D1 database operations.
 */
function createMockEnv(dbRows = []) {
  const db = {
    _rows: dbRows,
    _lastInsert: null,
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    first: vi.fn().mockImplementation(async () => db._rows[0] || null),
    all: vi.fn().mockImplementation(async () => ({ results: db._rows })),
  };

  // Chain: prepare() → bind() → run/first/all
  db.prepare.mockReturnValue(db);
  db.bind.mockReturnValue(db);

  return {
    DB: db,
    ECPAY_MERCHANT_ID: '3002607',
    ECPAY_HASH_KEY: 'pwFHCqoQZGmho4w6',
    ECPAY_HASH_IV: 'EkRm7iFT261dpevs',
    CLIENT_URL: 'https://powerreader.pages.dev',
  };
}

function createMockRequest(method, url, body) {
  return {
    method,
    url: url || 'https://api.test/api/v1/sponsor/create',
    json: vi.fn().mockResolvedValue(body || {}),
    text: vi.fn().mockResolvedValue(''),
    headers: { get: vi.fn().mockReturnValue(null) },
  };
}

describe('createSponsorOrder', () => {
  test('returns 400 for invalid type', async () => {
    const req = createMockRequest('POST', 'https://api.test/api/v1/sponsor/create', { amount: 100, type: 'invalid' });
    const env = createMockEnv();
    const res = await createSponsorOrder(req, env, {}, { params: {}, user: null, url: new URL(req.url) });
    const json = JSON.parse(await res.text());

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.type).toBe('validation_error');
  });

  test('returns 400 for amount < 30', async () => {
    const req = createMockRequest('POST', 'https://api.test/api/v1/sponsor/create', { amount: 10, type: 'coffee' });
    const env = createMockEnv();
    const res = await createSponsorOrder(req, env, {}, { params: {}, user: null, url: new URL(req.url) });
    const json = JSON.parse(await res.text());

    expect(res.status).toBe(400);
    expect(json.error.message).toContain('30');
  });

  test('returns 400 for non-integer amount', async () => {
    const req = createMockRequest('POST', 'https://api.test/api/v1/sponsor/create', { amount: 50.5, type: 'coffee' });
    const env = createMockEnv();
    const res = await createSponsorOrder(req, env, {}, { params: {}, user: null, url: new URL(req.url) });
    const json = JSON.parse(await res.text());

    expect(res.status).toBe(400);
  });

  test('returns 201 with form_params for valid order (coffee)', async () => {
    const req = createMockRequest('POST', 'https://api.test/api/v1/sponsor/create', { amount: 100, type: 'coffee' });
    const env = createMockEnv();
    const res = await createSponsorOrder(req, env, {}, { params: {}, user: null, url: new URL(req.url) });
    const json = JSON.parse(await res.text());

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.form_params).toBeDefined();
    expect(json.data.action_url).toContain('ecpay');
    expect(json.data.form_params.CheckMacValue).toMatch(/^[A-F0-9]{64}$/);
  });

  test('inserts pending order into DB', async () => {
    const req = createMockRequest('POST', 'https://api.test/api/v1/sponsor/create', { amount: 150, type: 'civic' });
    const env = createMockEnv();
    await createSponsorOrder(req, env, {}, { params: {}, user: { user_hash: 'user123' }, url: new URL(req.url) });

    // Verify DB.prepare was called with INSERT
    const prepareCall = env.DB.prepare.mock.calls.find(c => c[0].includes('INSERT INTO sponsorships'));
    expect(prepareCall).toBeDefined();
  });

  test('computes correct allocation for civic type', async () => {
    const req = createMockRequest('POST', 'https://api.test/api/v1/sponsor/create', { amount: 100, type: 'civic' });
    const env = createMockEnv();
    await createSponsorOrder(req, env, {}, { params: {}, user: null, url: new URL(req.url) });

    // civic: 20% developer, 80% platform, 0% compute
    const bindCall = env.DB.bind.mock.calls[0];
    // bind args: merchantTradeNo, userHash, amount, type, alloc_developer, alloc_platform, alloc_compute
    expect(bindCall[2]).toBe(100); // amount
    expect(bindCall[4]).toBe(20);  // developer (20%)
    expect(bindCall[5]).toBe(80);  // platform (80%)
    expect(bindCall[6]).toBe(0);   // compute (0%)
  });

  test('computes correct allocation for compute type', async () => {
    const req = createMockRequest('POST', 'https://api.test/api/v1/sponsor/create', { amount: 300, type: 'compute' });
    const env = createMockEnv();
    await createSponsorOrder(req, env, {}, { params: {}, user: null, url: new URL(req.url) });

    const bindCall = env.DB.bind.mock.calls[0];
    // compute: 10% dev, 40% platform, 50% compute
    expect(bindCall[4]).toBe(30);  // developer (10% = 30)
    expect(bindCall[5]).toBe(120); // platform (40% = 120)
    expect(bindCall[6]).toBe(150); // compute (50% = 150)
  });

  test('computes correct allocation for proxy type', async () => {
    const req = createMockRequest('POST', 'https://api.test/api/v1/sponsor/create', { amount: 100, type: 'proxy' });
    const env = createMockEnv();
    await createSponsorOrder(req, env, {}, { params: {}, user: null, url: new URL(req.url) });

    const bindCall = env.DB.bind.mock.calls[0];
    // proxy: 20% dev, 0% platform, 80% compute
    expect(bindCall[4]).toBe(20);  // developer
    expect(bindCall[5]).toBe(0);   // platform
    expect(bindCall[6]).toBe(80);  // compute
  });
});

describe('handleEcpayCallback', () => {
  test('returns "1|OK" for valid paid callback', async () => {
    const env = createMockEnv([{ id: 1, status: 'pending' }]);
    const params = {
      MerchantTradeNo: 'PR12345678901234',
      RtnCode: '1',
      TradeNo: 'ECPay123',
      PaymentType: 'Credit_CreditCard',
      PaymentDate: '2026/03/21 12:00:00',
    };
    const mac = await generateCheckMacValue(params, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV);
    params.CheckMacValue = mac;

    const bodyStr = new URLSearchParams(params).toString();
    const req = { text: vi.fn().mockResolvedValue(bodyStr) };

    const res = await handleEcpayCallback(req, env);
    const text = await res.text();

    expect(text).toBe('1|OK');
    expect(res.status).toBe(200);
  });

  test('updates order to paid status', async () => {
    const env = createMockEnv([{ id: 1, status: 'pending' }]);
    const params = {
      MerchantTradeNo: 'PR12345678901234',
      RtnCode: '1',
      TradeNo: 'ECPay456',
      PaymentType: 'Credit_CreditCard',
      PaymentDate: '2026/03/21 12:30:00',
    };
    const mac = await generateCheckMacValue(params, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV);
    params.CheckMacValue = mac;

    const bodyStr = new URLSearchParams(params).toString();
    const req = { text: vi.fn().mockResolvedValue(bodyStr) };

    await handleEcpayCallback(req, env);

    const updateCall = env.DB.prepare.mock.calls.find(c => c[0].includes("status = 'paid'"));
    expect(updateCall).toBeDefined();
  });

  test('updates order to failed for non-1 RtnCode', async () => {
    const env = createMockEnv([{ id: 1, status: 'pending' }]);
    const params = {
      MerchantTradeNo: 'PR12345678901234',
      RtnCode: '10100058',
    };
    const mac = await generateCheckMacValue(params, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV);
    params.CheckMacValue = mac;

    const bodyStr = new URLSearchParams(params).toString();
    const req = { text: vi.fn().mockResolvedValue(bodyStr) };

    await handleEcpayCallback(req, env);

    const updateCall = env.DB.prepare.mock.calls.find(c => c[0].includes("status = 'failed'"));
    expect(updateCall).toBeDefined();
  });

  test('rejects invalid CheckMacValue', async () => {
    const env = createMockEnv();
    const bodyStr = new URLSearchParams({
      MerchantTradeNo: 'PR12345678901234',
      RtnCode: '1',
      CheckMacValue: 'INVALID_MAC_VALUE',
    }).toString();
    const req = { text: vi.fn().mockResolvedValue(bodyStr) };

    const res = await handleEcpayCallback(req, env);
    const text = await res.text();

    expect(text).toContain('verification failed');
  });

  test('idempotent — already paid order returns 1|OK without re-updating', async () => {
    const env = createMockEnv([{ id: 1, status: 'paid' }]); // already paid
    const params = {
      MerchantTradeNo: 'PR12345678901234',
      RtnCode: '1',
      TradeNo: 'ECPay789',
      PaymentType: 'Credit_CreditCard',
      PaymentDate: '2026/03/21 13:00:00',
    };
    const mac = await generateCheckMacValue(params, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV);
    params.CheckMacValue = mac;

    const bodyStr = new URLSearchParams(params).toString();
    const req = { text: vi.fn().mockResolvedValue(bodyStr) };

    const res = await handleEcpayCallback(req, env);
    const text = await res.text();

    expect(text).toBe('1|OK');
    // Should NOT have called UPDATE
    const updateCall = env.DB.prepare.mock.calls.find(c =>
      c[0].includes('UPDATE sponsorships')
    );
    expect(updateCall).toBeUndefined();
  });

  test('idempotent — already failed order returns 1|OK without re-updating', async () => {
    const env = createMockEnv([{ id: 1, status: 'failed' }]);
    const params = {
      MerchantTradeNo: 'PR12345678901234',
      RtnCode: '1',
    };
    const mac = await generateCheckMacValue(params, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV);
    params.CheckMacValue = mac;

    const bodyStr = new URLSearchParams(params).toString();
    const req = { text: vi.fn().mockResolvedValue(bodyStr) };

    const res = await handleEcpayCallback(req, env);
    expect(await res.text()).toBe('1|OK');
  });

  test('returns error for unknown order', async () => {
    const env = createMockEnv([]); // empty DB
    const params = { MerchantTradeNo: 'PR99999999999999', RtnCode: '1' };
    const mac = await generateCheckMacValue(params, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV);
    params.CheckMacValue = mac;

    const bodyStr = new URLSearchParams(params).toString();
    const req = { text: vi.fn().mockResolvedValue(bodyStr) };

    const res = await handleEcpayCallback(req, env);
    const text = await res.text();

    expect(text).toContain('Order not found');
  });
});

describe('getSponsorStats', () => {
  test('returns aggregated stats', async () => {
    const env = createMockEnv();
    // Mock the first() call for totals
    let callCount = 0;
    env.DB.first = vi.fn().mockImplementation(async () => ({
      total_count: 5,
      total_amount: 600,
      pool_developer: 200,
      pool_platform: 250,
      pool_compute: 150,
    }));
    env.DB.all = vi.fn().mockResolvedValue({
      results: [
        { sponsor_type: 'coffee', count: 2, amount: 200 },
        { sponsor_type: 'civic', count: 3, amount: 400 },
      ]
    });

    const res = await getSponsorStats({}, env);
    const json = JSON.parse(await res.text());

    expect(json.success).toBe(true);
    expect(json.data.total_amount).toBe(600);
    expect(json.data.total_count).toBe(5);
    expect(json.data.pools.developer).toBe(200);
    expect(json.data.pools.platform).toBe(250);
    expect(json.data.pools.compute).toBe(150);
    expect(json.data.by_type.coffee.count).toBe(2);
    expect(json.data.by_type.civic.count).toBe(3);
    expect(json.data.by_type.compute.count).toBe(0); // Not in results → default 0
    expect(json.data.by_type.proxy.count).toBe(0);
  });
});

describe('getMySponsorships', () => {
  test('returns user sponsorship history', async () => {
    const rows = [
      { merchant_trade_no: 'PR001', amount: 100, sponsor_type: 'coffee', status: 'paid', created_at: '2026-03-21', paid_at: '2026-03-21' },
      { merchant_trade_no: 'PR002', amount: 60, sponsor_type: 'civic', status: 'pending', created_at: '2026-03-21', paid_at: null },
    ];
    const env = createMockEnv();
    env.DB.all = vi.fn().mockResolvedValue({ results: rows });

    const res = await getMySponsorships({}, env, {}, { user: { user_hash: 'hash123' } });
    const json = JSON.parse(await res.text());

    expect(json.success).toBe(true);
    expect(json.data.sponsorships).toHaveLength(2);
    expect(json.data.sponsorships[0].amount).toBe(100);
  });
});
