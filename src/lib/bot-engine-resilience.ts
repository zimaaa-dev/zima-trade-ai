import { fromOkxSwapInstId, type OkxPositionMode } from './okx-exchange.ts';

export interface BotCycleWatchdogState {
  isRunning: boolean;
  activeRunId: number;
  startedAt: number | null;
  lastCompletedAt: number | null;
  lastRecoveredAt: number | null;
  consecutiveTimeouts: number;
  totalRecoveredLocks: number;
}

export function createBotCycleWatchdogState(): BotCycleWatchdogState {
  return {
    isRunning: false,
    activeRunId: 0,
    startedAt: null,
    lastCompletedAt: null,
    lastRecoveredAt: null,
    consecutiveTimeouts: 0,
    totalRecoveredLocks: 0,
  };
}

export function acquireBotCycleLock(
  state: BotCycleWatchdogState,
  nowTs: number = Date.now(),
  maxLockMs: number = 30_000
): {
  acquired: boolean;
  runId: number;
  staleRecovered: boolean;
  staleDurationMs: number;
} {
  if (!state.isRunning) {
    state.activeRunId += 1;
    state.isRunning = true;
    state.startedAt = nowTs;
    return {
      acquired: true,
      runId: state.activeRunId,
      staleRecovered: false,
      staleDurationMs: 0,
    };
  }

  const startedAt = state.startedAt ?? nowTs;
  const elapsed = Math.max(0, nowTs - startedAt);
  if (elapsed >= maxLockMs) {
    state.activeRunId += 1;
    state.isRunning = true;
    state.startedAt = nowTs;
    state.lastRecoveredAt = nowTs;
    state.consecutiveTimeouts += 1;
    state.totalRecoveredLocks += 1;
    return {
      acquired: true,
      runId: state.activeRunId,
      staleRecovered: true,
      staleDurationMs: elapsed,
    };
  }

  return {
    acquired: false,
    runId: state.activeRunId,
    staleRecovered: false,
    staleDurationMs: elapsed,
  };
}

export function releaseBotCycleLock(
  state: BotCycleWatchdogState,
  runId: number,
  nowTs: number = Date.now(),
  options?: { timedOutOrFailed?: boolean }
): boolean {
  if (state.activeRunId !== runId) {
    return false;
  }
  state.isRunning = false;
  state.startedAt = null;
  if (!options?.timedOutOrFailed) {
    state.lastCompletedAt = nowTs;
    state.consecutiveTimeouts = 0;
  }
  return true;
}

export async function runWithHardTimeout<T>(
  work: () => Promise<T>,
  timeoutMs: number,
  label: string = 'ASYNC_OPERATION'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label}_TIMEOUT_${timeoutMs}MS`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface OkxRawPositionItem {
  instId: string;
  pos: string;
  posSide?: string;
  avgPx?: string;
  markPx?: string;
  upl?: string;
}

export interface ReconcileablePosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  mode?: string;
  exchange?: string;
  openedAt?: number;
  currentPrice?: number;
}

export interface OkxReconciliationResult<T extends ReconcileablePosition> {
  orphanedPositions: T[];
  syncedMarkPrices: Record<string, number>;
  updatedStreaks: Record<string, number>;
  activeExchangeKeys: string[];
}

export function reconcileOkxLivePositions<T extends ReconcileablePosition>(params: {
  activePositions: T[];
  okxOpenPositions: OkxRawPositionItem[];
  okxPosMode: OkxPositionMode;
  previousMissingStreaks?: Record<string, number>;
  minConsecutiveMisses?: number;
  gracePeriodMs?: number;
  nowTs?: number;
}): OkxReconciliationResult<T> {
  const {
    activePositions,
    okxOpenPositions,
    okxPosMode,
    previousMissingStreaks = {},
    minConsecutiveMisses = 2,
    gracePeriodMs = 90_000,
    nowTs = Date.now(),
  } = params;

  const liveMap = new Map<string, { side: 'LONG' | 'SHORT'; markPx: number }>();

  for (const raw of okxOpenPositions) {
    const posQty = parseFloat(String(raw?.pos || '0'));
    if (!Number.isFinite(posQty) || Math.abs(posQty) <= 0) continue;

    const symbol = fromOkxSwapInstId(raw.instId);
    if (!symbol) continue;

    const rawPosSide = String(raw.posSide || '').toLowerCase();
    const side: 'LONG' | 'SHORT' =
      okxPosMode === 'long_short_mode'
        ? rawPosSide === 'short'
          ? 'SHORT'
          : 'LONG'
        : posQty >= 0
        ? 'LONG'
        : 'SHORT';

    const key = okxPosMode === 'long_short_mode' ? `${symbol}:${side}` : `${symbol}:${side}`;
    const markPx = parseFloat(String(raw.markPx || raw.avgPx || '0'));
    liveMap.set(key, {
      side,
      markPx: Number.isFinite(markPx) && markPx > 0 ? markPx : 0,
    });
  }

  const orphanedPositions: T[] = [];
  const syncedMarkPrices: Record<string, number> = {};
  const updatedStreaks: Record<string, number> = {};

  for (const pos of activePositions) {
    if (pos.mode !== 'LIVE' || pos.exchange !== 'OKX') {
      continue;
    }

    const openedAt = Number(pos.openedAt || 0);
    if (openedAt > 0 && nowTs - openedAt < gracePeriodMs) {
      continue;
    }

    const matchKey = `${pos.symbol}:${pos.side}`;
    const liveMatch = liveMap.get(matchKey);

    if (liveMatch) {
      if (liveMatch.markPx > 0) {
        syncedMarkPrices[pos.symbol] = liveMatch.markPx;
      }
      continue;
    }

    const nextStreak = (previousMissingStreaks[pos.id] || 0) + 1;
    if (nextStreak >= Math.max(1, minConsecutiveMisses)) {
      orphanedPositions.push(pos);
    } else {
      updatedStreaks[pos.id] = nextStreak;
    }
  }

  return {
    orphanedPositions,
    syncedMarkPrices,
    updatedStreaks,
    activeExchangeKeys: Array.from(liveMap.keys()),
  };
}
