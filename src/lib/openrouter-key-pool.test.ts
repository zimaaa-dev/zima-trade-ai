import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OpenRouterKeyPool,
  OPENROUTER_FREE_MODELS,
  parseOpenRouterKeys,
  maskOpenRouterKey,
  extractOpenRouterReplyText,
} from './openrouter-key-pool';

test('parseOpenRouterKeys splits comma/newline lists, strips quotes, deduplicates, and rejects placeholders', () => {
  const keys = parseOpenRouterKeys(`
    "sk-or-v1-aaaa1111bbbb2222cccc",
    sk-or-v1-dddd3333eeee4444ffff;
    sk-or-v1-aaaa1111bbbb2222cccc
    your_placeholder_key_here
    short
  `);
  assert.deepEqual(keys, [
    'sk-or-v1-aaaa1111bbbb2222cccc',
    'sk-or-v1-dddd3333eeee4444ffff',
  ]);
  assert.equal(maskOpenRouterKey(keys[0]), '****cccc');
});

test('OpenRouterKeyPool round-robins across 2 accounts and doubles daily free quota estimate', () => {
  const pool = new OpenRouterKeyPool(
    'sk-or-v1-accountone11111111, sk-or-v1-accounttwo22222222'
  );
  const summary = pool.getSummary(1000);
  assert.equal(summary.totalKeys, 2);
  assert.equal(summary.activeKeys, 2);
  assert.equal(summary.dailyFreeLimitEstimate, 100);

  const firstAttempt = pool.getAttemptOrder(1000);
  const secondAttempt = pool.getAttemptOrder(1000);
  assert.equal(firstAttempt[0].masked, '****1111');
  assert.equal(secondAttempt[0].masked, '****2222');
});

test('OpenRouterKeyPool automatically skips rate-limited (429) key and falls back to healthy second key', () => {
  const k1 = 'sk-or-v1-accountone11111111';
  const k2 = 'sk-or-v1-accounttwo22222222';
  const pool = new OpenRouterKeyPool([k1, k2]);

  const now = 10_000;
  pool.markRateLimited(k1, 60_000, 'HTTP 429 daily limit', now);

  const order1 = pool.getAttemptOrder(now + 1000);
  const order2 = pool.getAttemptOrder(now + 2000);
  assert.deepEqual(
    order1.map((s) => s.key),
    [k2]
  );
  assert.deepEqual(
    order2.map((s) => s.key),
    [k2]
  );

  // After cooldown expires, key 1 becomes active again
  const afterCooldown = pool.getAttemptOrder(now + 65_000);
  assert.equal(afterCooldown.length, 2);
});

test('OPENROUTER_FREE_MODELS prioritizes openrouter/free and extractOpenRouterReplyText handles content + reasoning', () => {
  assert.equal(OPENROUTER_FREE_MODELS[0], 'openrouter/free');
  assert.equal(
    extractOpenRouterReplyText({
      choices: [{ message: { content: '  {"ok":true}  ' } }],
    }),
    '{"ok":true}'
  );
  assert.equal(
    extractOpenRouterReplyText({
      choices: [{ message: { content: '', reasoning: 'Thinking... {"ok":true}' } }],
    }),
    'Thinking... {"ok":true}'
  );
});
