import { fromOkxSwapInstId, toOkxSwapInstId, type OkxPositionMode } from './okx-exchange.ts';

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
  mgnMode?: string;
  avgPx?: string;
  markPx?: string;
  upl?: string;
  uplRatio?: string;
  margin?: string;
  imr?: string;
  lever?: string;
  cTime?: string;
  uTime?: string;
}

export interface NormalizedOkxOpenPosition {
  instId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  posSide: string;
  mgnMode: string;
  posContracts: number;
  avgPx: number;
  markPx: number;
  uplUsdt: number;
  marginUsdt: number;
  lever: number;
  createdAt: number;
  updatedAt: number;
}

export function normalizeOkxOpenPositions(
  okxOpenPositions: OkxRawPositionItem[],
  okxPosMode: OkxPositionMode
): NormalizedOkxOpenPosition[] {
  const result: NormalizedOkxOpenPosition[] = [];
  for (const raw of okxOpenPositions) {
    const posQty = parseFloat(String(raw?.pos || '0'));
    if (!Number.isFinite(posQty) || Math.abs(posQty) <= 0) continue;

    const symbol = fromOkxSwapInstId(raw.instId);
    if (!symbol) continue;

    const rawPosSide = String(raw.posSide || 'net').toLowerCase();
    const side: 'LONG' | 'SHORT' =
      okxPosMode === 'long_short_mode'
        ? rawPosSide === 'short'
          ? 'SHORT'
          : 'LONG'
        : posQty >= 0
        ? 'LONG'
        : 'SHORT';

    const avgPx = parseFloat(String(raw.avgPx || '0'));
    const markPx = parseFloat(String(raw.markPx || raw.avgPx || '0'));
    const upl = parseFloat(String(raw.upl || '0'));
    const margin = parseFloat(String(raw.margin || raw.imr || '0'));
    const lever = parseFloat(String(raw.lever || '0'));

    result.push({
      instId: String(raw.instId || '').toUpperCase(),
      symbol,
      side,
      posSide: rawPosSide,
      mgnMode: String(raw.mgnMode || 'isolated'),
      posContracts: posQty,
      avgPx: Number.isFinite(avgPx) && avgPx > 0 ? avgPx : 0,
      markPx: Number.isFinite(markPx) && markPx > 0 ? markPx : 0,
      uplUsdt: Number.isFinite(upl) ? Number(upl.toFixed(4)) : 0,
      marginUsdt: Number.isFinite(margin) ? Number(margin.toFixed(4)) : 0,
      lever: Number.isFinite(lever) && lever > 0 ? lever : 0,
      createdAt: Number(raw.cTime || 0) || 0,
      updatedAt: Number(raw.uTime || 0) || 0,
    });
  }
  return result;
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

export interface OkxPositionsHistoryRow {
  instId: string;
  uTime?: number | string;
  closeAvgPx?: number | string;
}

export function reconcileOkxLivePositions<T extends ReconcileablePosition>(params: {
  activePositions: T[];
  okxOpenPositions: OkxRawPositionItem[];
  okxPosMode: OkxPositionMode;
  okxPositionsHistory?: OkxPositionsHistoryRow[];
  unconfirmedMaxAgeMs?: number;
  previousMissingStreaks?: Record<string, number>;
  minConsecutiveMisses?: number;
  gracePeriodMs?: number;
  nowTs?: number;
}): OkxReconciliationResult<T> {
  const {
    activePositions,
    okxOpenPositions,
    okxPosMode,
    okxPositionsHistory,
    unconfirmedMaxAgeMs = 6 * 3600_000,
    previousMissingStreaks = {},
    minConsecutiveMisses = 2,
    gracePeriodMs = 90_000,
    nowTs = Date.now(),
  } = params;

  const normalized = normalizeOkxOpenPositions(okxOpenPositions, okxPosMode);
  const liveMap = new Map<string, { side: 'LONG' | 'SHORT'; markPx: number }>();

  for (const item of normalized) {
    liveMap.set(`${item.symbol}:${item.side}`, {
      side: item.side,
      markPx: item.markPx,
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

    if (Array.isArray(okxPositionsHistory)) {
      const targetInstId = toOkxSwapInstId(pos.symbol);
      const confirmedClosedInHistory = okxPositionsHistory.some((h) => {
        if (String(h?.instId || '').toUpperCase() !== targetInstId) return false;
        const uTime = Number(h?.uTime || 0);
        if (!Number.isFinite(uTime) || uTime <= 0) return false;
        return openedAt > 0 ? uTime >= openedAt + 5_000 : true;
      });
      const isRecentOrUnconfirmed = openedAt === 0 || nowTs - openedAt < unconfirmedMaxAgeMs;
      if (!confirmedClosedInHistory && isRecentOrUnconfirmed) {
        continue;
      }
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

export function buildOkxPositionDiff<T extends ReconcileablePosition>(params: {
  activePositions: T[];
  okxOpenPositions: OkxRawPositionItem[];
  okxPosMode: OkxPositionMode;
  missingStreaks?: Record<string, number>;
}): {
  okxPositions: Array<NormalizedOkxOpenPosition & { inTerminal: boolean; terminalPositionId?: string }>;
  strayExchangePositions: NormalizedOkxOpenPosition[];
  terminalLiveOkxPositions: Array<{
    id: string;
    symbol: string;
    side: 'LONG' | 'SHORT';
    openedAt: number;
    onExchange: boolean;
    missingStreak: number;
  }>;
} {
  const { activePositions, okxOpenPositions, okxPosMode, missingStreaks = {} } = params;
  const normalized = normalizeOkxOpenPositions(okxOpenPositions, okxPosMode);

  const terminalByKey = new Map<string, T>();
  const liveOkxPosList: T[] = [];
  for (const p of activePositions) {
    if (p.mode === 'LIVE' && p.exchange === 'OKX') {
      liveOkxPosList.push(p);
      terminalByKey.set(`${p.symbol}:${p.side}`, p);
    }
  }

  const exchangeKeys = new Set<string>();
  const okxPositions = normalized.map((item) => {
    const key = `${item.symbol}:${item.side}`;
    exchangeKeys.add(key);
    const term = terminalByKey.get(key);
    return {
      ...item,
      inTerminal: Boolean(term),
      terminalPositionId: term?.id,
    };
  });

  const strayExchangePositions = normalized.filter((item) => !terminalByKey.has(`${item.symbol}:${item.side}`));
  const terminalLiveOkxPositions = liveOkxPosList.map((p) => ({
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    openedAt: Number(p.openedAt || 0),
    onExchange: exchangeKeys.has(`${p.symbol}:${p.side}`),
    missingStreak: missingStreaks[p.id] || 0,
  }));

  return {
    okxPositions,
    strayExchangePositions,
    terminalLiveOkxPositions,
  };
}

export interface MergedPositionsSummary {
  correlationPositions: Array<{ symbol: string; side: 'LONG' | 'SHORT' }>;
  openSymbolsSet: Set<string>;
  strayOkxPositions: NormalizedOkxOpenPosition[];
  terminalCount: number;
  exchangeStrayCount: number;
  totalLiveCount: number;
  terminalFloatingPnlUsdt: number;
  strayFloatingPnlUsdt: number;
  totalFloatingPnlUsdt: number;
}

/**
 * Unifies terminal-tracked positions with live OKX exchange positions so:
 * - Risk Firewall / Correlation Cap never ignores exchange-only (stray) positions
 * - OKX net_mode duplicate entries on already-open symbols are strictly prevented
 * - Telegram status & position commands report the true exchange count instead of hiding stray positions
 */
export function mergeTerminalAndOkxPositionsSummary(params: {
  activePositions: Array<{
    symbol: string;
    side: 'LONG' | 'SHORT';
    unrealizedPnl?: number;
    mode?: string;
    exchange?: string;
  }>;
  okxCachedOpenPositions?: NormalizedOkxOpenPosition[];
  includeOkxExchange?: boolean;
}): MergedPositionsSummary {
  const { activePositions, okxCachedOpenPositions = [], includeOkxExchange = true } = params;
  const seenKeys = new Set<string>();
  const openSymbolsSet = new Set<string>();
  const correlationPositions: Array<{ symbol: string; side: 'LONG' | 'SHORT' }> = [];

  let terminalFloatingPnlUsdt = 0;
  for (const p of activePositions) {
    const sym = String(p.symbol || '').toUpperCase();
    const side = p.side === 'SHORT' ? 'SHORT' : 'LONG';
    const key = `${sym}:${side}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      correlationPositions.push({ symbol: sym, side });
    }
    openSymbolsSet.add(sym);
    terminalFloatingPnlUsdt += Number(p.unrealizedPnl) || 0;
  }

  const strayOkxPositions: NormalizedOkxOpenPosition[] = [];
  let strayFloatingPnlUsdt = 0;
  if (includeOkxExchange && Array.isArray(okxCachedOpenPositions)) {
    for (const ox of okxCachedOpenPositions) {
      const sym = String(ox.symbol || '').toUpperCase();
      const side = ox.side === 'SHORT' ? 'SHORT' : 'LONG';
      const key = `${sym}:${side}`;
      openSymbolsSet.add(sym);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        correlationPositions.push({ symbol: sym, side });
        strayOkxPositions.push(ox);
        strayFloatingPnlUsdt += Number(ox.uplUsdt) || 0;
      }
    }
  }

  const terminalRounded = Number(terminalFloatingPnlUsdt.toFixed(2));
  const strayRounded = Number(strayFloatingPnlUsdt.toFixed(2));
  return {
    correlationPositions,
    openSymbolsSet,
    strayOkxPositions,
    terminalCount: activePositions.length,
    exchangeStrayCount: strayOkxPositions.length,
    totalLiveCount: activePositions.length + strayOkxPositions.length,
    terminalFloatingPnlUsdt: terminalRounded,
    strayFloatingPnlUsdt: strayRounded,
    totalFloatingPnlUsdt: Number((terminalRounded + strayRounded).toFixed(2)),
  };
}

