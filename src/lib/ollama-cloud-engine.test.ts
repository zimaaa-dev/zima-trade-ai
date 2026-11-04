import test from 'node:test';
import assert from 'node:assert/strict';
import { OllamaCloudEngine, OLLAMA_CLOUD_MODELS } from './ollama-cloud-engine.ts';

test('OllamaCloudEngine: Initializes and parses multiple API keys with deduplication and masking', () => {
  const engine = new OllamaCloudEngine({
    keys: 'key_alpha_123456, key_beta_789012\nkey_gamma_345678, key_alpha_123456',
    defaultModel: 'nemotron-3-nano:30b',
  });

  const status = engine.getPoolStatus();
  assert.equal(status.totalKeys, 3);
  assert.equal(status.activeKeys, 3);
  assert.equal(status.selectedModel, 'nemotron-3-nano:30b');
  assert.equal(status.keys[0].masked.startsWith('key_'), true);
  assert.equal(status.keys[0].masked.endsWith('3456'), true);
});

test('OllamaCloudEngine: Rotates keys sequentially in Round-Robin fashion', () => {
  const engine = new OllamaCloudEngine({
    keys: ['key_one_123456', 'key_two_234567', 'key_three_345678'],
  });

  const k1 = engine.acquireNextKey();
  const k2 = engine.acquireNextKey();
  const k3 = engine.acquireNextKey();
  const k4 = engine.acquireNextKey();

  assert.equal(k1?.rawKey, 'key_one_123456');
  assert.equal(k2?.rawKey, 'key_two_234567');
  assert.equal(k3?.rawKey, 'key_three_345678');
  assert.equal(k4?.rawKey, 'key_one_123456'); // Loops back
  assert.equal(engine.getPoolStatus().totalRotations, 4);
});

test('OllamaCloudEngine: Automatically puts rate-limited (429) key into cooldown and selects next key', () => {
  const engine = new OllamaCloudEngine({
    keys: ['key_limited_123', 'key_healthy_456'],
  });

  const k1 = engine.acquireNextKey()!;
  assert.equal(k1.rawKey, 'key_limited_123');

  // Simulate 429 Rate Limit on key 1
  engine.reportKeyFailure(k1, 429, 'Too Many Requests - Rate limit exceeded');
  assert.equal(k1.status, 'COOLDOWN');
  assert.ok(k1.cooldownUntil > Date.now());

  // Next acquisition must automatically bypass key 1 and give key 2
  const k2 = engine.acquireNextKey()!;
  assert.equal(k2.rawKey, 'key_healthy_456');
  assert.equal(k2.status, 'ACTIVE');

  // Next acquisition should still skip key 1 because it is in cooldown
  const k3 = engine.acquireNextKey()!;
  assert.equal(k3.rawKey, 'key_healthy_456');
});

test('OllamaCloudEngine: Validates all user requested cloud models exist in model list', () => {
  const expectedModels = [
    'nemotron-3-nano:30b',
    'gpt-oss:20b',
    'gemma4:31b',
    'nemotron-3-super',
    'gpt-oss:120b',
    'nemotron-3-ultra',
    'beam',
  ];

  for (const model of expectedModels) {
    assert.ok(
      OLLAMA_CLOUD_MODELS.includes(model as any),
      `Model ${model} must be present in supported OLLAMA_CLOUD_MODELS`
    );
  }
});
