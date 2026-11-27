import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldSyncFileToRepo,
  resolveGitHubTokenFromEnv,
  buildGitBasicAuthHeader,
  redactGitHubSecrets,
} from './github-push.ts';

test('shouldSyncFileToRepo allows source files and blocks secrets, runtime state, and build dirs', () => {
  assert.equal(shouldSyncFileToRepo('server.ts'), true);
  assert.equal(shouldSyncFileToRepo('src/lib/wallet-math.ts'), true);
  assert.equal(shouldSyncFileToRepo('.env.example'), true);
  assert.equal(shouldSyncFileToRepo('zima_trade_ai/.env.example'), true);
  assert.equal(shouldSyncFileToRepo('docs/ARCHITECTURE.md'), true);

  assert.equal(shouldSyncFileToRepo('.env'), false);
  assert.equal(shouldSyncFileToRepo('.env.local'), false);
  assert.equal(shouldSyncFileToRepo('zima_trade_ai/.env'), false);
  assert.equal(shouldSyncFileToRepo('data/runtime_state.json'), false);
  assert.equal(shouldSyncFileToRepo('data/auth_config.json'), false);
  assert.equal(shouldSyncFileToRepo('node_modules/express/index.js'), false);
  assert.equal(shouldSyncFileToRepo('.git/config'), false);
  assert.equal(shouldSyncFileToRepo('dist/index.html'), false);
  assert.equal(shouldSyncFileToRepo('public/assets/aistudio/IMG_6685.png'), false);
  assert.equal(shouldSyncFileToRepo('.playwright-cli/test.png'), false);
  assert.equal(shouldSyncFileToRepo('models/model.onnx'), false);
  assert.equal(shouldSyncFileToRepo('.github/workflows/ci.yml'), false);
});

test('resolveGitHubTokenFromEnv finds standard and custom GitHub secret names without matching repo URLs', () => {
  const sample = 'ghp_1234567890abcdefghij1234567890';
  const r1 = resolveGitHubTokenFromEnv({
    GITHUB_REPO_URL: 'https://github.com/zimaaa-dev/zima-trade-ai.git',
    GitHub: sample,
  });
  assert.equal(r1.envVarName, 'GitHub');
  assert.equal(r1.token, sample);

  const r2 = resolveGitHubTokenFromEnv({
    GITHUB_TOKEN: sample,
    GitHub: 'other_token_12345678901234567890',
  });
  assert.equal(r2.envVarName, 'GITHUB_TOKEN');
  assert.equal(r2.token, sample);

  const r3 = resolveGitHubTokenFromEnv({
    GITHUB_REPO_URL: 'https://github.com/zimaaa-dev/zima-trade-ai.git',
  });
  assert.equal(r3.token, null);
});

test('buildGitBasicAuthHeader and redactGitHubSecrets mask raw and base64 tokens', () => {
  const sample = 'ghp_1234567890abcdefghij1234567890';
  const header = buildGitBasicAuthHeader(sample);
  assert.ok(header.startsWith('Authorization: Basic '));
  const redacted = redactGitHubSecrets(`error with ${sample} and ${header}`, sample);
  assert.equal(redacted.includes(sample), false);
  assert.equal(redacted.includes(header.replace('Authorization: Basic ', '')), false);
  assert.ok(redacted.includes('[REDACTED]'));
});
