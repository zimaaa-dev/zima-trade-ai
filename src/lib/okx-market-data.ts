import type { ExchangeId, ExecutionMode } from '../types.ts';
import type { OrderbookL2 } from './engine-math.ts';
import type { KlineBar } from './bot-learning-math.ts';

export type MarketDataSourceKind = 'OKX_REST_WS' | 'BYBIT_FALLBACK' | 'SYNTHETIC_FALLBACK' | 'STALE_CACHE';

export interface OkxMarketSnapshotMeta {
  exchange: ExchangeId;
  instId: string;
  symbol: string;
  sourceKind: MarketDataSourceKind;
  exchangeTs: number;
  localTs: number;
  ageMs: number;
  seqId: number | null;
  checksum: number | null;
  connectionOk: boolean;
  complete: boolean;
  wsConnected?: boolean;
}

export interface MarketDataGateVerdict {
  allowed: boolean;
  reason?: string;
  meta: OkxMarketSnapshotMeta;
}

export const DEFAULT_MAX_ORDERBOOK_AGE_MS = 12_000;
export const DEFAULT_MAX_KLINE_STALENESS_MS = 20 * 60_000;

export function buildMarketSnapshotMeta(params: {
  exchange: ExchangeId;
  instId: string;
  symbol: string;
  sourceKind: MarketDataSourceKind;
  exchangeTs: number;
  localTs: number;
  seqId?: number | null;
  checksum?: number | null;
  connectionOk: boolean;
  complete: boolean;
  wsConnected?: boolean;
  nowTs?: number;
}): OkxMarketSnapshotMeta {
  const nowTs = params.nowTs ?? Date.now();
  const refTs = params.localTs > 0 ? params.localTs : params.exchangeTs;
  const ageMs = refTs > 0 ? Math.max(0, nowTs - refTs) : Number.POSITIVE_INFINITY;
  return {
    exchange: params.exchange,
    instId: params.instId,
    symbol: params.symbol.toUpperCase(),
    sourceKind: params.sourceKind,
    exchangeTs: params.exchangeTs,
    localTs: params.localTs,
    ageMs,
    seqId: params.seqId ?? null,
    checksum: params.checksum ?? null,
    connectionOk: params.connectionOk,
    complete: params.complete,
    wsConnected: params.wsConnected,
  };
}

export function validateOkxOrderbookFreshness(params: {
  book: OrderbookL2 | null | undefined;
  meta: OkxMarketSnapshotMeta;
  mode: ExecutionMode;
  activeExchange: ExchangeId;
  maxAgeMs?: number;
  previousSeqId?: number | null;
}): MarketDataGateVerdict {
  const maxAgeMs = params.maxAgeMs ?? DEFAULT_MAX_ORDERBOOK_AGE_MS;
  const { book, meta, mode, activeExchange, previousSeqId } = params;

  if (mode === 'LIVE' && activeExchange === 'OKX') {
    if (meta.exchange !== 'OKX' || meta.sourceKind !== 'OKX_REST_WS') {
      return {
        allowed: false,
        reason: `OKX_LIVE_FORBIDS_NON_OKX_DATA:${meta.sourceKind}`,
        meta,
      };
    }
  }

  if (!meta.connectionOk) {
    return {
      allowed: false,
      reason: 'OKX_MARKET_DATA_CONNECTION_LOST',
      meta,
    };
  }

  if (!meta.complete || !book || !Array.isArray(book.bids) || !Array.isArray(book.asks) || book.bids.length === 0 || book.asks.length === 0) {
    return {
      allowed: false,
      reason: 'OKX_ORDERBOOK_INCOMPLETE',
      meta,
    };
  }

  const bestBid = book.bids[0]?.price ?? 0;
  const bestAsk = book.asks[0]?.price ?? 0;
  if (!(bestBid > 0 && bestAsk > 0 && bestAsk >= bestBid)) {
    return {
      allowed: false,
      reason: 'OKX_ORDERBOOK_CROSSED_OR_ZERO',
      meta,
    };
  }

  if (!Number.isFinite(meta.ageMs) || meta.ageMs > maxAgeMs) {
    return {
      allowed: false,
      reason: `OKX_ORDERBOOK_STALE_${Math.round(meta.ageMs)}MS`,
      meta,
    };
  }

  if (
    typeof previousSeqId === 'number' &&
    previousSeqId > 0 &&
    typeof meta.seqId === 'number' &&
    meta.seqId > 0 &&
    meta.seqId < previousSeqId
  ) {
    return {
      allowed: false,
      reason: `OKX_ORDERBOOK_SEQ_REGRESSION:${meta.seqId}<${previousSeqId}`,
      meta,
    };
  }

  return { allowed: true, meta };
}

