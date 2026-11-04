// ZimaTrade AI - Updater & Maintenance Logic

export interface UpdatePackageInfo {
  version: string;
  channel: 'STABLE' | 'BETA' | 'NIGHTLY';
  releaseDate: string;
  sha256: string;
  minMemoryMb: number;
  changelog: string[];
  breakingChanges: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BackupRecord {
  id: string;
  timestamp: number;
  version: string;
  sizeKb: number;
  isStableCheckpoint: boolean;
  notes: string;
}

export interface StorageQuotaStatus {
  currentBytes: number;
  maxBytes: number;
  usagePct: number;
  isOverQuota: boolean;
  actionRequired: 'NONE' | 'S3_OFFLOAD' | 'FIFO_PURGE';
  bytesToPurge: number;
}

/**
 * Validates whether an OTA update package can be safely applied without reinstalling
 */
export function validateUpdatePackage(params: {
  currentVersion: string;
  pkg: UpdatePackageInfo;
  actualSha256: string;
  availableMemoryMb: number;
  isPositionOpen: boolean;
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // SHA256 integrity check
  if (params.pkg.sha256.toLowerCase() !== params.actualSha256.toLowerCase()) {
    errors.push(`Несовпадение контрольной суммы SHA256. Ожидалось: ${params.pkg.sha256}, получено: ${params.actualSha256}`);
  }

  // Memory availability check
  if (params.availableMemoryMb < params.pkg.minMemoryMb) {
    errors.push(`Недостаточно свободной оперативной памяти: требуется ${params.pkg.minMemoryMb} МБ, доступно ${params.availableMemoryMb} МБ`);
  }

  // Position protection warning
  if (params.isPositionOpen) {
    if (params.pkg.breakingChanges) {
      errors.push('Обновление содержит критические изменения ядра при наличии открытых позиций. Требуется закрыть позиции или применить отложенное обновление.');
    } else {
      warnings.push('Внимание: Обновление применяется при открытых позициях в режиме Hot-Reload без разрыва связи.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Calculates backup retention to prevent disk exhaustion while keeping stable points
 */
export function calculateBackupRetention(backups: BackupRecord[], maxKeep: number = 5): { toKeep: BackupRecord[]; toPrune: BackupRecord[] } {
  if (backups.length <= maxKeep) {
    return { toKeep: [...backups], toPrune: [] };
  }

  // Always keep stable checkpoints, prune oldest regular backups first
  const stable = backups.filter((b) => b.isStableCheckpoint);
  const regular = backups.filter((b) => !b.isStableCheckpoint).sort((a, b) => b.timestamp - a.timestamp);

  const regularToKeepCount = Math.max(1, maxKeep - stable.length);
  const regularKept = regular.slice(0, regularToKeepCount);
  const regularPruned = regular.slice(regularToKeepCount);

  const toKeep = [...stable, ...regularKept].sort((a, b) => b.timestamp - a.timestamp);
  return {
    toKeep,
    toPrune: regularPruned,
  };
}

/**
 * Evaluates 10GB Local Parquet Ring Storage quota and triggers FIFO / S3 rules
 */
export function evaluateStorageQuota(currentBytes: number, maxBytes: number = 10 * 1024 * 1024 * 1024, s3Enabled: boolean = true): StorageQuotaStatus {
  const usagePct = (currentBytes / maxBytes) * 100;
  const isOverQuota = currentBytes >= maxBytes * 0.9; // 90% soft-cap threshold

  let actionRequired: 'NONE' | 'S3_OFFLOAD' | 'FIFO_PURGE' = 'NONE';
  let bytesToPurge = 0;

  if (isOverQuota) {
    bytesToPurge = currentBytes - Math.floor(maxBytes * 0.75); // Target 75% usage
    actionRequired = s3Enabled ? 'S3_OFFLOAD' : 'FIFO_PURGE';
  }

  return {
    currentBytes,
    maxBytes,
    usagePct: Number(usagePct.toFixed(2)),
    isOverQuota,
    actionRequired,
    bytesToPurge: Math.max(0, bytesToPurge),
  };
}

export interface GitCommitItem {
  hash: string;
  author: string;
  relativeTime: string;
  message: string;
  date?: string;
}

export interface GitHubSyncStatus {
  repoUrl: string;
  branch: string;
  currentCommit: GitCommitItem;
  remoteCommit?: GitCommitItem;
  isUpToDate: boolean;
  commitsBehind: number;
  commitsAhead: number;
  isClean: boolean;
  recentCommits: GitCommitItem[];
  incomingCommits: GitCommitItem[];
  lastCheckedAt: number;
  autoSyncEnabled: boolean;
  error?: string | null;
}

