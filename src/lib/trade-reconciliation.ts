import type { ExchangeId, ExecutionMode } from '../types.ts';
import type { NormalizedOkxOpenPosition, ReconcileablePosition } from './bot-engine-resilience.ts';

export type SystemRuntimePhase = 'RECOVERY' | 'READY' | 'DEGRADED';

export interface SystemRecoveryLogEntry {
  timestamp: number;
  phase: SystemRuntimePhase;
  okxSynced: boolean;
  instrumentCatalogVerified: boolean;
  matchedPositionsCount: number;
  orphanedExchangePositions: string[];
  missingLocalPositions: string[];
  note: string;
}

export interface StartupReconciliationVerdict {
  nextPhase: SystemRuntimePhase;
  allowNewLiveEntries: boolean;
  orphanedExchangePositions: NormalizedOkxOpenPosition[];
  blockedSymbols: string[];
  missingLocalPositionIds: string[];
  logEntry: SystemRecoveryLogEntry;
}

export function reconcileStartupState<T extends ReconcileablePosition>(params: {
  mode: ExecutionMode;
  activeExchange: ExchangeId;
  okxKeysConfigured: boolean;
  okxSyncOk: boolean;
  instrumentCatalogVerified: boolean;
  activePositions: T[];
  okxOpenPositions: NormalizedOkxOpenPosition[];
  nowTs?: number;
}): StartupReconciliationVerdict {
  const nowTs = params.nowTs ?? Date.now();

  if (params.mode !== 'LIVE' || params.activeExchange !== 'OKX') {
    const note = `Shadow / non-OKX-LIVE bypass (${params.mode}/${params.activeExchange}) -> READY`;
    return {
      nextPhase: 'READY',
      allowNewLiveEntries: true,
      orphanedExchangePositions: [],
      blockedSymbols: [],
      missingLocalPositionIds: [],
      logEntry: {
        timestamp: nowTs,
        phase: 'READY',
        okxSynced: params.okxSyncOk,
        instrumentCatalogVerified: params.instrumentCatalogVerified,
        matchedPositionsCount: 0,
        orphanedExchangePositions: [],
        missingLocalPositions: [],
        note,
      },
    };
  }

  if (!params.okxKeysConfigured || !params.okxSyncOk || !params.instrumentCatalogVerified) {
    const reasons: string[] = [];
    if (!params.okxKeysConfigured) reasons.push('OKX_KEYS_MISSING');
    if (!params.okxSyncOk) reasons.push('OKX_SYNC_FAILED');
    if (!params.instrumentCatalogVerified) reasons.push('OKX_INSTRUMENTS_UNVERIFIED');
    const note = `Startup recovery incomplete (${reasons.join(', ')}) -> DEGRADED`;
    return {
      nextPhase: 'DEGRADED',
      allowNewLiveEntries: false,
      orphanedExchangePositions: [],
      blockedSymbols: [],
      missingLocalPositionIds: [],
      logEntry: {
        timestamp: nowTs,
        phase: 'DEGRADED',
        okxSynced: params.okxSyncOk,
        instrumentCatalogVerified: params.instrumentCatalogVerified,
        matchedPositionsCount: 0,
        orphanedExchangePositions: [],
        missingLocalPositions: [],
        note,
      },
    };
  }

  const localLiveOkx = params.activePositions.filter((p) => p.mode === 'LIVE' && p.exchange === 'OKX');
  const localByKey = new Map<string, T>();
  for (const pos of localLiveOkx) {
    localByKey.set(`${pos.symbol.toUpperCase()}:${pos.side}`, pos);
  }

  const exchangeByKey = new Map<string, NormalizedOkxOpenPosition>();
  for (const exPos of params.okxOpenPositions) {
    exchangeByKey.set(`${exPos.symbol.toUpperCase()}:${exPos.side}`, exPos);
  }

  let matchedPositionsCount = 0;
  const orphanedExchangePositions: NormalizedOkxOpenPosition[] = [];
  const blockedSymbolsSet = new Set<string>();

  for (const [key, exPos] of exchangeByKey.entries()) {
    if (localByKey.has(key)) {
      matchedPositionsCount += 1;
    } else {
      // Unknown exchange position -> ORPHANED, do NOT auto-close; block new entries on this symbol
      orphanedExchangePositions.push(exPos);
      blockedSymbolsSet.add(exPos.symbol.toUpperCase());
    }
  }

  const missingLocalPositionIds: string[] = [];
  for (const [key, loc] of localByKey.entries()) {
    if (!exchangeByKey.has(key)) {
      missingLocalPositionIds.push(loc.id);
    }
  }

  const blockedSymbols = Array.from(blockedSymbolsSet);
  const note =
    orphanedExchangePositions.length > 0
      ? `READY with ${orphanedExchangePositions.length} ORPHANED OKX position(s) [${blockedSymbols.join(', ')}] (auto-close disabled, symbols blocked for new entries)`
      : `Clean OKX startup reconciliation: ${matchedPositionsCount} matched live position(s)`;

  return {
    nextPhase: 'READY',
    allowNewLiveEntries: true,
    orphanedExchangePositions,
    blockedSymbols,
    missingLocalPositionIds,
    logEntry: {
      timestamp: nowTs,
      phase: 'READY',
      okxSynced: true,
      instrumentCatalogVerified: true,
      matchedPositionsCount,
      orphanedExchangePositions: orphanedExchangePositions.map((p) => `${p.symbol}:${p.side}`),
      missingLocalPositions: missingLocalPositionIds,
      note,
    },
  };
}