export function validateOkxKlinesIntegrity(params: {
  bars: KlineBar[] | null | undefined;
  sourceExchange: ExchangeId;
  sourceKind: MarketDataSourceKind;
  mode: ExecutionMode;
  activeExchange: ExchangeId;
  minBars?: number;
  intervalMs?: number;
  nowTs?: number;
}): {
  allowed: boolean;
  reason?: string;
  closedBars: KlineBar[];
  latestBarAgeMs: number;
} {
  const minBars = params.minBars ?? 15;
  const intervalMs = params.intervalMs ?? 15 * 60_000;
  const nowTs = params.nowTs ?? Date.now();
  const bars = Array.isArray(params.bars) ? params.bars : [];

  if (params.mode === 'LIVE' && params.activeExchange === 'OKX') {
    if (params.sourceExchange !== 'OKX' || params.sourceKind !== 'OKX_REST_WS') {
      return {
        allowed: false,
        reason: `OKX_LIVE_FORBIDS_NON_OKX_KLINES:${params.sourceKind}`,
        closedBars: [],
        latestBarAgeMs: Number.POSITIVE_INFINITY,
      };
    }
  }

  if (bars.length < minBars) {
    return {
      allowed: false,
      reason: `OKX_KLINES_INSUFFICIENT:${bars.length}<${minBars}`,
      closedBars: [],
      latestBarAgeMs: Number.POSITIVE_INFINITY,
    };
  }

  // Verify chronological ordering & drop trailing unclosed candle when confirm === '0' or timestamp inside current interval
  const sorted = bars
    .filter((b) => Number.isFinite(b.timestamp) && b.timestamp > 0 && b.close > 0)
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);

  if (sorted.length < minBars) {
    return {
      allowed: false,
      reason: 'OKX_KLINES_INVALID_TIMESTAMPS',
      closedBars: [],
      latestBarAgeMs: Number.POSITIVE_INFINITY,
    };
  }

  const last = sorted[sorted.length - 1];
  const isTrailingUnclosed =
    (last as KlineBar & { confirm?: string }).confirm === '0' ||
    nowTs - last.timestamp < intervalMs;
  const closedBars = isTrailingUnclosed && sorted.length - 1 >= minBars ? sorted.slice(0, -1) : sorted;

  const latestClosed = closedBars[closedBars.length - 1];
  const latestBarAgeMs = Math.max(0, nowTs - latestClosed.timestamp);
  const maxStalenessMs = Math.max(DEFAULT_MAX_KLINE_STALENESS_MS, intervalMs * 3);
  if (latestBarAgeMs > maxStalenessMs) {
    return {
      allowed: false,
      reason: `OKX_KLINES_STALE_${Math.round(latestBarAgeMs / 1000)}S`,
      closedBars,
      latestBarAgeMs,
    };
  }

  return {
    allowed: true,
    closedBars,
    latestBarAgeMs,
  };
}

export function canUseMarketDataForLiveEntry(params: {
  mode: ExecutionMode;
  activeExchange: ExchangeId;
  orderbookVerdict: MarketDataGateVerdict;
  klinesValid: boolean;
  klinesReason?: string;
  tickersHealthy: boolean;
}): { allowed: boolean; reason?: string } {
  if (params.mode !== 'LIVE' || params.activeExchange !== 'OKX') {
    return { allowed: true };
  }
  if (!params.tickersHealthy) {
    return { allowed: false, reason: 'OKX_LIVE_TICKERS_UNAVAILABLE' };
  }
  if (!params.orderbookVerdict.allowed) {
    return { allowed: false, reason: params.orderbookVerdict.reason || 'OKX_ORDERBOOK_REJECTED' };
  }
  if (!params.klinesValid) {
    return { allowed: false, reason: params.klinesReason || 'OKX_KLINES_REJECTED' };
  }
  return { allowed: true };
}
