import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeminiQuotaGuard,
  parseGeminiErrorInfo,
  parseGeminiRetryDelayMs,
} from './gemini-quota-guard.ts';

test('parseGeminiErrorInfo parses 429 RESOURCE_EXHAUSTED and retryDelay cleanly', () => {
  const rawErr = new Error(
    '{"error":{"code":429,"message":"You exceeded your current quota... Please retry in 16h40.314s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"57640s"}]}}'
  );
  const info = parseGeminiErrorInfo(rawErr);
  assert.equal(info.isQuotaOrRateLimit, true);
  assert.equal(info.isInvalidKeyOrForbidden, false);
  assert.equal(info.retryDelayMs, 57640 * 1000);
  assert.ok(info.summary.includes('cooldown'));

  assert.equal(parseGeminiRetryDelayMs('Please retry in 15m30s'), (15 * 60 + 30) * 1000);
});

test('GeminiQuotaGuard puts exhausted model on cooldown, falls back to lite, and throttles background runs', () => {
  const guard = new GeminiQuotaGuard(90 * 60_000);
  const t0 = 1_700_000_000_000;

  assert.deepEqual(guard.getAvailableModels({ isBackground: true, nowTs: t0 }), [
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
  ]);

  guard.recordAttempt({ isBackground: true, nowTs: t0 });
  // Background calls within 90m throttle window are skipped to preserve Free Tier 20 req/day quota
  assert.deepEqual(guard.getAvailableModels({ isBackground: true, nowTs: t0 + 10 * 60_000 }), []);
  // Manual/chat calls are still allowed if not rate-limited
  assert.deepEqual(guard.getAvailableModels({ isBackground: false, nowTs: t0 + 10 * 60_000 }), [
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
  ]);

  // Simulate 429 on gemini-4-hydrogen -> only gemini-3.1-flash-lite remains
  guard.recordError(
    'gemini-4-hydrogen',
    new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","retryDelay":"3600s"}}'),
    t0 + 10 * 60_000
  );
  assert.deepEqual(guard.getAvailableModels({ isBackground: false, nowTs: t0 + 11 * 60_000 }), [
    'gemini-3.1-flash-lite',
  ]);

  // After retryDelay expires, gemini-4-hydrogen becomes available again
  assert.deepEqual(guard.getAvailableModels({ isBackground: false, nowTs: t0 + 75 * 60_000 }), [
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
  ]);
});
