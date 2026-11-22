import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGigaChatAuthKey,
  buildGigaChatOAuthHeaders,
  GigaChatTokenCache,
  resolveZhipuBases,
  ZHIPU_FREE_MODELS,
} from './direct-ru-llm';

test('normalizeGigaChatAuthKey handles raw base64, Basic prefix, clientId:secret pairs, and rejects placeholders', () => {
  const b64 = Buffer.from('my-client-id:my-client-secret', 'utf8').toString('base64');
  assert.equal(normalizeGigaChatAuthKey(b64), b64);
  assert.equal(normalizeGigaChatAuthKey(`Basic ${b64}`), b64);
  assert.equal(normalizeGigaChatAuthKey('my-client-id:my-client-secret'), b64);
  assert.equal(normalizeGigaChatAuthKey('your_placeholder_key'), '');
  assert.equal(normalizeGigaChatAuthKey('short'), '');
});

test('GigaChatTokenCache reuses token until 60s before expiry and isolates by key fingerprint', () => {
  const cache = new GigaChatTokenCache();
  const keyA = 'MDE5YzA0M2ItMDAwMC03MDAwLWEwMDAtMTExMTExMTExMTEx';
  const keyB = 'MDE5YzA0M2ItMDAwMC03MDAwLWEwMDAtMjIyMjIyMjIyMjIy';
  const now = 1_000_000;

  cache.setToken(keyA, 'tok-a', now + 300_000, 'GIGACHAT_API_PERS');
  assert.deepEqual(cache.getValidToken(keyA, now + 100_000), {
    token: 'tok-a',
    scope: 'GIGACHAT_API_PERS',
  });
  // Different key must miss cache
  assert.equal(cache.getValidToken(keyB, now + 100_000), null);
  // Within 60s of expiry must miss cache
  assert.equal(cache.getValidToken(keyA, now + 245_000), null);
});

test('buildGigaChatOAuthHeaders and resolveZhipuBases produce valid headers and non-Cloudflare endpoints', () => {
  const headers = buildGigaChatOAuthHeaders('BASE64KEY', 'req-uuid-123');
  assert.equal(headers.Authorization, 'Basic BASE64KEY');
  assert.equal(headers.RqUID, 'req-uuid-123');
  assert.equal(headers['Content-Type'], 'application/x-www-form-urlencoded');

  const bases = resolveZhipuBases('https://api.z.ai/api/paas/v4/');
  assert.equal(bases[0], 'https://api.z.ai/api/paas/v4');
  assert.ok(bases.includes('https://open.bigmodel.cn/api/paas/v4'));
  assert.ok(ZHIPU_FREE_MODELS.includes('glm-4-flash'));
});
