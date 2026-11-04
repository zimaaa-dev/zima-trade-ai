import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUpdatePackage,
  calculateBackupRetention,
  evaluateStorageQuota,
  type UpdatePackageInfo,
  type BackupRecord,
} from './updater-math.ts';

const mockPackage: UpdatePackageInfo = {
  version: 'v2.5.0-lts',
  channel: 'STABLE',
  releaseDate: '2026-10-31',
  sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
  minMemoryMb: 512,
  changelog: ['Hot-reload ONNX runtime', 'Bybit v5 linear rate limiter optimization'],
  breakingChanges: false,
};

test('Updater: Successfully validates package with matching SHA256 and sufficient RAM', () => {
  const result = validateUpdatePackage({
    currentVersion: 'v2.4.2-lts',
    pkg: mockPackage,
    actualSha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    availableMemoryMb: 1024,
    isPositionOpen: false,
  });

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('Updater: Rejects package with mismatched SHA256 signature', () => {
  const result = validateUpdatePackage({
    currentVersion: 'v2.4.2-lts',
    pkg: mockPackage,
    actualSha256: 'corrupted_hash_value_123',
    availableMemoryMb: 1024,
    isPositionOpen: false,
  });

  assert.equal(result.valid, false);
  assert.match(result.errors[0], /Несовпадение контрольной суммы SHA256/);
});

test('Updater: Rejects breaking update when open positions exist without safety close', () => {
  const breakingPkg: UpdatePackageInfo = {
    ...mockPackage,
    breakingChanges: true,
  };

  const result = validateUpdatePackage({
    currentVersion: 'v2.4.2-lts',
    pkg: breakingPkg,
    actualSha256: mockPackage.sha256,
    availableMemoryMb: 1024,
    isPositionOpen: true,
  });

  assert.equal(result.valid, false);
  assert.match(result.errors[0], /критические изменения ядра при наличии открытых позиций/);
});

test('Updater: Backup retention keeps stable checkpoints and prunes oldest regular backups', () => {
  const backups: BackupRecord[] = [
    { id: 'b1', timestamp: 1000, version: 'v2.0', sizeKb: 120, isStableCheckpoint: true, notes: 'Golden image' },
    { id: 'b2', timestamp: 2000, version: 'v2.1', sizeKb: 130, isStableCheckpoint: false, notes: 'Auto update' },
    { id: 'b3', timestamp: 3000, version: 'v2.2', sizeKb: 135, isStableCheckpoint: false, notes: 'Auto update' },
    { id: 'b4', timestamp: 4000, version: 'v2.3', sizeKb: 140, isStableCheckpoint: false, notes: 'Auto update' },
    { id: 'b5', timestamp: 5000, version: 'v2.4', sizeKb: 145, isStableCheckpoint: false, notes: 'Auto update' },
    { id: 'b6', timestamp: 6000, version: 'v2.4.1', sizeKb: 150, isStableCheckpoint: false, notes: 'Auto update' },
  ];

  const { toKeep, toPrune } = calculateBackupRetention(backups, 4);

  // Stable checkpoint 'b1' must be preserved even though it's oldest!
  const hasStable = toKeep.some((b) => b.id === 'b1');
  assert.equal(hasStable, true);
  assert.equal(toPrune.length, 2);
  assert.equal(toKeep.length, 4);
});

test('Updater: Storage quota triggers S3 offload when over 90% of 10GB limit', () => {
  const maxBytes = 10 * 1024 * 1024 * 1024; // 10 GB
  const safeBytes = 5 * 1024 * 1024 * 1024; // 5 GB
  const safeStatus = evaluateStorageQuota(safeBytes, maxBytes, true);
  assert.equal(safeStatus.isOverQuota, false);
  assert.equal(safeStatus.actionRequired, 'NONE');

  const highBytes = 9.5 * 1024 * 1024 * 1024; // 9.5 GB = 95%
  const highStatus = evaluateStorageQuota(highBytes, maxBytes, true);
  assert.equal(highStatus.isOverQuota, true);
  assert.equal(highStatus.actionRequired, 'S3_OFFLOAD');
  assert.equal(highStatus.bytesToPurge > 0, true);
});
